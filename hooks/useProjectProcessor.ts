import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, Page, Candidate, IdentifiedTask, RubricCriterion, Rubric } from '../types';
import { processFileToImages, splitA3Spread, processImageRotation } from '../services/fileService';
import { getMedia, saveMedia, saveCandidate, saveProject } from '../services/storageService';
import { 
  transcribeAndAnalyzeImage, 
  analyzeTextContent, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate,
  reconcileProjectData,
  regenerateSingleCriterion
} from '../services/geminiService';

const sanitizeTaskPart = (val: string | undefined): string => {
  if (!val) return "";
  let cleaned = val.trim().toUpperCase().replace(/[\.\)\:\,]+$/, "");
  if (cleaned.length > 5 || /TOTAL|SIDE|DEL|HELE|NONE|NULL/.test(cleaned)) {
    const match = cleaned.match(/(\d+[A-Z]?|[A-Z])/);
    return match ? match[0] : "";
  }
  return cleaned;
};

const validateTasksAgainstRubric = (tasks: IdentifiedTask[], rubric: Rubric | null): IdentifiedTask[] => {
  if (!rubric) return tasks;
  const validMap = new Set(rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`.toUpperCase()));
  
  return tasks.filter(t => {
    const label = `${t.taskNumber}${t.subTask}`.toUpperCase();
    return validMap.has(label);
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
  const isStoppingEvaluation = useRef(false);

  const updateActiveProject = useCallback((updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  }, [setActiveProject]);

  const integratePageResults = async (originalPage: Page, results: any[], rubric: Rubric | null) => {
    const isDigital = originalPage.mimeType === 'text/plain' || originalPage.isDigital;
    const processedPages: Page[] = [];

    if (!isDigital) {
      const originalMedia = await getMedia(originalPage.id);
      if (!originalMedia) return;

      for (const res of results) {
        let tasks = (res.identifiedTasks || []).map((t: any) => ({
          taskNumber: sanitizeTaskPart(t.taskNumber),
          subTask: sanitizeTaskPart(t.subTask)
        })).filter((t: any) => t.taskNumber !== "");

        tasks = validateTasksAgainstRubric(tasks, rubric);
        
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
            visualEvidence: res.visualEvidence, 
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
            visualEvidence: res.visualEvidence, 
            identifiedTasks: tasks, 
            rotation: 0,
            status: 'completed' 
          });
        }
      }
    } else {
      for (const res of results) {
        let tasks = (res.identifiedTasks || []).map((t: any) => ({
          taskNumber: sanitizeTaskPart(t.taskNumber),
          subTask: sanitizeTaskPart(t.subTask)
        })).filter((t: any) => t.taskNumber !== "");

        tasks = validateTasksAgainstRubric(tasks, rubric);
        
        let candRaw = String(res.candidateId || "UKJENT").trim().toUpperCase();
        let candidateId = candRaw.replace(/\D/g, '');
        if (!candidateId || candRaw.includes("UKJENT")) candidateId = "UKJENT";
        
        processedPages.push({ 
          ...originalPage, 
          candidateId, 
          part: res.part || originalPage.part || "Del 2", 
          transcription: res.fullText, 
          visualEvidence: res.visualEvidence, 
          identifiedTasks: tasks, 
          status: 'completed',
          isDigital: true
        });
      }
    }

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

  const processSinglePage = async (page: Page, rubric: Rubric | null, forceRescan: boolean = false) => {
    try {
      setActiveProject(prev => prev ? ({
        ...prev,
        unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'processing' } : p)
      }) : null);

      setCurrentAction(`Analyserer ${page.fileName}...`);
      
      if (page.mimeType === 'text/plain' || page.isDigital) {
        const textToAnalyze = page.transcription || page.rawText || "";
        const res = await analyzeTextContent(textToAnalyze, rubric);
        await integratePageResults(page, [res], rubric);
      } else {
        const media = await getMedia(page.id);
        if (!media) throw new Error("Media missing");
        const results = await transcribeAndAnalyzeImage({ ...page, base64Data: media.split(',')[1] || "", forceRescan } as any, rubric);
        await integratePageResults(page, results, rubric);
      }
    } catch (e: any) {
      console.error("Prosessering feilet:", page.fileName, e);
      const errorMsg = e?.message || String(e);
      const isQuotaError = errorMsg.includes("429") || errorMsg.includes("quota");
      
      setActiveProject(prev => prev ? ({ 
        ...prev, 
        unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { 
          ...p, 
          status: 'error', 
          statusLabel: isQuotaError ? 'Kvote brukt opp' : 'Feil' 
        } : p) 
      }) : null);
    } finally { 
      setBatchCompleted(prev => prev + 1);
      setProcessingCount(prev => Math.max(0, prev - 1)); 
    }
  };

  const handleRegenerateCriterion = async (criterionName: string) => {
    if (!activeProject?.rubric) return;
    const criterion = activeProject.rubric.criteria.find(c => c.name === criterionName);
    if (!criterion) return;

    setRubricStatus({ loading: true, text: `Regenererer ${criterionName}...` });
    try {
      const updates = await regenerateSingleCriterion(criterion);
      setActiveProject(prev => {
        if (!prev || !prev.rubric) return prev;
        const newCriteria = prev.rubric.criteria.map(c => 
          c.name === criterionName ? { ...c, ...updates } : c
        );
        return { ...prev, rubric: { ...prev.rubric, criteria: newCriteria } };
      });
    } catch (e) {
      console.error("Regenerering feilet:", e);
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const handleRegeneratePage = async (candidateId: string, pageId: string) => {
    if (!activeProject) return;
    const candidate = activeProject.candidates.find(c => c.id === candidateId);
    const page = candidate?.pages.find(p => p.id === pageId);
    if (!page) return;

    setActiveProject(prev => {
      if (!prev) return null;
      const updatedCands = prev.candidates.map(c => {
        if (c.id === candidateId) {
          return { ...c, pages: c.pages.filter(p => p.id !== pageId) };
        }
        return c;
      });
      return {
        ...prev,
        candidates: updatedCands,
        unprocessedPages: [...(prev.unprocessedPages || []), { ...page, status: 'pending', forceRescan: true } as any]
      };
    });
  };

  useEffect(() => {
    const pendingPages = activeProject?.unprocessedPages?.filter(p => p.status === 'pending') || [];
    
    if (activeProject?.rubric && pendingPages.length > 0 && !isBatchProcessing.current) {
      isBatchProcessing.current = true;
      const rubric = activeProject.rubric;
      
      setBatchTotal(prev => Math.max(prev, pendingPages.length + batchCompleted));
      setProcessingCount(pendingPages.length);

      const runBatch = async () => {
        const pagesToProcess = [...pendingPages];
        for (const p of pagesToProcess) {
          await processSinglePage(p, rubric, (p as any).forceRescan);
        }
        isBatchProcessing.current = false;
        setCurrentAction('');
        
        const checkRemaining = activeProject?.unprocessedPages?.filter(p => p.status === 'pending') || [];
        if (checkRemaining.length === 0) {
          setTimeout(() => {
            setBatchTotal(0);
            setBatchCompleted(0);
          }, 1500);
        }
      };
      runBatch();
    }
  }, [activeProject?.rubric, activeProject?.unprocessedPages?.length]);

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    const allPages: Page[] = [];
    for (const f of fileList) {
      const pages = await processFileToImages(f);
      allPages.push(...pages);
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
    } catch (e: any) { 
      console.error(e);
      if (e?.message?.includes("429")) {
        alert("Kvote overskredet for Gemini Pro. Vennligst vent litt eller sjekk faktureringsstatus i AI Studio.");
      }
    } finally { 
      setRubricStatus({ loading: false, text: '' }); 
    }
  };

  const handleEvaluateCandidate = async (candidateId: string) => {
    if (!activeProject?.rubric) return;
    const candIdx = activeProject.candidates.findIndex(c => c.id === candidateId);
    if (candIdx === -1) return;

    setRubricStatus({ loading: true, text: `Vurderer ${activeProject.candidates[candIdx].name}...` });
    try {
      const candidate = activeProject.candidates[candIdx];
      const res = await evaluateCandidate(candidate, activeProject.rubric);
      const updatedCand = { ...candidate, evaluation: res, status: 'evaluated' as const };
      await saveCandidate(updatedCand);
      
      setActiveProject(prev => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map(c => c.id === candidateId ? updatedCand : c)
        };
      });
    } catch (e: any) {
      console.error("Evaluering feilet for kandidat:", candidateId, e);
      if (e?.message?.includes("429")) {
         alert("Vurderingen ble avbrutt fordi API-kvoten er brukt opp.");
      }
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const handleEvaluateAll = async (force: boolean = false) => {
    if (!activeProject?.rubric) return;
    
    if (rubricStatus.loading) {
      isStoppingEvaluation.current = true;
      return;
    }

    isStoppingEvaluation.current = false;
    setRubricStatus({ loading: true, text: 'Vurderer besvarelser...' });
    const cands = [...activeProject.candidates];
    
    for (let i = 0; i < cands.length; i++) {
      if (isStoppingEvaluation.current) break;
      if (!force && cands[i].status === 'evaluated') continue;
      
      setCurrentAction(`Vurderer ${cands[i].name}...`);
      try {
        const res = await evaluateCandidate(cands[i], activeProject.rubric);
        cands[i] = { ...cands[i], evaluation: res, status: 'evaluated' };
        await saveCandidate(cands[i]);
        setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
      } catch (e: any) {
        console.error("Evaluering feilet:", cands[i].name, e);
        if (e?.message?.includes("429")) {
          alert("Kvote brukt opp. Stopper videre vurdering.");
          break;
        }
      }
    }
    setRubricStatus({ loading: false, text: '' });
    setCurrentAction('');
    isStoppingEvaluation.current = false;
  };

  const handleSmartCleanup = async () => {
    if (!activeProject) return;
    setRubricStatus({ loading: true, text: 'Unngår støy og rydder...' });
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
    handleEvaluateAll, handleEvaluateCandidate, handleGenerateRubric, 
    handleRetryPage: (p: Page) => processSinglePage(p, activeProject?.rubric), 
    handleRegenerateCriterion, handleRegeneratePage,
    handleSmartCleanup, updateActiveProject 
  };
};