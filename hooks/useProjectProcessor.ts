
import React, { useState, useEffect } from 'react';
import { Project, Page, Candidate, IdentifiedTask } from '../types';
import { processFileToImages, splitA3Spread } from '../services/fileService';
import { getMedia, saveMedia, saveCandidate } from '../services/storageService';
import { 
  transcribeAndAnalyzeImage, 
  analyzeTextContent, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate,
  reconcileProjectData
} from '../services/geminiService';

const sanitizeTaskPart = (val: string | undefined): string => {
  if (!val) return "";
  const v = val.trim().toUpperCase();
  const noise = ["NULL", "UNKNOWN", "UKJENT", "NONE", "UNDEFINED", "HELE", "ALL", "TOTAL", "EMPTY"];
  if (noise.some(n => v === n || v.includes(n))) return "UKJENT";
  return val.trim().replace(/[\.\)\:\,]+$/, "");
};

const extractTasksFallback = (text: string): IdentifiedTask[] => {
  if (!text) return [];
  const lines = text.split('\n');
  const tasks: IdentifiedTask[] = [];
  const taskPattern = /^\s*(\d+)([a-z]?)(?:[\s\)\.\:]|$)/i;
  lines.forEach(line => {
    const match = line.match(taskPattern);
    if (match && match[1]) {
      tasks.push({
        taskNumber: sanitizeTaskPart(match[1]),
        subTask: sanitizeTaskPart(match[2] || "")
      });
    }
  });
  return tasks;
};

const sanitizeId = (id: string | undefined): string => {
  if (!id || id.toLowerCase() === "null") return "Ukjent";
  const match = id.match(/\d+/);
  return match ? match[0] : id.trim() || "Ukjent";
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
    setRubricStatus({ loading: true, text: 'Kjører smart-opprydding...' });
    setCurrentAction('Slår sammen kandidater og rydder i IDer...');
    try {
      const reconciliation = await reconcileProjectData(activeProject);
      setActiveProject(prev => {
        if (!prev) return null;
        let newCandidates = [...prev.candidates];
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
        return { ...prev, candidates: newCandidates };
      });
    } catch (e) { 
      console.error("Smart Cleanup Error:", e); 
    } finally { 
      setRubricStatus({ loading: false, text: '' }); 
      setCurrentAction('');
    }
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || (proj.taskFiles?.length || 0) === 0) return;
    setRubricStatus({ loading: true, text: 'Genererer hierarkisk manual...' });
    try {
      const taskFilesWithMedia = await Promise.all((proj.taskFiles || []).map(async f => {
        const media = await getMedia(f.id);
        return { ...f, base64Data: media?.split(',')[1] || "" };
      }));
      let studentSamples = "";
      if (proj.candidates.length > 0) {
        studentSamples = proj.candidates.slice(0, 5).map(c => `ELEV ${c.id}:\n${c.pages.map(p => p.transcription).join("\n")}`).join("\n\n---\n\n");
      }
      const rubric = await generateRubricFromTaskAndSamples(taskFilesWithMedia, studentSamples);
      setActiveProject(prev => prev ? { ...prev, rubric, updatedAt: Date.now() } : null);
    } catch (e) { console.error(e); } finally { setRubricStatus({ loading: false, text: '' }); }
  };

  const integratePageResults = async (originalPage: Page, results: any[]) => {
    if (!activeProject) return;
    const processedPages: Page[] = [];
    const originalMedia = await getMedia(originalPage.id);
    const shouldSplit = results.length > 1;

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const newId = shouldSplit ? `${originalPage.id}_split_${i}` : originalPage.id;
      
      let tasks = (res.identifiedTasks || []).map((t: any) => ({
        taskNumber: sanitizeTaskPart(t.taskNumber),
        subTask: sanitizeTaskPart(t.subTask)
      })).filter((t: any) => t.taskNumber !== "");

      if (tasks.length === 0 && res.fullText) {
        tasks = extractTasksFallback(res.fullText);
      }
      const candidateIdStr = sanitizeId(res.candidateId);
      
      // VIKTIG v4.6.2: Vi roterer bildet FØR vi splitter hvis det er A3_SPREAD
      if (shouldSplit && res.layoutType === 'A3_SPREAD' && res.sideInSpread && originalMedia) {
        try {
          const side = res.sideInSpread as 'LEFT' | 'RIGHT';
          // Send med detected rotation slik at split skjer på riktig akse
          const split = await splitA3Spread(originalMedia, side, res.rotation || 0);
          await saveMedia(newId, split.preview);
          processedPages.push({ 
            ...originalPage, 
            id: newId, 
            imagePreview: split.preview, 
            candidateId: candidateIdStr, 
            part: res.part, 
            pageNumber: res.pageNumber, 
            transcription: res.fullText, 
            identifiedTasks: tasks, 
            rotation: 0, // Siden er nå ferdig rotert i bildet
            layoutType: 'A3_SPREAD',
            status: 'completed' 
          });
        } catch (e) {
          processedPages.push({ ...originalPage, id: newId, candidateId: candidateIdStr, transcription: res.fullText, status: 'completed', identifiedTasks: tasks });
        }
      } else {
        processedPages.push({ 
          ...originalPage, 
          id: newId, 
          candidateId: candidateIdStr, 
          transcription: res.fullText, 
          status: 'completed', 
          identifiedTasks: tasks,
          rotation: res.rotation || 0,
          layoutType: res.layoutType || 'A4_SINGLE'
        });
      }
    }

    setActiveProject(prev => {
      if (!prev) return null;
      let cands = [...(prev.candidates || [])];
      processedPages.forEach((newPage: Page) => {
        const cId = newPage.candidateId || "Ukjent";
        let candIndex = cands.findIndex(c => c.id === cId);
        if (candIndex === -1) {
          const newCand: Candidate = { id: cId, projectId: prev.id, name: `Kandidat ${cId}`, status: 'completed', pages: [newPage] };
          cands.push(newCand);
          saveCandidate(newCand);
        } else {
          const pageExists = cands[candIndex].pages.some(p => p.id === newPage.id);
          if (!pageExists) {
            cands[candIndex] = { ...cands[candIndex], pages: [...cands[candIndex].pages, newPage] };
            saveCandidate(cands[candIndex]);
          } else {
            cands[candIndex] = { 
              ...cands[candIndex], 
              pages: cands[candIndex].pages.map(p => p.id === newPage.id ? newPage : p) 
            };
            saveCandidate(cands[candIndex]);
          }
        }
      });
      return { ...prev, candidates: cands, unprocessedPages: (prev.unprocessedPages || []).filter(p => p.id !== originalPage.id) };
    });
  };

  const processSinglePage = async (page: Page) => {
    try {
      setCurrentAction(`Analyserer ${page.fileName}...`);
      setActiveProject(prev => prev ? ({ ...prev, unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'processing' as const } : p) }) : null);
      
      if (page.mimeType === 'text/plain') {
        const res = await analyzeTextContent(page.transcription!);
        await integratePageResults(page, [res]);
      } else {
        const media = await getMedia(page.id);
        const results = await transcribeAndAnalyzeImage({ ...page, base64Data: media?.split(',')[1] || "" });
        await integratePageResults(page, results);
      }
      
      setBatchCompleted(prev => prev + 1);
    } catch (e) {
      console.error(e);
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
        setCurrentAction(`Laster inn ${file.name}...`);
        const pages = await processFileToImages(file);
        allNewTaskPages.push(...pages);
        setBatchCompleted(prev => prev + 1);
        setProcessingCount(prev => Math.max(0, prev - 1));
      }
      
      const updatedProject = { ...activeProject, taskFiles: [...(activeProject.taskFiles || []), ...allNewTaskPages] };
      setActiveProject(updatedProject);
      await handleGenerateRubric(updatedProject);
    } catch (err) { 
      console.error(err); 
      setProcessingCount(0); 
    } finally {
      setCurrentAction('');
    }
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    let allNewPages: Page[] = [];
    
    setCurrentAction(`Forbereder ${fileList.length} filer...`);
    for (const file of fileList) {
      const pages = await processFileToImages(file);
      allNewPages = [...allNewPages, ...pages];
    }
    
    updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...allNewPages] });
    setBatchTotal(prev => prev + allNewPages.length);
    setProcessingCount(prev => prev + allNewPages.length);
    
    for (const page of allNewPages) {
      await processSinglePage(page);
    }

    setCurrentAction('Ferdig med OCR. Starter autonom opprydding...');
    await handleSmartCleanup();
  };

  const handleRetryPage = (page: Page) => {
    setProcessingCount(prev => prev + 1);
    setBatchTotal(prev => prev + 1);
    processSinglePage(page);
  };

  const handleEvaluateAll = async () => {
    if (!activeProject?.rubric) return;
    setRubricStatus({ loading: true, text: 'Vurderer besvarelser hierarkisk...' });
    try {
      const cands = [...(activeProject.candidates || [])];
      for (let i = 0; i < cands.length; i++) {
        if (cands[i].status === 'evaluated') continue;
        setCurrentAction(`Vurderer ${cands[i].name}...`);
        const evalRes = await evaluateCandidate(cands[i], activeProject.rubric);
        cands[i] = { ...cands[i], evaluation: evalRes, status: 'evaluated' };
        saveCandidate(cands[i]);
        setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
      }
    } catch (e) { console.error(e); } finally { 
      setRubricStatus({ loading: false, text: '' }); 
      setCurrentAction('');
    }
  };

  return { processingCount, batchTotal, batchCompleted, currentAction, rubricStatus, handleTaskFileSelect, handleCandidateFileSelect, handleEvaluateAll, handleGenerateRubric, handleRetryPage, handleSmartCleanup, updateActiveProject };
};
