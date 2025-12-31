import React, { useState, useEffect } from 'react';
import { Project, Page, Candidate, IdentifiedTask } from '../types';
import { processFileToImages, splitA3Spread, processImageRotation } from '../services/fileService';
import { getMedia, saveMedia, saveCandidate } from '../services/storageService';
import { fetchImagesFromDriveFolder, downloadDriveFile } from '../services/driveService';
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

const getNormalizedTaskKey = (task: string, sub: string): string => {
  const cleanTask = task.replace(/\D/g, ''); 
  const cleanSub = sub.replace(/[^A-Z0-9]/gi, '').toUpperCase(); 
  return `${cleanTask}${cleanSub}`;
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

  const updateActiveProject = (updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
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

  const integratePageResults = async (originalPage: Page, results: any[]) => {
    if (!activeProject) return;
    const processedPages: Page[] = [];
    const originalMedia = await getMedia(originalPage.id);
    const validTaskKeys = new Set(activeProject.rubric?.criteria.map(c => 
      getNormalizedTaskKey(c.taskNumber, c.subTask || "")
    ));

    for (const res of results) {
      const tasks = (res.identifiedTasks || []).map((t: any) => {
        const tNum = sanitizeTaskPart(t.taskNumber);
        const tSub = sanitizeTaskPart(t.subTask);
        const key = getNormalizedTaskKey(tNum, tSub);
        if (activeProject.rubric && !validTaskKeys.has(key)) {
          const splitMatch = tNum.match(/^(\d+)([A-Z])?$/);
          if (splitMatch) {
            const newKey = getNormalizedTaskKey(splitMatch[1], splitMatch[2] || tSub);
            if (validTaskKeys.has(newKey)) return { taskNumber: splitMatch[1], subTask: splitMatch[2] || tSub };
          }
          return { taskNumber: tNum, subTask: "UKJENT" };
        }
        return { taskNumber: tNum, subTask: tSub };
      });

      if (res.layoutType === 'A3_SPREAD' && res.sideInSpread && originalMedia) {
        const split = await splitA3Spread(originalMedia, res.sideInSpread as 'LEFT' | 'RIGHT', res.rotation || 0);
        const newId = `${originalPage.id}_${res.sideInSpread}`;
        await saveMedia(newId, split.preview);
        const newThumb = await createThumbnailFromBase64(split.preview);
        processedPages.push({ ...originalPage, id: newId, imagePreview: newThumb, candidateId: String(res.candidateId || "Ukjent").replace(/\D/g, ''), transcription: res.fullText, identifiedTasks: tasks, rotation: 0, status: 'completed' });
      } else {
        let finalImage = originalMedia;
        let finalThumb = originalPage.imagePreview;
        if (res.rotation && res.rotation !== 0 && originalMedia) {
          finalImage = await processImageRotation(originalMedia, res.rotation);
          await saveMedia(originalPage.id, finalImage);
          finalThumb = await createThumbnailFromBase64(finalImage);
        }
        processedPages.push({ ...originalPage, imagePreview: finalThumb, candidateId: String(res.candidateId || "Ukjent").replace(/\D/g, ''), transcription: res.fullText, identifiedTasks: tasks, rotation: 0, status: 'completed' });
      }
    }

    setActiveProject(prev => {
      if (!prev) return null;
      let cands = [...prev.candidates];
      processedPages.forEach(p => {
        let cIdClean = p.candidateId || "Ukjent";
        let cIdx = cands.findIndex(c => String(c.id) === cIdClean);
        if (cIdx === -1) {
          const newC: Candidate = { id: cIdClean, projectId: prev.id, name: `Kandidat ${cIdClean}`, pages: [p], status: 'completed' };
          cands.push(newC);
          saveCandidate(newC);
        } else {
          const pageExists = cands[cIdx].pages.some(existing => existing.id === p.id);
          if (!pageExists) {
            cands[cIdx] = { ...cands[cIdx], pages: [...cands[cIdx].pages, p].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)) };
          } else {
            cands[cIdx] = { ...cands[cIdx], pages: cands[cIdx].pages.map(existing => existing.id === p.id ? p : existing).sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)) };
          }
          saveCandidate(cands[cIdx]);
        }
      });
      return { ...prev, candidates: cands, unprocessedPages: prev.unprocessedPages?.filter(up => up.id !== originalPage.id) };
    });
  };

  const processSinglePage = async (page: Page) => {
    try {
      setCurrentAction(`Analyserer ${page.fileName}...`);
      if (page.mimeType === 'text/plain') {
        const res = await analyzeTextContent(page.transcription!, activeProject?.rubric);
        await integratePageResults(page, [res]);
      } else {
        const media = await getMedia(page.id);
        const results = await transcribeAndAnalyzeImage({ ...page, base64Data: media?.split(',')[1] || "" }, activeProject?.rubric);
        await integratePageResults(page, results);
      }
      setBatchCompleted(prev => prev + 1);
    } catch (e) {
      console.error(e);
      setActiveProject(prev => prev ? ({ ...prev, unprocessedPages: prev.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'error' } : p) }) : null as any);
    } finally { setProcessingCount(prev => Math.max(0, prev - 1)); }
  };

  // V4.10.0: Effekt som starter prosessering av køen når fasiten blir tilgjengelig
  useEffect(() => {
    if (activeProject?.rubric && (activeProject.unprocessedPages || []).some(p => p.status === 'pending') && processingCount === 0) {
      const pendingPages = activeProject.unprocessedPages!.filter(p => p.status === 'pending');
      if (pendingPages.length > 0) {
        setBatchTotal(prev => prev + pendingPages.length);
        setProcessingCount(pendingPages.length);
        pendingPages.forEach(p => processSinglePage(p));
      }
    }
  }, [activeProject?.rubric]);

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    setBatchTotal(fileList.length);
    setProcessingCount(fileList.length);
    const allPages: Page[] = [];
    for (const f of fileList) {
      const pages = await processFileToImages(f);
      allPages.push(...pages);
      setBatchCompleted(prev => prev + 1);
    }
    const updated = { ...activeProject, taskFiles: [...activeProject.taskFiles, ...allPages] };
    setActiveProject(updated);
    await handleGenerateRubric(updated);
    setProcessingCount(0);
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    let allPages: Page[] = [];
    for (const f of fileList) {
      const pgs = await processFileToImages(f);
      allPages = [...allPages, ...pgs];
    }
    
    // Oppdaterer alltid unprocessedPages slik at de dukker opp i grensesnittet
    updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...allPages] });
    
    // Hvis rubrikken allerede er der, start prosessering med en gang
    if (activeProject.rubric) {
        setBatchTotal(allPages.length);
        setBatchCompleted(0);
        setProcessingCount(allPages.length);
        for (const p of allPages) { await processSinglePage(p); }
        await handleSmartCleanup();
    }
  };

  const handleDriveImport = async (folderId: string) => {
    if (!activeProject) return;
    setCurrentAction("Henter fil-liste fra Drive...");
    setRubricStatus({ loading: true, text: "Kobler til Google Drive..." });
    
    try {
      const files = await fetchImagesFromDriveFolder(folderId);
      if (files.length === 0) throw new Error("Ingen relevante filer funnet i mappen.");
      
      setBatchTotal(files.length);
      setBatchCompleted(0);
      let allNewPages: Page[] = [];

      for (const file of files) {
        setCurrentAction(`Laster ned ${file.name}...`);
        const { data, mimeType } = await downloadDriveFile(file.id);
        
        const id = Math.random().toString(36).substring(7);
        await saveMedia(id, data);
        const thumb = await createThumbnailFromBase64(data);
        const newPage: Page = {
          id,
          fileName: file.name,
          imagePreview: thumb,
          contentHash: Math.random().toString(36),
          mimeType,
          status: 'pending',
          rotation: 0
        };
        allNewPages.push(newPage);
        setBatchCompleted(prev => prev + 1);
      }

      updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...allNewPages] });

      if (activeProject.rubric) {
        setBatchTotal(allNewPages.length);
        setBatchCompleted(0);
        setProcessingCount(allNewPages.length);
        for (const p of allNewPages) { await processSinglePage(p); }
        await handleSmartCleanup();
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setRubricStatus({ loading: false, text: "" });
      setCurrentAction("");
    }
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || proj.taskFiles.length === 0) return;
    setRubricStatus({ loading: true, text: 'Genererer rettemanual...' });
    try {
      const taskFilesWithMedia = await Promise.all(proj.taskFiles.map(async f => ({ ...f, base64Data: (await getMedia(f.id))?.split(',')[1] || "" })));
      const rubric = await generateRubricFromTaskAndSamples(taskFilesWithMedia);
      setActiveProject(prev => prev ? { ...prev, rubric } : null);
      // Nullstill batch-tellere her slik at elev-prosesseringen starter friskt
      setBatchTotal(0);
      setBatchCompleted(0);
    } catch (e) { console.error(e); } finally { setRubricStatus({ loading: false, text: '' }); }
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
      saveCandidate(cands[i]);
      setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
    }
    setRubricStatus({ loading: false, text: '' });
    setCurrentAction('');
  };

  return { 
    processingCount, batchTotal, batchCompleted, currentAction, rubricStatus, 
    handleTaskFileSelect, handleCandidateFileSelect, handleDriveImport, 
    handleEvaluateAll, handleGenerateRubric, handleRetryPage: processSinglePage, 
    handleSmartCleanup, updateActiveProject 
  };
};