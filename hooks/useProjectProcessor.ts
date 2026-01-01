
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, Page, Candidate, IdentifiedTask } from '../types';
import { processFileToImages, splitA3Spread, processImageRotation } from '../services/fileService';
import { getMedia, saveMedia, saveCandidate, saveProject } from '../services/storageService';
import { 
  transcribeAndAnalyzeImage, 
  analyzeTextContent, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate,
  reconcileProjectData
} from '../services/geminiService';

const sanitizeTaskPart = (val: string | undefined): string => {
  if (!val) return "";
  let cleaned = val.trim().toUpperCase().replace(/[\.\)\:\,]+$/, "");
  if (cleaned.length > 5) {
    const match = cleaned.match(/(\d+[A-Z]?|[A-Z])/);
    return match ? match[0] : cleaned.substring(0, 5);
  }
  return cleaned;
};

/**
 * HARD WHITELISTING v4.95.1
 * Fjerner oppgaver som ikke finnes i rettemanualen eller som er romertall-støy.
 */
const filterTasksAgainstRubric = (tasks: IdentifiedTask[], project: Project | null): IdentifiedTask[] => {
  if (!project || !project.rubric) return tasks;
  const validTasks = new Set(project.rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`.toUpperCase()));
  
  return tasks.filter(t => {
    const taskKey = `${t.taskNumber}${t.subTask || ''}`.toUpperCase();
    
    // Forkast romertall-støy (i, ii, iii, iv, v, vi, vii, viii, ix, x)
    const isRoman = /^[IVXLCDM]+$/.test(t.subTask?.toUpperCase() || "");
    if (isRoman && !validTasks.has(taskKey)) return false;

    // Kun behold hvis den finnes i whitelisten
    return validTasks.has(taskKey);
  });
};

const createThumbnailFromBase64 = async (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 800;
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
      else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = base64;
  });
};

export const useProjectProcessor = (
  activeProject: Project | null, 
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>
) => {
  const [processingCount, setProcessingCount] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCompleted, setBatchCompleted] = useState(0);
  const [currentAction, setCurrentAction] = useState<string>('');
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
  
  const isBatchProcessing = useRef(false);

  const updateActiveProject = useCallback((updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  }, [setActiveProject]);

  const integratePageResults = async (originalPage: Page, results: any[]) => {
    const isDigital = originalPage.mimeType === 'text/plain';
    const processedPages: Page[] = [];

    if (!isDigital) {
      const originalMedia = await getMedia(originalPage.id);
      if (!originalMedia) return;

      for (const res of results) {
        const rawTasks = (res.identifiedTasks || []).map((t: any) => ({
          taskNumber: sanitizeTaskPart(t.taskNumber),
          subTask: sanitizeTaskPart(t.subTask)
        }));
        
        // HARD WHITELISTING
        const tasks = filterTasksAgainstRubric(rawTasks, activeProject);
        
        let candRaw = String(res.candidateId || "UKJENT").trim().toUpperCase();
        let candidateId = candRaw.replace(/\D/g, '');
        if (!candidateId || candRaw.includes("UKJENT")) candidateId = "UKJENT";

        if (res.layoutType === 'A3_SPREAD' && res.sideInSpread) {
          const split = await splitA3Spread(originalMedia, res.sideInSpread as 'LEFT' | 'RIGHT', res.rotation || 0);
          const newId = `${originalPage.id}_${res.sideInSpread}`;
          await saveMedia(newId, split.fullRes);
          const newThumb = await createThumbnailFromBase64(split.fullRes);
          processedPages.push({ 
            ...originalPage, 
            id: newId, 
            fileName: res.sideInSpread === 'LEFT' ? 'Side A' : 'Side B',
            imagePreview: newThumb, 
            candidateId, 
            part: res.part || originalPage.part || "Del 1",
            transcription: res.fullText, 
            identifiedTasks: tasks, 
            rotation: 0,
            status: 'completed' 
          });
        } else {
          let finalImage = originalMedia;
          let finalThumb = originalPage.imagePreview;
          if (res.rotation && res.rotation !== 0) {
            finalImage = await processImageRotation(originalMedia, res.rotation);
            await saveMedia(originalPage.id, finalImage);
            finalThumb = await createThumbnailFromBase64(finalImage);
          }
          processedPages.push({ 
            ...originalPage, 
            imagePreview: finalThumb, 
            candidateId, 
            part: res.part || originalPage.part || "Del 1",
            transcription: res.fullText, 
            identifiedTasks: tasks, 
            rotation: 0,
            status: 'completed' 
          });
        }
      }
    } else {
      for (const res of results) {
        const rawTasks = (res.identifiedTasks || []).map((t: any) => ({
          taskNumber: sanitizeTaskPart(t.taskNumber),
          subTask: sanitizeTaskPart(t.subTask)
        }));

        // HARD WHITELISTING
        const tasks = filterTasksAgainstRubric(rawTasks, activeProject);
        
        let candRaw = String(res.candidateId || "UKJENT").trim().toUpperCase();
        let candidateId = candRaw.replace(/\D/g, '');
        if (!candidateId || candRaw.includes("UKJENT")) candidateId = "UKJENT";
        
        processedPages.push({ 
          ...originalPage, 
          candidateId, 
          part: res.part || originalPage.part || "Del 2", 
          transcription: res.fullText, 
          identifiedTasks: tasks, 
          status: 'completed' 
        });
      }
    }

    // ATOMISK OPPDATERING
    setActiveProject(prev => {
      if (!prev) return null;
      const updatedCands = [...prev.candidates];
      
      processedPages.forEach(p => {
        const isUnknown = p.candidateId === "UKJENT";
        const storageId = isUnknown ? `UKJENT_${p.id}` : p.candidateId!;
        const displayName = isUnknown ? `Ukjent (${p.fileName})` : `Kandidat ${p.candidateId}`;
        
        let cIdx = updatedCands.findIndex(c => String(c.id) === storageId);
        
        if (cIdx === -1) {
          const newC: Candidate = { id: storageId, projectId: prev.id, name: displayName, pages: [p], status: 'completed' };
          updatedCands.push(newC);
          saveCandidate(newC);
        } else {
          const pageExists = updatedCands[cIdx].pages.some(ex => ex.id === p.id);
          if (!pageExists) {
            updatedCands[cIdx] = { ...updatedCands[cIdx], pages: [...updatedCands[cIdx].pages, p].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)) };
          } else {
            updatedCands[cIdx] = { ...updatedCands[cIdx], pages: updatedCands[cIdx].pages.map(ex => ex.id === p.id ? p : ex).sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)) };
          }
          saveCandidate(updatedCands[cIdx]);
        }
      });

      const updatedUnprocessed = (prev.unprocessedPages || []).filter(up => up.id !== originalPage.id);
      const newProject = { ...prev, candidates: updatedCands, unprocessedPages: updatedUnprocessed };
      saveProject(newProject);
      return newProject;
    });
  };

  const processSinglePage = async (page: Page, rubric: any) => {
    try {
      setActiveProject(prev => prev ? ({
        ...prev,
        unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'processing' } : p)
      }) : null);

      setCurrentAction(`Analyserer ${page.fileName}...`);
      
      if (page.mimeType === 'text/plain') {
        const textToAnalyze = page.transcription || page.rawText || "";
        const res = await analyzeTextContent(textToAnalyze, rubric);
        await integratePageResults(page, [res]);
      } else {
        const media = await getMedia(page.id);
        if (!media) throw new Error("Media missing");
        const results = await transcribeAndAnalyzeImage({ ...page, base64Data: media.split(',')[1] || "" }, rubric);
        await integratePageResults(page, results);
      }
    } catch (e) {
      console.error("Prosessering feilet:", page.fileName, e);
      setActiveProject(prev => prev ? ({ 
        ...prev, 
        unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error' } : p) 
      }) : null);
    } finally { 
      setBatchCompleted(prev => prev + 1);
      setProcessingCount(prev => Math.max(0, prev - 1)); 
    }
  };

  useEffect(() => {
    const pendingPages = activeProject?.unprocessedPages?.filter(p => p.status === 'pending') || [];
    
    if (activeProject?.rubric && pendingPages.length > 0 && !isBatchProcessing.current) {
      isBatchProcessing.current = true;
      const rubric = activeProject.rubric;
      
      setBatchTotal(pendingPages.length);
      setBatchCompleted(0);
      setProcessingCount(pendingPages.length);

      const runBatch = async () => {
        for (const p of pendingPages) {
          await processSinglePage(p, rubric);
        }
        isBatchProcessing.current = false;
        setCurrentAction('');
      };
      runBatch();
    }
  }, [activeProject?.rubric, activeProject?.unprocessedPages?.length]);

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    setBatchTotal(fileList.length);
    setBatchCompleted(0);
    const allPages: Page[] = [];
    for (const f of fileList) {
      const pages = await processFileToImages(f);
      allPages.push(...pages);
      setBatchCompleted(prev => prev + 1);
    }
    updateActiveProject({ taskFiles: [...activeProject.taskFiles, ...allPages] });
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    let allPages: Page[] = [];
    for (const f of fileList) {
      const pgs = await processFileToImages(f);
      allPages = [...allPages, ...pgs];
    }
    updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...allPages] });
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || proj.taskFiles.length === 0) return;
    setRubricStatus({ loading: true, text: 'Genererer rettemanual...' });
    try {
      const taskFilesWithMedia = await Promise.all(proj.taskFiles.map(async f => ({ 
        ...f, 
        base64Data: f.mimeType !== 'text/plain' ? (await getMedia(f.id))?.split(',')[1] || "" : ""
      })));
      const rubric = await generateRubricFromTaskAndSamples(taskFilesWithMedia);
      updateActiveProject({ rubric });
    } catch (e) { 
      console.error(e); 
    } finally { 
      setRubricStatus({ loading: false, text: '' }); 
    }
  };

  const handleEvaluateAll = async () => {
    if (!activeProject?.rubric) return;
    setRubricStatus({ loading: true, text: 'Vurderer besvarelser...' });
    const cands = [...activeProject.candidates];
    for (let i = 0; i < cands.length; i++) {
      if (cands[i].status === 'evaluated') continue;
      setCurrentAction(`Vurderer ${cands[i].name}...`);
      const res = await evaluateCandidate(cands[i], activeProject.rubric);
      cands[i] = { ...cands[i], evaluation: res, status: 'evaluated' };
      await saveCandidate(cands[i]);
      setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
    }
    setRubricStatus({ loading: false, text: '' });
    setCurrentAction('');
  };

  const handleSmartCleanup = async () => {
    if (!activeProject) return;
    setRubricStatus({ loading: true, text: 'Rydder i prosjektet...' });
    try {
      const reconciliation = await reconcileProjectData(activeProject);
      setActiveProject(prev => {
        if (!prev) return null;
        let newCandidates = [...prev.candidates];
        reconciliation.merges?.forEach((m: any) => {
          const fromIdStr = String(m.fromId);
          const toIdStr = String(m.toId);
          const fromIdx = newCandidates.findIndex(c => String(c.id) === fromIdStr);
          const toIdx = newCandidates.findIndex(c => String(c.id) === toIdStr);
          if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
            newCandidates[toIdx] = { ...newCandidates[toIdx], pages: [...newCandidates[toIdx].pages, ...newCandidates[fromIdx].pages].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)) };
            newCandidates.splice(fromIdx, 1);
          }
        });
        return { ...prev, candidates: newCandidates };
      });
    } catch (e) { console.error(e); } finally { setRubricStatus({ loading: false, text: '' }); }
  };

  return { 
    processingCount, batchTotal, batchCompleted, currentAction, rubricStatus, 
    handleTaskFileSelect, handleCandidateFileSelect,
    handleEvaluateAll, handleGenerateRubric, handleRetryPage: (p: Page) => processSinglePage(p, activeProject?.rubric), 
    handleSmartCleanup, updateActiveProject 
  };
};
