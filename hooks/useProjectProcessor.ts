
import React, { useState } from 'react';
import { Project, Page } from '../types';
import { processFileToImages, cropImageFromBase64 } from '../services/fileService';
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
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });

  const updateActiveProject = (updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || (proj.taskFiles?.length || 0) === 0) return;
    setRubricStatus({ loading: true, text: 'Analyserer oppgaver...' });
    try {
      const rubric = await generateRubricFromTaskAndSamples(proj.taskFiles);
      updateActiveProject({ rubric });
    } catch (e) {
      console.error("Rubric generation failed:", e);
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const integratePageResults = async (originalPage: Page, results: any[]) => {
    const splitPages: Page[] = [];
    
    // Hvis vi har flere segmenter, må vi beskjære originalbildet
    if (results.length > 1 && originalPage.imagePreview) {
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.box_2d) {
          try {
            const cropped = await cropImageFromBase64(originalPage.imagePreview, res.box_2d);
            splitPages.push({
              ...originalPage,
              id: `${originalPage.id}_${i}`,
              imagePreview: cropped.preview,
              base64Data: cropped.data,
              candidateId: String(res.candidateId || "Ukjent"),
              part: res.part,
              pageNumber: res.pageNumber,
              transcription: res.fullText,
              status: 'completed'
            });
          } catch (e) {
            console.error("Feil ved beskjæring:", e);
          }
        }
      }
    }

    setActiveProject(prev => {
      if (!prev) return null;
      let cands = [...(prev.candidates || [])];
      
      const finalResults = splitPages.length > 0 ? splitPages : results.map((r, i) => ({
        ...originalPage,
        candidateId: String(r.candidateId || "Ukjent"),
        part: r.part,
        pageNumber: r.pageNumber,
        transcription: r.fullText,
        status: 'completed'
      }));

      finalResults.forEach((resPage: any) => {
        const cId = String(resPage.candidateId || "Ukjent");
        let candIndex = cands.findIndex(c => c.id === cId);
        
        const newPage: Page = splitPages.length > 0 ? resPage : {
          ...originalPage,
          candidateId: cId,
          part: resPage.part,
          pageNumber: resPage.pageNumber,
          transcription: resPage.transcription || originalPage.transcription,
          status: 'completed'
        };

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
      setActiveProject(prev => prev ? ({ ...prev, unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'pending' as const } : p) }) : null);
      
      if (page.mimeType === 'text/plain') {
        const res = await analyzeTextContent(page.transcription!);
        await integratePageResults(page, [res]);
      } else {
        const results = await transcribeAndAnalyzeImage(page);
        await integratePageResults(page, results);
      }
    } catch (e) {
      setActiveProject(prev => prev ? ({ ...prev, unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error' as const } : p) }) : null);
    } finally {
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    setProcessingCount(prev => prev + fileList.length);
    try {
      const allNewTaskPages: Page[] = [];
      for (const file of fileList) {
        const pages = await processFileToImages(file);
        allNewTaskPages.push(...pages);
      }
      const updatedProject = { ...activeProject, taskFiles: [...(activeProject.taskFiles || []), ...allNewTaskPages] };
      setActiveProject(updatedProject);
      await handleGenerateRubric(updatedProject);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingCount(prev => Math.max(0, prev - fileList.length));
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
    updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...allNewPages] });
    setProcessingCount(prev => prev + allNewPages.length);
    allNewPages.forEach(page => processSinglePage(page));
  };

  const handleRetryPage = (page: Page) => {
    setProcessingCount(prev => prev + 1);
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
    rubricStatus,
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleEvaluateAll,
    handleGenerateRubric,
    handleRetryPage,
    updateActiveProject
  };
};
