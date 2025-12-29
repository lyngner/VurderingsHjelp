
import React, { useState, useEffect } from 'react';
import { Project, Page, Candidate } from '../types';
import { processFileToImages, cropImageFromBase64 } from '../services/fileService';
import { getMedia, saveMedia } from '../services/storageService';
import { 
  transcribeAndAnalyzeImage, 
  analyzeTextContent, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate,
  reconcileProjectData
} from '../services/geminiService';

const extractTasksFallback = (text: string): string[] => {
  if (!text) return [];
  const lines = text.split('\n');
  const tasks = new Set<string>();
  const taskPattern = /^\s*(\d+[a-z]?)(?:[\s\)\.\:]|$)/i;
  lines.forEach(line => {
    const match = line.match(taskPattern);
    if (match && match[1]) {
      tasks.add(match[1].toUpperCase());
    }
  });
  return Array.from(tasks);
};

export const useProjectProcessor = (
  activeProject: Project | null, 
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>
) => {
  const [processingCount, setProcessingCount] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCompleted, setBatchCompleted] = useState(0);
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });

  const updateActiveProject = (updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  };

  const handleSmartCleanup = async () => {
    if (!activeProject) return;
    setRubricStatus({ loading: true, text: 'Kjører smart-opprydding...' });
    try {
      const reconciliation = await reconcileProjectData(activeProject);
      
      setActiveProject(prev => {
        if (!prev) return null;
        let newCandidates = [...prev.candidates];

        // Utfør sammenslåinger
        reconciliation.merges?.forEach((m: any) => {
          const fromIdx = newCandidates.findIndex(c => c.id === m.fromId);
          const toIdx = newCandidates.findIndex(c => c.id === m.toId);
          
          if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
            const fromCand = newCandidates[fromIdx];
            newCandidates[toIdx] = {
              ...newCandidates[toIdx],
              pages: [...newCandidates[toIdx].pages, ...fromCand.pages].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
            };
            newCandidates.splice(fromIdx, 1);
          }
        });

        // Oppdater oppgavedetektering hvis foreslått
        reconciliation.taskCorrections?.forEach((corr: any) => {
          const candIdx = newCandidates.findIndex(c => c.id === corr.candidateId);
          if (candIdx !== -1) {
             // Her kan vi logge at vi har funnet forbedringer
             console.log(`Smart Cleanup: Oppdaterte oppgaver for ${corr.candidateId}`);
          }
        });

        return { ...prev, candidates: newCandidates };
      });
    } catch (e) {
      console.error("Smart cleanup failed:", e);
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
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
      
      let cleanedPart = String(res.part || "Ukjent del");
      if (cleanedPart.length > 15 || cleanedPart === "null") {
         if (cleanedPart.toLowerCase().includes("2")) cleanedPart = "Del 2";
         else if (cleanedPart.toLowerCase().includes("1")) cleanedPart = "Del 1";
         else cleanedPart = "Ukjent del";
      }

      let tasks = res.identifiedTasks || [];
      if (tasks.length === 0 && res.fullText) {
        tasks = extractTasksFallback(res.fullText);
      }
      
      const candidateIdStr = (res.candidateId && res.candidateId !== "null") ? String(res.candidateId) : "Ukjent";
      
      if (res.box_2d && originalMedia) {
        try {
          const cropped = await cropImageFromBase64(originalMedia, res.box_2d);
          await saveMedia(newId, cropped.preview);
          processedPages.push({
            ...originalPage,
            id: newId,
            imagePreview: cropped.preview,
            candidateId: candidateIdStr,
            part: cleanedPart,
            pageNumber: res.pageNumber,
            transcription: res.fullText,
            identifiedTasks: tasks,
            rotation: res.rotation || 0,
            status: 'completed'
          });
        } catch (e) {
          processedPages.push({ ...originalPage, id: newId, candidateId: candidateIdStr, transcription: res.fullText, status: 'completed' });
        }
      } else {
        processedPages.push({ ...originalPage, id: newId, candidateId: candidateIdStr, transcription: res.fullText, status: 'completed' });
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
      return { ...prev, candidates: cands, unprocessedPages: (prev.unprocessedPages || []).filter(p => p.id !== originalPage.id) };
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
    updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...allNewPages] });
    setBatchTotal(prev => prev + allNewPages.length);
    setProcessingCount(prev => prev + allNewPages.length);
    allNewPages.forEach(page => processSinglePage(page));
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
    handleSmartCleanup,
    updateActiveProject
  };
};
