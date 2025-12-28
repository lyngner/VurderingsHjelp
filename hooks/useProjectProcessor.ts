
import React, { useState, useEffect } from 'react';
import { Project, Page } from '../types';
import { processFileToImages, cropImageFromBase64 } from '../services/fileService';
import { getMedia, saveMedia } from '../services/storageService';
import { 
  transcribeAndAnalyzeImage, 
  analyzeTextContent, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate 
} from '../services/geminiService';

export const useProjectProcessor = (
  activeProject: Project | null, 
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>
) => {
  const [processingCount, setProcessingCount] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCompleted, setBatchCompleted] = useState(0);
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });

  useEffect(() => {
    if (processingCount === 0 && !rubricStatus.loading && batchTotal > 0) {
      const timer = setTimeout(() => {
        setBatchTotal(0);
        setBatchCompleted(0);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [processingCount, rubricStatus.loading, batchTotal]);

  const updateActiveProject = (updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || (proj.taskFiles?.length || 0) === 0) return;
    setRubricStatus({ loading: true, text: 'KI-analyse av oppgaver...' });
    try {
      const taskFilesWithMedia = await Promise.all((proj.taskFiles || []).map(async f => {
        const media = await getMedia(f.id);
        return { ...f, base64Data: media?.split(',')[1] || "" };
      }));
      const rubric = await generateRubricFromTaskAndSamples(taskFilesWithMedia);
      updateActiveProject({ rubric });
    } catch (e) {
      console.error("Rubric generation failed:", e);
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const integratePageResults = async (originalPage: Page, results: any[]) => {
    const processedPages: Page[] = [];
    const originalMedia = await getMedia(originalPage.id);
    
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const newId = `${originalPage.id}_split_${i}`;
      
      if (res.box_2d && originalMedia) {
        try {
          const cropped = await cropImageFromBase64(originalMedia, res.box_2d);
          await saveMedia(newId, cropped.preview);
          
          processedPages.push({
            ...originalPage,
            id: newId,
            imagePreview: cropped.preview,
            candidateId: String(res.candidateId || "Ukjent"),
            part: res.part,
            pageNumber: res.pageNumber,
            transcription: res.fullText,
            identifiedTasks: res.identifiedTasks || [], // Lagrer oppgaver funnet på siden
            rotation: res.rotation || 0,
            status: 'completed'
          });
        } catch (e) {
          processedPages.push({
            ...originalPage,
            id: newId,
            candidateId: String(res.candidateId || "Ukjent"),
            part: res.part,
            pageNumber: res.pageNumber,
            transcription: res.fullText,
            identifiedTasks: res.identifiedTasks || [],
            rotation: res.rotation || 0,
            status: 'completed'
          });
        }
      } else {
        processedPages.push({
          ...originalPage,
          id: newId,
          candidateId: String(res.candidateId || "Ukjent"),
          part: res.part,
          pageNumber: res.pageNumber,
          transcription: res.fullText,
          identifiedTasks: res.identifiedTasks || [],
          rotation: res.rotation || 0,
          status: 'completed'
        });
      }
    }

    setActiveProject(prev => {
      if (!prev) return null;
      let cands = [...(prev.candidates || [])];
      
      processedPages.forEach((newPage: Page) => {
        const cId = String(newPage.candidateId || "Ukjent");
        let candIndex = cands.findIndex(c => c.id === cId);
        if (candIndex === -1) {
          cands.push({ id: cId, name: `Kandidat ${cId}`, status: 'completed', pages: [newPage] });
        } else {
          const pageExists = cands[candIndex].pages.some(p => p.id === newPage.id);
          if (!pageExists) {
            cands[candIndex] = { ...cands[candIndex], pages: [...cands[candIndex].pages, newPage] };
          }
        }
      });

      return { 
        ...prev, 
        candidates: cands, 
        unprocessedPages: (prev.unprocessedPages || []).filter(p => p.id !== originalPage.id) 
      };
    });
  };

  const processSinglePage = async (page: Page) => {
    try {
      setActiveProject(prev => prev ? ({ ...prev, unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'processing' as const } : p) }) : null);
      
      if (page.mimeType === 'text/plain') {
        const res = await analyzeTextContent(page.transcription!);
        await integratePageResults(page, [res]);
      } else {
        const media = await getMedia(page.id);
        const pageWithMedia = { ...page, base64Data: media?.split(',')[1] || "" };
        const results = await transcribeAndAnalyzeImage(pageWithMedia);
        await integratePageResults(page, results);
      }
      setBatchCompleted(prev => prev + 1);
    } catch (e) {
      console.error("Prosessering feilet:", e);
      setActiveProject(prev => prev ? ({ ...prev, unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error' as const } : p) }) : null);
    } finally {
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    setBatchTotal(prev => prev + fileList.length);
    setProcessingCount(prev => prev + fileList.length);
    try {
      const allNewTaskPages: Page[] = [];
      for (const file of fileList) {
        const pages = await processFileToImages(file);
        allNewTaskPages.push(...pages);
      }
      const updatedProject = { ...activeProject, taskFiles: [...(activeProject.taskFiles || []), ...allNewTaskPages] };
      setActiveProject(updatedProject);
      setBatchCompleted(prev => prev + allNewTaskPages.length);
      setProcessingCount(prev => Math.max(0, prev - allNewTaskPages.length));
      await handleGenerateRubric(updatedProject);
    } catch (err) {
      console.error(err);
      setProcessingCount(0);
    }
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    let allNewPages: Page[] = [];
    for (const file of fileList) {
      const pages = await processFileToImages(file);
      allNewPages = [...allNewPages, ...pages];
    }
    startProcessingPages(allNewPages);
  };

  const startProcessingPages = (newPages: Page[]) => {
    if (!activeProject) return;
    updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...newPages] });
    setBatchTotal(prev => prev + newPages.length);
    setProcessingCount(prev => prev + newPages.length);
    newPages.forEach(page => processSinglePage(page));
  };

  const handleRetryPage = (page: Page) => {
    setProcessingCount(prev => prev + 1);
    setBatchTotal(prev => prev + 1);
    processSinglePage(page);
  };

  const handleEvaluateAll = async () => {
    if (!activeProject?.rubric) return;
    setRubricStatus({ loading: true, text: 'Vurderer besvarelser...' });
    try {
      const cands = [...(activeProject.candidates || [])];
      for (let i = 0; i < cands.length; i++) {
        if (cands[i].status === 'evaluated') continue;
        const evalRes = await evaluateCandidate(cands[i], activeProject.rubric);
        cands[i] = { ...cands[i], evaluation: evalRes, status: 'evaluated' };
        setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
      }
    } catch (e) { console.error(e); } finally { setRubricStatus({ loading: false, text: '' }); }
  };

  return {
    processingCount,
    batchTotal,
    batchCompleted,
    rubricStatus,
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleEvaluateAll,
    handleGenerateRubric,
    handleRetryPage,
    updateActiveProject
  };
};
