
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, Page, Candidate, IdentifiedTask, RubricCriterion, Rubric } from '../types';
import { processFileToImages, splitA3Spread, processImageRotation, getImageDimensions, generateHash } from '../services/fileService';
import { getMedia, saveMedia, saveCandidate, saveProject } from '../services/storageService';
import { extractFolderId, fetchImagesFromDriveFolder, downloadDriveFile } from '../services/driveService';
import { 
  transcribeAndAnalyzeImage, 
  detectPageLayout,
  analyzeTextContent, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate,
  reconcileProjectData,
  regenerateSingleCriterion,
  PRO_MODEL,
  OCR_MODEL
} from '../services/geminiService';

export const useProjectProcessor = (
  activeProject: Project | null, 
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>
) => {
  const [processingCount, setProcessingCount] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCompleted, setBatchCompleted] = useState(0);
  const [currentAction, setCurrentAction] = useState<string>('');
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string; errorType?: 'PRO_QUOTA' | 'GENERIC' }>({ loading: false, text: '' });
  const [useFlashFallback, setUseFlashFallback] = useState(false);
  
  const isBatchProcessing = useRef(false);
  const isStoppingEvaluation = useRef(false);
  
  const activeProjectRef = useRef(activeProject);
  const useFlashFallbackRef = useRef(useFlashFallback);

  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  useEffect(() => { useFlashFallbackRef.current = useFlashFallback; }, [useFlashFallback]);

  const getActiveReasoningModel = () => useFlashFallbackRef.current ? OCR_MODEL : PRO_MODEL;

  const updateActiveProject = useCallback((updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  }, [setActiveProject]);

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessingCount(prev => prev + files.length);
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      setCurrentAction(`Laster oppgave: ${file.name}...`);
      const processed = await processFileToImages(file);
      
      setActiveProject(prev => {
        if (!prev) return null;
        return { 
          ...prev, 
          taskFiles: [...prev.taskFiles, ...processed],
          updatedAt: Date.now()
        };
      });
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
    setCurrentAction('');
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessingCount(prev => prev + files.length);
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      setCurrentAction(`Laster elevfil: ${file.name}...`);
      const processed = await processFileToImages(file);
      
      setActiveProject(prev => {
        if (!prev) return null;
        const currentUnprocessed = prev.unprocessedPages || [];
        return { 
          ...prev, 
          unprocessedPages: [...currentUnprocessed, ...processed],
          updatedAt: Date.now()
        };
      });
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
    setCurrentAction('');
  };

  const handleDriveImport = async (url: string) => {
    if (!activeProject) return;
    const folderId = extractFolderId(url);
    if (!folderId) {
      alert("Ugyldig Google Drive lenke.");
      return;
    }

    try {
      setRubricStatus({ loading: true, text: 'Kobler til Google Drive...', errorType: undefined });
      const files = await fetchImagesFromDriveFolder(folderId);
      
      if (files.length === 0) {
        alert("Fant ingen bilder eller PDF-er i mappen.");
        setRubricStatus({ loading: false, text: '' });
        return;
      }

      setProcessingCount(prev => prev + files.length);
      setRubricStatus({ loading: false, text: '' });

      for (const f of files) {
        setCurrentAction(`Laster ned fra Drive: ${f.name}...`);
        try {
          const blob = await downloadDriveFile(f.id);
          const file = new File([blob], f.name, { type: f.mimeType });
          const processed = await processFileToImages(file);

          setActiveProject(prev => {
            if (!prev) return null;
            const currentUnprocessed = prev.unprocessedPages || [];
            return { 
              ...prev, 
              unprocessedPages: [...currentUnprocessed, ...processed],
              updatedAt: Date.now()
            };
          });
        } catch (e) {
          console.error(`Feil ved nedlasting av ${f.name}`, e);
        }
        setProcessingCount(prev => Math.max(0, prev - 1));
      }
      setCurrentAction('');

    } catch (e: any) {
      console.error(e);
      setRubricStatus({ loading: false, text: '' });
      alert(`Drive Feil: ${e.message}. Sjekk at API-nøkkelen har Drive API aktivert.`);
    }
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || proj.taskFiles.length === 0) return;
    
    setRubricStatus({ loading: true, text: 'Genererer rettemanual...', errorType: undefined });
    try {
      const taskFilesWithMedia = await Promise.all(proj.taskFiles.map(async f => {
        if (f.mimeType === 'text/plain') return f;
        const base64 = await getMedia(f.id);
        return { ...f, base64Data: base64?.split(',')[1] || "" };
      }));
      
      const model = getActiveReasoningModel();
      const rubric = await generateRubricFromTaskAndSamples(taskFilesWithMedia, model);
      updateActiveProject({ rubric });
      setRubricStatus({ loading: false, text: '', errorType: undefined });
    } catch (e: any) { 
      const msg = e?.message || String(e);
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        setRubricStatus({ loading: false, text: 'Pro-kvote overskredet', errorType: 'PRO_QUOTA' });
      } else {
        setRubricStatus({ loading: false, text: 'Feil ved generering', errorType: 'GENERIC' });
      }
    }
  };

  // UPDATED v6.6.4: Context-Aware Orphan Logic
  const integratePageResults = async (pageToSave: Page, results: any[], parentIdToRemove?: string) => {
    setActiveProject(prev => {
      if (!prev) return null;
      let newCandidates = [...prev.candidates];
      
      const removeId = parentIdToRemove || pageToSave.id;
      let newUnprocessed = (prev.unprocessedPages || []).filter(p => p.id !== removeId);

      const hasRubric = !!prev.rubric && (prev.rubric.criteria.length > 0);
      const validTaskStrings = new Set(prev.rubric?.criteria.map(c => 
        `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
      ) || []);

      results.forEach(async (res, idx) => {
        const isBlank = (res.fullText || res.transcription || "").includes("[TOM SIDE]") || (res.fullText || "").length < 15;
        const isUnknown = !res.candidateId || res.candidateId === "UKJENT";
        
        if (isBlank && isUnknown) {
          console.log(`Auto-discarding blank page from ${pageToSave.fileName}`);
          return;
        }

        const pageId = pageToSave.id + (results.length > 1 ? `_${idx}` : '');
        let finalPart = res.part;
        let filteredTasks = (res.identifiedTasks || []).filter((t: IdentifiedTask) => {
          if (!t.taskNumber) return false; 
          if (hasRubric) {
             const taskLabel = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
             return validTaskStrings.has(taskLabel);
          }
          return true; 
        });

        // REGEX RESCUE & SEQUENTIAL CONTEXT
        const textToScan = res.fullText || res.transcription || "";
        
        // 1. Check for standard badges (e.g. "1a")
        const stdRegex = /(?:^|\n)\s*(\d+)\s*([a-zæøå])(?:\)|:|\.|\s|$)/gmi;
        let match;
        while ((match = stdRegex.exec(textToScan)) !== null) {
           const num = match[1];
           const letter = match[2];
           const label = `${num}${letter}`.toUpperCase();
           if (validTaskStrings.has(label)) {
              const exists = filteredTasks.some((t: IdentifiedTask) => `${t.taskNumber}${t.subTask}`.toUpperCase() === label);
              if (!exists) filteredTasks.push({ taskNumber: num, subTask: letter.toLowerCase() });
           }
        }

        // 2. ORPHAN LOGIC (Detect "c)" without number, link to previous page)
        // Only run if we have a candidate context
        let rawId = res.candidateId === "UKJENT" ? `UKJENT_${pageToSave.id}` : res.candidateId;
        if (rawId && !rawId.startsWith("UKJENT")) rawId = rawId.replace(/^Kandidat\s*:?\s*/i, "").trim();
        const candId = rawId || `UKJENT_${pageToSave.id}`;
        
        const existingCand = newCandidates.find(c => c.id === candId);
        if (existingCand) {
           // Find the previous page (physically preceding page)
           const prevPageNum = (res.pageNumber || pageToSave.pageNumber || 0) - 1;
           const prevPage = existingCand.pages.find(p => p.pageNumber === prevPageNum);

           if (prevPage) {
              // A: Inherit Part (If prev page was Del 2, and current is unclear, assume flow)
              if (prevPage.part === "Del 2" && finalPart !== "Del 2") {
                 // Check if text starts with orphan pattern, indicating flow
                 if (/^(?:[a-zæøå])(?:\)|:|\.)/m.test(textToScan)) {
                    finalPart = "Del 2";
                 }
              }

              // B: Link Orphan Tasks
              const orphanRegex = /(?:^|\n)\s*([a-zæøå])(?:\)|:|\.)/gmi;
              let orphanMatch;
              while ((orphanMatch = orphanRegex.exec(textToScan)) !== null) {
                 const letter = orphanMatch[1];
                 const lastPrevTask = prevPage.identifiedTasks?.[prevPage.identifiedTasks.length - 1];
                 
                 if (lastPrevTask && lastPrevTask.taskNumber) {
                    const inferredLabel = `${lastPrevTask.taskNumber}${letter}`;
                    if (validTaskStrings.has(inferredLabel.toUpperCase())) {
                       const exists = filteredTasks.some((t: IdentifiedTask) => `${t.taskNumber}${t.subTask}`.toUpperCase() === inferredLabel.toUpperCase());
                       if (!exists) {
                          filteredTasks.push({ taskNumber: lastPrevTask.taskNumber, subTask: letter.toLowerCase() });
                          // Force part inheritance if we successfully linked a task
                          if (prevPage.part) finalPart = prevPage.part;
                       }
                    }
                 }
              }
           }
        }

        const newPage: Page = {
          ...pageToSave,
          id: pageId,
          candidateId: res.candidateId || "UKJENT",
          pageNumber: res.pageNumber || pageToSave.pageNumber,
          part: finalPart,
          transcription: textToScan,
          visualEvidence: res.visualEvidence,
          identifiedTasks: filteredTasks,
          status: 'completed',
          rotation: 0 
        };

        let candIdx = newCandidates.findIndex(c => c.id === candId);
        
        if (candIdx === -1) {
          const newCand: Candidate = {
            id: candId,
            projectId: prev.id,
            name: candId.startsWith("UKJENT") ? `Ukjent (${pageToSave.fileName})` : candId,
            pages: [newPage],
            status: 'completed'
          };
          newCandidates.push(newCand);
          saveCandidate(newCand);
        } else {
          newCandidates[candIdx] = {
            ...newCandidates[candIdx],
            pages: [...newCandidates[candIdx].pages, newPage].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
          };
          saveCandidate(newCandidates[candIdx]);
        }
      });

      return { ...prev, candidates: newCandidates, unprocessedPages: newUnprocessed };
    });
  };

  useEffect(() => {
    if (isBatchProcessing.current || !activeProject) return;
    
    const initialPending = (activeProject.unprocessedPages || []).filter(p => p.status === 'pending');
    if (initialPending.length === 0) return;

    // Safety Lock v6.6.1: Ikke start prosessering hvis fasiten er tom (hindrer "ghost runs")
    if (!activeProject.rubric || activeProject.rubric.criteria.length === 0) {
      return;
    }

    const processQueue = async () => {
      isBatchProcessing.current = true;
      let hasMore = true;
      const failedIds = new Set<string>();
      const processedIds = new Set<string>();
      
      setBatchTotal(initialPending.length); 
      setBatchCompleted(0);

      while (hasMore) {
        const currentPending = (activeProjectRef.current?.unprocessedPages || [])
          .filter(p => p.status === 'pending' && !failedIds.has(p.id) && !processedIds.has(p.id));
        
        if (currentPending.length === 0) {
          hasMore = false;
          break;
        }

        setBatchTotal(prev => Math.max(prev, batchCompleted + currentPending.length));
        const page = currentPending[0];
        processedIds.add(page.id); 
        
        try {
          if (page.mimeType === 'text/plain') {
            setCurrentAction(`Analyserer tekst: ${page.fileName}...`);
            const res = await analyzeTextContent(page.rawText || "", activeProjectRef.current?.rubric);
            await integratePageResults(page, [res]);
          } else {
            // DETERMINISTIC LANDSCAPE SPLIT v6.6.5 (Recursive Logic)
            const base64 = await getMedia(page.id);
            if (!base64) throw new Error("Mangler bildedata");

            const dimensions = await getImageDimensions(base64);
            const isLandscape = dimensions.width > dimensions.height;
            
            let finalPagesToTranscribe: Page[] = [];

            // Helper to handle splitting
            const performSplit = async (b64ToSplit: string) => {
               const leftSplit = await splitA3Spread(b64ToSplit, 'LEFT', 0);
               const rightSplit = await splitA3Spread(b64ToSplit, 'RIGHT', 0);
               
               const idL = `${page.id}_L`;
               const idR = `${page.id}_R`;
               
               const leftB64 = leftSplit.fullRes.split(',')[1];
               const rightB64 = rightSplit.fullRes.split(',')[1];

               await Promise.all([
                 saveMedia(idL, leftSplit.fullRes),
                 saveMedia(idR, rightSplit.fullRes)
               ]);
               
               return [
                 { 
                   ...page, 
                   id: idL, 
                   base64Data: leftB64, 
                   contentHash: generateHash(leftB64), 
                   fileName: `${page.fileName} (V)` 
                 },
                 { 
                   ...page, 
                   id: idR, 
                   base64Data: rightB64, 
                   contentHash: generateHash(rightB64), 
                   fileName: `${page.fileName} (H)` 
                 }
               ];
            };

            if (isLandscape) {
              setCurrentAction(`Splitter A3-oppslag: ${page.fileName}...`);
              finalPagesToTranscribe = await performSplit(base64);
            } else {
              setCurrentAction(`Sjekker orientering: ${page.fileName}...`);
              const layout = await detectPageLayout({ ...page, base64Data: base64.split(',')[1] });
              
              let correctedBase64 = base64;
              let wasRotated = false;

              if (layout.rotation !== 0) {
                setCurrentAction(`Korrigerer rotasjon (${layout.rotation}°)...`);
                correctedBase64 = await processImageRotation(base64, layout.rotation);
                await saveMedia(page.id, correctedBase64); 
                wasRotated = true;
              }

              // RECURSIVE CHECK v6.6.5: 
              // Hvis bildet ble rotert, sjekk dimensjonene på nytt. Det kan ha blitt til et A3-oppslag (Landscape).
              if (wasRotated || layout.isSpread) {
                 const newDims = await getImageDimensions(correctedBase64);
                 const isNowLandscape = newDims.width > newDims.height;
                 
                 if (isNowLandscape || layout.isSpread) {
                    setCurrentAction(`Oppdaget A3 etter rotasjon: ${page.fileName}...`);
                    finalPagesToTranscribe = await performSplit(correctedBase64);
                 } else {
                    const finalB64 = correctedBase64.split(',')[1];
                    finalPagesToTranscribe.push({ ...page, base64Data: finalB64, contentHash: generateHash(finalB64) });
                 }
              } else {
                 // Standard A4 Portrait
                 const finalB64 = correctedBase64.split(',')[1];
                 finalPagesToTranscribe.push({ ...page, base64Data: finalB64, contentHash: generateHash(finalB64) });
              }
            }

            // PHASE 3: TRANSCRIPTION
            for (const p of finalPagesToTranscribe) {
              setCurrentAction(`Transkriberer ${p.id.endsWith('_L') ? '(Venstre)' : p.id.endsWith('_R') ? '(Høyre)' : ''}...`);
              const results = await transcribeAndAnalyzeImage(p, activeProjectRef.current?.rubric);
              await integratePageResults(p, results, page.id); 
            }
          }
          
          setBatchCompleted(prev => prev + 1);
          
        } catch (e) {
           console.error("Feil under prosessering av side (400/500):", e);
           failedIds.add(page.id); 
           updateActiveProject({ 
             unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error' } : p) 
           });
        }
        
        await new Promise(r => setTimeout(r, 100)); 
      }

      isBatchProcessing.current = false;
      setCurrentAction('');
      setBatchTotal(0);
      setBatchCompleted(0);
    };

    processQueue();
  }, [activeProject?.unprocessedPages, activeProject?.rubric]);

  const handleRegeneratePage = async (candId: string, pageId: string) => {
    if (!activeProject) return;
    const candidate = activeProject.candidates.find(c => c.id === candId);
    if (!candidate) return;
    const page = candidate.pages.find(p => p.id === pageId);
    if (!page) return;

    try {
      const base64 = await getMedia(page.id);
      if (!base64) return;
      
      const results = await transcribeAndAnalyzeImage({ ...page, base64Data: base64.split(',')[1], forceRescan: true } as any, activeProject.rubric);
      await integratePageResults(page, results);
    } catch (e) { console.error(e); }
  };

  const handleRegenerateCriterion = async (name: string) => {
    if (!activeProject?.rubric) return;
    const criterion = activeProject.rubric.criteria.find(c => c.name === name);
    if (!criterion) return;
    try {
      const updates = await regenerateSingleCriterion(criterion, getActiveReasoningModel());
      const newCriteria = activeProject.rubric.criteria.map(c => 
        c.name === name ? { ...c, ...updates } : c
      );
      updateActiveProject({ rubric: { ...activeProject.rubric, criteria: newCriteria } });
    } catch (e) { console.error(e); }
  };

  return { 
    processingCount, batchTotal, batchCompleted, currentAction, rubricStatus, 
    useFlashFallback, setUseFlashFallback,
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleDriveImport, 
    handleEvaluateAll: async (force: boolean = false) => {
      if (!activeProject?.rubric) return;
      isStoppingEvaluation.current = false;
      setRubricStatus({ loading: true, text: 'Vurderer besvarelser...' });
      const cands = [...activeProject.candidates];
      for (let i = 0; i < cands.length; i++) {
        if (isStoppingEvaluation.current) break;
        if (!force && cands[i].status === 'evaluated') continue;
        setCurrentAction(`Vurderer ${cands[i].name}...`);
        try {
          const res = await evaluateCandidate(cands[i], activeProject.rubric, getActiveReasoningModel());
          cands[i] = { ...cands[i], evaluation: res, status: 'evaluated' as const };
          await saveCandidate(cands[i]);
          setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
        } catch (e) {}
      }
      setRubricStatus({ loading: false, text: '' });
      setCurrentAction('');
    },
    handleEvaluateCandidate: async (id: string) => {
      if (!activeProject?.rubric) return;
      const cand = activeProject.candidates.find(c => c.id === id);
      if (!cand) return;
      setRubricStatus({ loading: true, text: `Vurderer ${cand.name}...` });
      try {
        const res = await evaluateCandidate(cand, activeProject.rubric, getActiveReasoningModel());
        const updated = { ...cand, evaluation: res, status: 'evaluated' as const };
        await saveCandidate(updated);
        setActiveProject(prev => prev ? ({ ...prev, candidates: prev.candidates.map(c => c.id === id ? updated : c) }) : null);
      } finally { setRubricStatus({ loading: false, text: '' }); }
    },
    handleGenerateRubric, 
    handleRegenerateCriterion,
    handleSmartCleanup: async () => {
      if (!activeProject) return;
      setRubricStatus({ loading: true, text: 'Kjører smart-rydding v6.1.8...' });
      try { 
        const updatedCandidates = await reconcileProjectData(activeProject);
        for (const cand of updatedCandidates) {
          for (const page of cand.pages) {
            if ((page as any).needsRepair) {
              setCurrentAction(`Reparerer layout: ${page.fileName}...`);
              await handleRegeneratePage(cand.id, page.id);
            }
          }
          await saveCandidate(cand);
        }
        updateActiveProject({ candidates: updatedCandidates });
      } finally { 
        setRubricStatus({ loading: false, text: '' }); 
        setCurrentAction('');
      }
    },
    handleRetryPage: (p: Page) => {
      updateActiveProject({ unprocessedPages: (activeProject?.unprocessedPages || []).map(pg => pg.id === p.id ? { ...pg, status: 'pending' } : pg) });
    },
    handleRegeneratePage,
    updateActiveProject 
  };
};
