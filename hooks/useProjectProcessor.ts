
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, Page, Candidate, IdentifiedTask, RubricCriterion, Rubric } from '../types';
import { processFileToImages, splitImageInHalf, getImageDimensions, generateHash, processImageRotation } from '../services/fileService';
import { getMedia, saveMedia, saveCandidate, saveProject, deleteCandidate } from '../services/storageService';
import { 
  transcribeAndAnalyzeImage, 
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
  const [activePageId, setActivePageId] = useState<string | null>(null); 
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string; errorType?: 'PRO_QUOTA' | 'GENERIC' }>({ loading: false, text: '' });
  const [useFlashFallback, setUseFlashFallback] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  
  const isBatchProcessing = useRef(false);
  const isStoppingEvaluation = useRef(false);
  const retryCounts = useRef<Record<string, number>>({});
  
  // v7.9.33: Abort Controller for skipping pages
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const activeProjectRef = useRef(activeProject);
  const useFlashFallbackRef = useRef(useFlashFallback);

  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  useEffect(() => { useFlashFallbackRef.current = useFlashFallback; }, [useFlashFallback]);

  // v7.9.15: Auto-resume when network is restored
  useEffect(() => {
    const handleOnline = () => {
      console.log("📶 Nettverk gjenopprettet. Forsøker å restarte kø...");
      isBatchProcessing.current = false; 
      retryCounts.current = {}; // Reset retries on network restore
      setRetryTrigger(prev => prev + 1); 
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const getActiveReasoningModel = () => useFlashFallbackRef.current ? OCR_MODEL : PRO_MODEL;

  const updateActiveProject = useCallback((updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  }, [setActiveProject]);

  // v7.9.33: Manual Skip Function
  const handleSkipFile = () => {
    if (abortControllerRef.current) {
      console.log("⏭️ Bruker ba om å hoppe over filen. Avbryter API-kall...");
      abortControllerRef.current.abort();
    }
  };

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

  const handleGenerateRubric = async (overrideProject?: Project) => {
    // ... existing implementation ...
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
        let filteredTasks = (res.identifiedTasks || []).map((t: IdentifiedTask) => {
           let cleanNum = t.taskNumber;
           const isDoubleDigit = /^(\d)\1$/.test(cleanNum); 
           
           if (isDoubleDigit) {
              const singleDigit = cleanNum[0];
              const singleLabel = `${singleDigit}${t.subTask || ''}`.toUpperCase();
              const doubleLabel = `${cleanNum}${t.subTask || ''}`.toUpperCase();
              
              if (hasRubric) {
                 if (!validTaskStrings.has(doubleLabel) && validTaskStrings.has(singleLabel)) {
                    cleanNum = singleDigit;
                 }
              } else {
                 cleanNum = singleDigit;
              }
           }
           return { ...t, taskNumber: cleanNum };
        }).filter((t: IdentifiedTask) => {
          if (!t.taskNumber) return false; 
          if (hasRubric) {
             const taskLabel = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
             return validTaskStrings.has(taskLabel);
          }
          return true; 
        });

        let rawId = res.candidateId === "UKJENT" ? `UKJENT_${pageToSave.id}` : res.candidateId;
        if (rawId && !rawId.startsWith("UKJENT")) rawId = rawId.replace(/^Kandidat\s*:?\s*/i, "").trim();
        let candId = rawId || `UKJENT_${pageToSave.id}`;
        
        const cleanBaseName = (name: string) => name.replace(/\s*\([VHØN]\)$/i, "").replace(/\.[^/.]+$/, "").trim();
        const currentBaseName = cleanBaseName(pageToSave.fileName);
        const isUnknownStart = candId.startsWith("UKJENT");

        if (isUnknownStart) {
            const siblingCandidate = newCandidates.find(c => 
                !c.id.startsWith("UKJENT") && 
                c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName)
            );
            if (siblingCandidate) {
                candId = siblingCandidate.id;
            }
        }

        const textToScan = res.fullText || res.transcription || "";
        const existingCand = newCandidates.find(c => c.id === candId);
        
        let currentContextTaskNum: string | null = null;
        if (existingCand) {
           const prevPageNum = (res.pageNumber || pageToSave.pageNumber || 0) - 1;
           const prevPage = existingCand.pages.find(p => p.pageNumber === prevPageNum);
           if (prevPage && prevPage.identifiedTasks && prevPage.identifiedTasks.length > 0) {
              currentContextTaskNum = prevPage.identifiedTasks[prevPage.identifiedTasks.length - 1].taskNumber;
              if (prevPage.part === "Del 2" && finalPart !== "Del 2") finalPart = "Del 2"; 
           }
        }

        const smartRegex = /(?:^|\n|\[)\s*(?:opg(?:ave)?\.?|oppg\.?)?(?:(\d+)(?:[\.\)\s]*)([a-zæøå]*)|([a-zæøå])(?:\)|:|\.))/gmi;
        
        let match;
        while ((match = smartRegex.exec(textToScan)) !== null) {
           let explicitNum = match[1]; 
           const explicitLetter = match[2]; 
           const orphanLetter = match[3]; 

           if (explicitNum && /^(\d)\1$/.test(explicitNum)) {
              if (hasRubric) {
                 const single = explicitNum[0];
                 const label = `${single}${explicitLetter || ''}`.toUpperCase();
                 if (validTaskStrings.has(label)) explicitNum = single;
              } else {
                 explicitNum = explicitNum[0];
              }
           }

           if (explicitNum) {
              currentContextTaskNum = explicitNum; 
              const letter = explicitLetter ? explicitLetter.toLowerCase() : "";
              const label = `${explicitNum}${letter}`.toUpperCase();
              if (validTaskStrings.has(label)) {
                 const exists = filteredTasks.some((t: IdentifiedTask) => `${t.taskNumber}${t.subTask}`.toUpperCase() === label);
                 if (!exists) {
                    filteredTasks.push({ taskNumber: explicitNum, subTask: letter });
                 }
              }
           } else if (orphanLetter && currentContextTaskNum) {
              const letter = orphanLetter.toLowerCase();
              const label = `${currentContextTaskNum}${letter}`.toUpperCase();
              if (validTaskStrings.has(label)) {
                 const exists = filteredTasks.some((t: IdentifiedTask) => `${t.taskNumber}${t.subTask}`.toUpperCase() === label);
                 if (!exists) {
                    filteredTasks.push({ taskNumber: currentContextTaskNum, subTask: letter });
                 }
              }
           }
        }

        if (textToScan.includes("Del 2") || textToScan.includes("Med hjelpemidler")) {
           finalPart = "Del 2";
        }

        const newPage: Page = {
          ...pageToSave,
          id: pageId,
          candidateId: candId.startsWith("UKJENT") ? "UKJENT" : candId,
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
          candIdx = newCandidates.length - 1;
        } else {
          newCandidates[candIdx] = {
            ...newCandidates[candIdx],
            pages: [...newCandidates[candIdx].pages, newPage].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
          };
          saveCandidate(newCandidates[candIdx]);
        }

        if (!candId.startsWith("UKJENT")) {
             const unknownSiblingIndex = newCandidates.findIndex(c => 
                c.id.startsWith("UKJENT") && 
                c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName)
             );

             if (unknownSiblingIndex !== -1) {
                 const unknownCand = newCandidates[unknownSiblingIndex];
                 const rescuedPages = unknownCand.pages.map(p => ({ ...p, candidateId: candId }));
                 
                 const updatedCand = newCandidates[candIdx];
                 updatedCand.pages = [...updatedCand.pages, ...rescuedPages].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0));
                 newCandidates[candIdx] = updatedCand;
                 saveCandidate(updatedCand);
                 
                 newCandidates = newCandidates.filter(c => c.id !== unknownCand.id);
                 deleteCandidate(unknownCand.id);
             }
        }
      });

      return { ...prev, candidates: newCandidates, unprocessedPages: newUnprocessed };
    });
  };

  useEffect(() => {
    if (isBatchProcessing.current || !activeProject) return;
    
    const hasPending = (activeProject.unprocessedPages || []).some(p => p.status === 'pending');
    if (!hasPending) {
      setEtaSeconds(null);
      return;
    }

    const processQueue = async () => {
      isBatchProcessing.current = true;
      let hasMore = true;
      const failedIds = new Set<string>();
      const processedIds = new Set<string>();
      
      const batchStartTime = Date.now();
      let localProcessedCount = 0;
      let localBatchCompleted = 0;
      
      const pendingCount = (activeProjectRef.current?.unprocessedPages || []).filter(p => p.status === 'pending').length;
      setBatchTotal(prev => Math.max(prev, pendingCount)); 
      setBatchCompleted(0);

      while (hasMore) {
        const currentProject = activeProjectRef.current;
        if (!currentProject) break;

        const pendingPages = (currentProject.unprocessedPages || []).filter(p => p.status === 'pending');
        const remaining = pendingPages.length;
        setBatchTotal(prevTotal => {
           const realTotal = localBatchCompleted + remaining;
           return Math.max(prevTotal, realTotal);
        });

        const page = pendingPages.find(p => !failedIds.has(p.id) && !processedIds.has(p.id));
        
        if (!page) {
          hasMore = false;
          break;
        }

        setActivePageId(page.id);
        processedIds.add(page.id);
        
        // v7.9.33: Initialize AbortController for this file
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
          // STEP 1: FORCE SPLIT & ORIENTATION
          if (page.mimeType.startsWith('image/') && !page.layoutType) {
             setCurrentAction(`Geometri-sjekk: ${page.fileName}...`);
             const base64 = await getMedia(page.id);
             if (!base64) throw new Error("Mangler bildedata");

             let split1 = await splitImageInHalf(base64, 1);
             let split2 = await splitImageInHalf(base64, 2);
             
             if (!split1.isLandscapeSplit) {
                split1.fullRes = await processImageRotation(split1.fullRes, 90);
                split2.fullRes = await processImageRotation(split2.fullRes, 90);
             }
             
             const id1 = `${page.id}_1`;
             const id2 = `${page.id}_2`;
             
             await Promise.all([saveMedia(id1, split1.fullRes), saveMedia(id2, split2.fullRes)]);
             
             const s1Suffix = split1.isLandscapeSplit ? '(V)' : '(Ø)';
             const s2Suffix = split2.isLandscapeSplit ? '(H)' : '(N)';

             const processedPages: Page[] = [
               { ...page, id: id1, base64Data: undefined, contentHash: generateHash(split1.fullRes), fileName: `${page.fileName} ${s1Suffix}`, layoutType: 'A4_SINGLE', rotation: 0, mimeType: 'image/jpeg' },
               { ...page, id: id2, base64Data: undefined, contentHash: generateHash(split2.fullRes), fileName: `${page.fileName} ${s2Suffix}`, layoutType: 'A4_SINGLE', rotation: 0, mimeType: 'image/jpeg' }
             ];

             setActiveProject(prev => {
                if (!prev) return null;
                const oldList = prev.unprocessedPages || [];
                const idx = oldList.findIndex(p => p.id === page.id);
                if (idx === -1) return prev;
                const newList = [...oldList];
                newList.splice(idx, 1, ...processedPages);
                return { ...prev, unprocessedPages: newList };
             });

             continue; 
          }

          // STEP 2: TRANSCRIPTION
          if (currentProject.rubric && currentProject.rubric.criteria.length > 0) {
             if (page.mimeType === 'text/plain') {
                setCurrentAction(`Analyserer digital tekst: ${page.fileName}...`);
                const res = await analyzeTextContent(page.rawText || "", activeProjectRef.current?.rubric, page.attachedImages, signal);
                setCurrentAction(`Lagrer analyse for ${page.fileName}...`);
                await integratePageResults(page, [res]);
             } else {
                setCurrentAction(`🚀 Sender til Google: ${page.fileName}...`);
                const base64 = await getMedia(page.id);
                if (base64) {
                  // LOGGING DIAGNOSTICS FOR HEAVY FILES
                  const sizeInMB = base64.length / 1024 / 1024;
                  if (sizeInMB > 15) console.warn(`⚠️ Veldig stor fil (${sizeInMB.toFixed(1)} MB): ${page.fileName}. Kan forårsake timeouts.`);

                  const pWithData = { ...page, base64Data: base64.split(',')[1] };
                  // Venter på svar fra Google...
                  const results = await transcribeAndAnalyzeImage(pWithData, activeProjectRef.current?.rubric, signal);
                  setCurrentAction(`🧠 Tolker og lagrer: ${page.fileName}...`);
                  await integratePageResults(page, results);
                }
             }
             localBatchCompleted++;
             setBatchCompleted(localBatchCompleted);
             
             localProcessedCount++;
             const elapsedTime = Date.now() - batchStartTime;
             const averageTimePerItem = elapsedTime / localProcessedCount;
             setBatchTotal(currentTotal => {
                const remaining = currentTotal - localBatchCompleted;
                const estSeconds = (averageTimePerItem * remaining) / 1000;
                setEtaSeconds(Math.round(estSeconds));
                return currentTotal;
             });
          }
          
        } catch (e: any) {
           // v7.9.33: Handle Abort (User Skip)
           if (e.name === 'AbortError' || e.message === 'Aborted') {
             console.log(`Fil ${page.fileName} ble hoppet over av bruker.`);
             updateActiveProject({ 
               unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'skipped', statusLabel: 'Hoppet over' } : p) 
             });
             continue; // Immediately go to next file
           }

           const msg = e?.message || String(e);
           const isNetworkError = msg.includes("fetch failed") || msg.includes("NetworkError") || msg.includes("503") || msg.includes("504") || msg.includes("Failed to fetch") || msg.includes("timeout") || msg.includes("timed out");
           
           const currentRetries = retryCounts.current[page.id] || 0;
           
           if (isNetworkError && currentRetries < 3) { 
              retryCounts.current[page.id] = currentRetries + 1;
              console.warn(`Nettverksfeil/Timeout på side ${page.id}. Forsøk ${currentRetries + 1}/3.`);
              setCurrentAction(`⚠️ Tidsavbrudd på ${page.fileName}. Forsøk ${currentRetries + 1}/3...`);
              processedIds.delete(page.id); 
              await new Promise(r => setTimeout(r, 5000));
              continue; 
           }

           console.error(`Feil under prosessering av ${page.id} (Retries: ${currentRetries}):`, e);
           failedIds.add(page.id); 
           updateActiveProject({ 
             unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error', statusLabel: isNetworkError ? 'Tidsavbrudd' : 'Feilet' } : p) 
           });
        }
        
        await new Promise(r => setTimeout(r, 20)); 
      }

      setActivePageId(null);
      abortControllerRef.current = null;
      isBatchProcessing.current = false;
      setCurrentAction('');
      setBatchTotal(0);
      setBatchCompleted(0);
      setEtaSeconds(null);
    };

    processQueue();
  }, [activeProject?.unprocessedPages, activeProject?.rubric, retryTrigger]);

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
    processingCount, batchTotal, batchCompleted, currentAction, activePageId, rubricStatus, 
    useFlashFallback, setUseFlashFallback,
    etaSeconds, 
    handleTaskFileSelect,
    handleCandidateFileSelect,
    // REMOVED handleDriveImport
    handleSkipFile, 
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
