
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Project, Page, Rubric, Candidate, IdentifiedTask, RubricCriterion } from '../types';
import { 
  OCR_MODEL, 
  analyzeTextContent, 
  transcribeAndAnalyzeImage, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate, 
  regenerateSingleCriterion, 
  reconcileProjectData, 
  improveRubricWithStudentData 
} from '../services/geminiService';
import { 
  deleteMedia, 
  getMedia, 
  saveMedia, 
  saveCandidate, 
  deleteCandidate 
} from '../services/storageService';
import { 
  processFileToImages, 
  generateHash, 
  splitImageInHalf, 
  processImageRotation 
} from '../services/fileService';

const performSequentialRescue = (candidates: Candidate[]): { updated: Candidate[], deleted: string[], modifiedIds: Set<string> } => {
    // Placeholder implementation for rescue logic to satisfy type checking
    return { updated: candidates, deleted: [], modifiedIds: new Set() };
};

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
  const [autoFlowPending, setAutoFlowPending] = useState(false); 
  
  const isBatchProcessing = useRef(false);
  const isStoppingEvaluation = useRef(false);
  const retryCounts = useRef<Record<string, number>>({});
  const rotatedIds = useRef<Set<string>>(new Set()); 
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const activeProjectRef = useRef(activeProject);
  const useFlashFallbackRef = useRef(useFlashFallback);

  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  useEffect(() => { useFlashFallbackRef.current = useFlashFallback; }, [useFlashFallback]);

  // v8.9.14: Reset transient UI state on project switch to prevent "ghost progress bars"
  useEffect(() => {
    setProcessingCount(0);
    setBatchTotal(0);
    setBatchCompleted(0);
    setCurrentAction('');
    setActivePageId(null);
    setRubricStatus({ loading: false, text: '' });
    setEtaSeconds(null);
    setAutoFlowPending(false);
    
    // Force unlock flags to ensure fresh start
    isBatchProcessing.current = false;
    retryCounts.current = {};
    rotatedIds.current = new Set();
    
    // Abort pending fetches from previous project
    if (abortControllerRef.current) {
        console.log("Project switch detected. Aborting pending operations.");
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
  }, [activeProject?.id]);

  useEffect(() => {
    const handleOnline = () => {
      console.log("📶 Nettverk gjenopprettet. Forsøker å restarte kø...");
      isBatchProcessing.current = false; 
      retryCounts.current = {}; 
      setRetryTrigger(prev => prev + 1); 
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const getActiveReasoningModel = () => OCR_MODEL;

  const updateActiveProject = useCallback((updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  }, [setActiveProject]);

  const handleSkipFile = () => {
    if (abortControllerRef.current) {
      console.log("⏭️ Bruker ba om å hoppe over filen. Avbryter API-kall...");
      abortControllerRef.current.abort();
    }
  };

  const handleDeleteUnprocessedPage = (pageId: string) => {
      if (activePageId === pageId && abortControllerRef.current) {
          console.log(`Deleting active file ${pageId}, aborting process...`);
          abortControllerRef.current.abort();
      }
      
      deleteMedia(pageId); 

      setActiveProject(prev => {
          if (!prev) return null;
          return {
              ...prev,
              unprocessedPages: (prev.unprocessedPages || []).filter(p => p.id !== pageId),
              updatedAt: Date.now()
          };
      });
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessingCount(prev => prev + files.length);
    const fileArray = Array.from(files);
    
    const sessionHashes = new Set<string>();

    for (const file of fileArray) {
      setCurrentAction(`Laster oppgave: ${file.name}...`);
      const processed = await processFileToImages(file);
      
      const currentProject = activeProjectRef.current;
      if (currentProject) {
         const existingHashes = new Set<string>(sessionHashes);
         currentProject.taskFiles.forEach(f => existingHashes.add(f.contentHash));
         
         const uniquePages = processed.filter(p => !existingHashes.has(p.contentHash));
         
         if (uniquePages.length > 0) {
            uniquePages.forEach(p => sessionHashes.add(p.contentHash));
            
            setActiveProject(prev => {
                if (!prev) return null;
                return { 
                  ...prev, 
                  taskFiles: [...prev.taskFiles, ...uniquePages],
                  updatedAt: Date.now()
                };
            });
         }
      }
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
    setCurrentAction('');
  };

  const addProcessedPagesToProject = (processed: Page[]) => {
      const uniquePages = processed.map(p => {
          const isDuplicate = activeProjectRef.current?.candidates.some(c => c.pages.some(existing => existing.contentHash === p.contentHash)) 
                           || activeProjectRef.current?.unprocessedPages?.some(existing => existing.contentHash === p.contentHash);
          
          if (isDuplicate) {
              return {
                  ...p,
                  fileName: `${p.fileName} (Kopi)`,
                  contentHash: `${p.contentHash}_COPY_${Date.now()}`
              };
          }
          return p;
      });

      if (uniquePages.length > 0) {
        setActiveProject(prev => {
            if (!prev) return null;
            const currentUnprocessed = prev.unprocessedPages || [];
            return { 
                ...prev, 
                unprocessedPages: [...currentUnprocessed, ...uniquePages],
                updatedAt: Date.now()
            };
        });
      }
  };

  const handleCandidateFileSelect = async (files: FileList, layoutMode: 'A3' | 'A4' = 'A3') => {
    if (!activeProject) return;
    setProcessingCount(prev => prev + files.length);
    setAutoFlowPending(true); 

    const fileArray = Array.from(files);

    for (const file of fileArray) {
      setCurrentAction(`Laster elevfil: ${file.name}...`);
      const processed = await processFileToImages(file);
      
      const taggedProcessed = processed.map(p => {
          if (p.mimeType.startsWith('image/') && layoutMode === 'A4') {
              return { ...p, layoutType: 'A4_SINGLE' as const };
          }
          return p;
      });

      addProcessedPagesToProject(taggedProcessed);
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
    setCurrentAction('');
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProjectRef.current;
    if (!proj || proj.taskFiles.length === 0) return;
    
    // v8.9.12: Lock the project ID to prevent cross-project corruption
    const startProjectId = proj.id;

    setRubricStatus({ loading: true, text: 'Starter fase 1: Kartlegger oppgaver...', errorType: undefined });
    
    try {
      const taskFilesWithMedia = await Promise.all(proj.taskFiles.map(async f => {
        if (f.mimeType === 'text/plain') return f;
        const base64 = await getMedia(f.id);
        return { ...f, base64Data: base64?.split(',')[1] || "" };
      }));
      
      const model = getActiveReasoningModel();
      
      const onProgress = (msg: string, partialRubric?: Rubric) => {
          if (activeProjectRef.current?.id !== startProjectId) {
              console.warn("Avbrøt oppdatering av rettemanual: Prosjektbytte detektert.");
              return;
          }
          setRubricStatus({ loading: true, text: msg, errorType: undefined });
          if (partialRubric) {
              updateActiveProject({ rubric: partialRubric });
          }
      };

      const rubric = await generateRubricFromTaskAndSamples(taskFilesWithMedia, model, onProgress);
      
      if (activeProjectRef.current?.id === startProjectId) {
          updateActiveProject({ rubric });
          setRubricStatus({ loading: false, text: '', errorType: undefined });
      }
    } catch (e: any) { 
      // v9.1.6: GHOST ERROR FIX
      // If the project has changed since we started, silently ignore errors (as they are likely AbortErrors or irrelevant)
      if (activeProjectRef.current?.id !== startProjectId) return;

      const msg = e?.message || String(e);
      if (e.name === 'AbortError' || msg.includes('Aborted')) {
          return; // Silent fail on abort
      }

      let uiMsg = 'Feil ved generering';
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) uiMsg = 'Kvote nådd (429)';
      else if (msg.includes('503') || msg.includes('504')) uiMsg = 'Server opptatt (503)';
      else if (msg.includes('timeout')) uiMsg = 'Tidsavbrudd (Timeout)';
      else if (msg.includes('400')) uiMsg = 'Ugyldig forespørsel (400)';
      else if (msg.includes('404')) uiMsg = 'Modell ikke funnet (404)';
      else if (msg.length < 50) uiMsg = msg; // Show short error messages directly
      
      setRubricStatus({ loading: false, text: uiMsg, errorType: 'GENERIC' });
    }
  };

  // v8.9.44: Auto-Trigger Rubric Generation
  useEffect(() => {
    if (
        activeProject &&
        activeProject.taskFiles.length > 0 &&
        !activeProject.rubric &&
        !rubricStatus.loading &&
        !rubricStatus.errorType &&
        processingCount <= 0 // Ensure files are processed
    ) {
        console.log("Auto-triggering rubric generation...");
        const timer = setTimeout(() => {
            handleGenerateRubric();
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [activeProject?.taskFiles, activeProject?.rubric, rubricStatus.loading, rubricStatus.errorType, processingCount]);

  const integratePageResults = async (pageToSave: Page, results: any[], parentIdToRemove?: string) => {
    const currentProject = activeProjectRef.current;
    if (!currentProject) return;

    let newCandidates = [...currentProject.candidates];
    const removeId = parentIdToRemove || pageToSave.id;
    const newUnprocessed = (currentProject.unprocessedPages || []).filter(p => p.id !== removeId);
    const hasRubric = !!currentProject.rubric && (currentProject.rubric.criteria.length > 0);
    const validTaskStrings = new Set(currentProject.rubric?.criteria.map(c => 
      `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
    ) || []);

    const pagesToDefer: Page[] = []; 
    const candidatesToDeleteIds: string[] = [];
    const idsToSave = new Set<string>();

    const cleanBaseName = (name: string) => {
       if (!name) return "";
       let clean = name.replace(/\s*\([VHØN]\)$/i, "");
       clean = clean.replace(/\.[^/.]+$/, "");
       return clean.trim();
    };
    
    const currentBaseName = cleanBaseName(pageToSave.fileName);
    const isDigital = pageToSave.mimeType === 'text/plain'; 

    for (const res of results) {
        const isBlank = (res.fullText || res.transcription || "").includes("[TOM SIDE]") || (res.fullText || "").length < 15;
        let rawId = res.candidateId === "UKJENT" ? `UKJENT_${pageToSave.id}` : res.candidateId;
        
        if (rawId && !rawId.startsWith("UKJENT")) {
            if (/^(ikke\s*oppgitt|ukjent|unknown|ingen)$/i.test(rawId)) {
                rawId = ""; 
            } else {
                rawId = rawId.trim().replace(/^(?:kandidat|kand|cand)(?:nummer|nr|\.|_)?\s*:?\s*/i, "").trim();
                rawId = rawId.replace(/^(?:nr|nummer)\.?\s*/i, "").trim();
            }
        }

        let candId = rawId || `UKJENT_${pageToSave.id}`;
        let isUnknownStart = candId.startsWith("UKJENT");

        if (isBlank && isUnknownStart) {
            continue; 
        }

        if (isUnknownStart) {
            const knownSibling = newCandidates.find(c => !c.id.startsWith("UKJENT") && c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName));
            if (knownSibling) {
                candId = knownSibling.id;
                isUnknownStart = false;
            } else {
                const unknownSibling = newCandidates.find(c => c.id.startsWith("UKJENT") && c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName));
                if (unknownSibling) candId = unknownSibling.id;
            }
        }

        let filteredTasks: IdentifiedTask[] = [];
        if (res.identifiedTasks) {
             filteredTasks = res.identifiedTasks.map((t: any) => {
                 if (!t.taskNumber) return null;
                 if (hasRubric) {
                    const label = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const parentLabel = t.taskNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (validTaskStrings.has(label)) return t;
                    if (validTaskStrings.has(parentLabel)) return { ...t, subTask: '' };
                    return null;
                 }
                 return t;
             }).filter((t: any) => t !== null);
        }

        const pageId = pageToSave.id + (results.length > 1 ? `_res` : '');
        let determinedPart = res.part || pageToSave.part;
        if (isDigital) determinedPart = "Del 2";

        const newPage: Page = {
            ...pageToSave,
            id: pageId,
            candidateId: isUnknownStart ? "UKJENT" : candId,
            pageNumber: res.pageNumber || pageToSave.pageNumber,
            part: determinedPart,
            transcription: res.fullText || res.transcription,
            visualEvidence: res.visualEvidence,
            identifiedTasks: filteredTasks,
            status: 'completed',
            rotation: 0 
        };

        let candIdx = newCandidates.findIndex(c => c.id === candId);
        if (candIdx === -1) {
            const newCand: Candidate = {
                id: candId,
                projectId: currentProject.id,
                name: isUnknownStart ? `Ukjent (${pageToSave.fileName})` : candId,
                pages: [newPage],
                status: 'completed'
            };
            newCandidates.push(newCand);
            idsToSave.add(newCand.id);
        } else {
            const updatedCand = {
                ...newCandidates[candIdx],
                pages: [...newCandidates[candIdx].pages, newPage].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
            };
            newCandidates[candIdx] = updatedCand;
            idsToSave.add(updatedCand.id);
        }

        if (!isUnknownStart) {
             const unknownSiblingIndex = newCandidates.findIndex(c => c.id.startsWith("UKJENT") && c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName));
             if (unknownSiblingIndex !== -1) {
                 const unknownCand = newCandidates[unknownSiblingIndex];
                 const rescuedPages = unknownCand.pages.map(p => ({ ...p, candidateId: candId }));
                 const targetIdx = newCandidates.findIndex(c => c.id === candId);
                 if (targetIdx !== -1) {
                     const mergedCand = {
                         ...newCandidates[targetIdx],
                         pages: [...newCandidates[targetIdx].pages, ...rescuedPages].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
                     };
                     newCandidates[targetIdx] = mergedCand;
                     idsToSave.add(mergedCand.id);
                 }
                 newCandidates = newCandidates.filter(c => c.id !== unknownCand.id);
                 candidatesToDeleteIds.push(unknownCand.id);
             }
        }
    }

    const rescueResult = performSequentialRescue(newCandidates);
    newCandidates = rescueResult.updated;
    candidatesToDeleteIds.push(...rescueResult.deleted);
    rescueResult.modifiedIds.forEach(id => idsToSave.add(id)); 

    try {
        const candidatesToPersist = newCandidates.filter(c => idsToSave.has(c.id));
        await Promise.all([
            ...candidatesToPersist.map(c => saveCandidate(c)),
            ...candidatesToDeleteIds.map(id => deleteCandidate(id))
        ]);
    } catch (e) {
        console.error("DB Save failed", e);
    }

    setActiveProject(prev => {
        if (!prev) return null;
        const finalUnprocessed = [...newUnprocessed, ...pagesToDefer];
        return { ...prev, candidates: newCandidates, unprocessedPages: finalUnprocessed, updatedAt: Date.now() };
    });
  };

  useEffect(() => {
    if (isBatchProcessing.current || !activeProject) return;
    const sessionProjectId = activeProject.id;
    const hasPending = (activeProject.unprocessedPages || []).some(p => p.status === 'pending');
    
    if (!hasPending && processingCount === 0 && autoFlowPending && !rubricStatus.loading) {
       const triggerAutoFlow = async () => {
          if (!activeProjectRef.current?.rubric) return;
          const cands = activeProjectRef.current.candidates;
          if (cands.length === 0) return; 
          setAutoFlowPending(false); 
          try {
             setCurrentAction("🤖 Auto-pilot: Analyserer klassens feil...");
             const improvedRubric = await improveRubricWithStudentData(activeProjectRef.current.rubric, cands, getActiveReasoningModel());
             if (activeProjectRef.current?.id === sessionProjectId) {
                 if (activeProjectRef.current) activeProjectRef.current.rubric = improvedRubric;
                 updateActiveProject({ rubric: improvedRubric });
                 setCurrentAction("🚀 Auto-pilot: Vurderer alle kandidater...");
                 const allIds = cands.map(c => c.id);
                 await handleBatchEvaluation(allIds, true); 
             }
          } catch (e) {
             console.error("Auto-Flow failed", e);
             setRubricStatus({ loading: false, text: 'Auto-pilot feilet', errorType: 'GENERIC' });
          } finally {
             setCurrentAction('');
          }
       };
       triggerAutoFlow();
       return;
    }

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
        if (activeProjectRef.current?.id !== sessionProjectId) {
            console.log("Prosesseringskø avbrutt pga prosjektbytte.");
            break;
        }

        const currentProject = activeProjectRef.current;
        if (!currentProject) break;

        const pendingPages = (currentProject.unprocessedPages || []).filter(p => p.status === 'pending');
        const remaining = pendingPages.length;
        setBatchTotal(prevTotal => Math.max(prevTotal, localBatchCompleted + remaining));

        const page = pendingPages.find(p => !failedIds.has(p.id) && !processedIds.has(p.id));
        if (!page) { hasMore = false; break; }

        setActivePageId(page.id);
        processedIds.add(page.id);
        
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
          // v8.9.48: Explicit guard against splitting non-image files (like Word docs identified as text)
          // Even though mimeType check handles it, we add clarity.
          const isWordFile = page.fileName.toLowerCase().includes('.docx') || page.fileName.toLowerCase().includes('.doc');
          const isImageFile = page.mimeType.startsWith('image/');
          
          if (isImageFile && !isWordFile && !page.layoutType) {
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
                if (prev.id !== sessionProjectId) return prev; 
                
                const oldList = prev.unprocessedPages || [];
                const idx = oldList.findIndex(p => p.id === page.id);
                if (idx === -1) return prev;
                const newList = [...oldList];
                newList.splice(idx, 1, ...processedPages);
                return { ...prev, unprocessedPages: newList };
             });
             continue; 
          }

          const canTranscribe = currentProject.rubric && currentProject.rubric.criteria.length > 0;
          
          if (!canTranscribe) {
             hasMore = false;
             break;
          }

          if (page.mimeType === 'text/plain') {
            setCurrentAction(`Analyserer digital tekst: ${page.fileName}...`);
            const res = await analyzeTextContent(page.rawText || "", activeProjectRef.current?.rubric, page.attachedImages, signal);
            setCurrentAction(`Lagrer analyse for ${page.fileName}...`);
            if (activeProjectRef.current?.id === sessionProjectId) {
                await integratePageResults(page, [res]);
            }
          } else {
            setCurrentAction(`🚀 Sender til Google: ${page.fileName}...`);
            const base64 = await getMedia(page.id);
            if (base64) {
              const sizeInMB = base64.length / 1024 / 1024;
              if (sizeInMB > 15) console.warn(`⚠️ Veldig stor fil (${sizeInMB.toFixed(1)} MB): ${page.fileName}. Kan forårsake timeouts.`);

              const pWithData = { ...page, base64Data: base64.split(',')[1] };
              const results = await transcribeAndAnalyzeImage(pWithData, activeProjectRef.current?.rubric, signal);
              setCurrentAction(`🧠 Tolker og lagrer: ${page.fileName}...`);
              if (activeProjectRef.current?.id === sessionProjectId) {
                  await integratePageResults(page, results);
              }
            }
          }
          localBatchCompleted++;
          setBatchCompleted(localBatchCompleted);
          localProcessedCount++;
          const elapsedTime = Date.now() - batchStartTime;
          const pendingCount = (activeProjectRef.current?.unprocessedPages || []).filter(p => p.status === 'pending').length;
          const avgTimePerItem = elapsedTime / localProcessedCount;
          setEtaSeconds(Math.max(0, Math.round((avgTimePerItem * pendingCount) / 1000)));
          
        } catch (e: any) {
           if (e.name === 'AbortError' || e.message === 'Aborted') {
             // Do NOT mark as skipped or error if aborted due to project switch
             if (activeProjectRef.current?.id !== sessionProjectId) break;
             
             updateActiveProject({ unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'skipped' as const, statusLabel: 'Hoppet over' } : p) });
             continue; 
           }
           const msg = e?.message || String(e);
           const isNetworkError = msg.includes("fetch failed") || msg.includes("NetworkError") || msg.includes("503") || msg.includes("504") || msg.includes("Failed to fetch") || msg.includes("timeout") || msg.includes("timed out");
           const isQuotaError = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
           const isBadRequest = msg.includes("400") || msg.includes("Bad Request");
           const isNotFound = msg.includes("404") || msg.includes("Not Found");

           // v9.1.11: Harden rotation logic. Only rotate images, and don't rotate on hard API errors (400/404).
           const isImage = page.mimeType.startsWith('image/');
           const shouldTryRotation = isImage && !isNetworkError && !isQuotaError && !isBadRequest && !isNotFound && !rotatedIds.current.has(page.id);

           if (shouldTryRotation) {
              rotatedIds.current.add(page.id); 
              setCurrentAction(`⚠️ Feil (roterer 180 grader): ${page.fileName}...`);
              try {
                 const base64 = await getMedia(page.id);
                 if (base64) {
                    const rotated = await processImageRotation(base64, 180);
                    await saveMedia(page.id, rotated);
                    processedIds.delete(page.id);
                    await new Promise(r => setTimeout(r, 1000)); 
                    continue;
                 }
              } catch (rotErr) { console.error("Rotation retry failed", rotErr); }
           }

           const currentRetries = retryCounts.current[page.id] || 0;
           if ((isNetworkError || isQuotaError) && currentRetries < 3) { 
              retryCounts.current[page.id] = currentRetries + 1;
              console.warn(`Retry ${page.fileName} (${currentRetries + 1}/3)`);
              setCurrentAction(`⚠️ Tidsavbrudd på ${page.fileName}. Forsøk ${currentRetries + 1}/3...`);
              processedIds.delete(page.id); 
              await new Promise(r => setTimeout(r, 5000));
              continue; 
           }
           
           failedIds.add(page.id); 
           
           let statusLabel = 'Feilet';
           if (isNetworkError) statusLabel = 'Tidsavbrudd';
           else if (isQuotaError) statusLabel = 'Kvote nådd';
           else if (isBadRequest) statusLabel = 'Ugyldig forespørsel (400)';
           else if (isNotFound) statusLabel = 'Modell ikke funnet (404)';
           else if (msg.length < 30) statusLabel = msg;

           if (activeProjectRef.current?.id === sessionProjectId) {
               updateActiveProject({ unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error' as const, statusLabel } : p) });
           }
        }
        await new Promise(r => setTimeout(r, 50)); 
      }

      setActivePageId(null);
      abortControllerRef.current = null;
      isBatchProcessing.current = false;
      if (activeProjectRef.current?.id === sessionProjectId) {
          setCurrentAction('');
          setBatchTotal(0);
          setBatchCompleted(0);
          setEtaSeconds(null);
      }
    };

    processQueue();
  }, [activeProject?.unprocessedPages, activeProject?.rubric, retryTrigger, processingCount, rubricStatus.loading]); 

  const handleRegeneratePage = async (candidateId: string, pageId: string) => {
      const currentProject = activeProjectRef.current;
      if (!currentProject) return;
      const candidate = currentProject.candidates.find(c => c.id === candidateId);
      if (!candidate) return;
      const page = candidate.pages.find(p => p.id === pageId);
      if (!page) return;
      try {
          let updatedPage = { ...page };
          let results: any[] = [];
          if (page.mimeType === 'text/plain') {
               const res = await analyzeTextContent(page.rawText || "", currentProject.rubric, page.attachedImages);
               results = [res];
          } else {
               const base64 = await getMedia(page.id);
               if (base64) {
                   const pWithData = { ...page, base64Data: base64.split(',')[1] };
                   results = await transcribeAndAnalyzeImage(pWithData, currentProject.rubric);
               }
          }
          await integratePageResults(updatedPage, results, pageId);
      } catch (e) {
          console.error("Regenerate failed", e);
      }
  };

  const handleEvaluateCandidateWrapper = async (candidateId: string) => {
     if (!activeProjectRef.current?.rubric) return;
     const c = activeProjectRef.current.candidates.find(cand => cand.id === candidateId);
     if (!c) return;
     setRubricStatus({ loading: true, text: `Vurderer ${c.name}...` });
     try {
         const evaluated = await evaluateCandidate(c, activeProjectRef.current.rubric, getActiveReasoningModel());
         await saveCandidate(evaluated);
         setActiveProject(prev => {
             if (!prev) return null;
             return {
                 ...prev,
                 candidates: prev.candidates.map(cand => cand.id === evaluated.id ? evaluated : cand),
                 evaluatedCount: (prev.candidates.filter(x => x.status === 'evaluated').length) + (c.status !== 'evaluated' ? 1 : 0),
                 updatedAt: Date.now()
             };
         });
     } catch (e) {
         console.error(e);
         alert("Vurdering feilet. Se konsoll.");
     } finally {
         setRubricStatus({ loading: false, text: '' });
     }
  };

  const handleBatchEvaluation = async (ids: string[], force = false) => {
      if (!activeProjectRef.current?.rubric) return;
      
      const startProjectId = activeProjectRef.current.id; // v9.1.6: Capture ID
      
      isStoppingEvaluation.current = false;
      const candidatesToEval = activeProjectRef.current.candidates.filter(c => ids.includes(c.id));
      let completed = 0;
      setBatchTotal(candidatesToEval.length);
      setBatchCompleted(0);
      for (const c of candidatesToEval) {
          if (activeProjectRef.current?.id !== startProjectId) break; // v9.1.6: Guard
          if (isStoppingEvaluation.current) break;
          if (c.status === 'evaluated' && !force) {
              completed++;
              setBatchCompleted(completed);
              continue;
          }
          setCurrentAction(`Vurderer ${c.name}...`);
          try {
              const evaluated = await evaluateCandidate(c, activeProjectRef.current.rubric, getActiveReasoningModel());
              await saveCandidate(evaluated);
              setActiveProject(prev => {
                 if (!prev || prev.id !== startProjectId) return prev; // v9.1.6: Guard
                 return {
                     ...prev,
                     candidates: prev.candidates.map(cand => cand.id === evaluated.id ? evaluated : cand),
                     updatedAt: Date.now()
                 };
              });
          } catch (e) {
              console.error(`Failed to evaluate ${c.name}`, e);
          }
          completed++;
          setBatchCompleted(completed);
      }
      if (activeProjectRef.current?.id === startProjectId) {
          setCurrentAction('');
          setBatchTotal(0);
          setBatchCompleted(0);
      }
  };

  const handleEvaluateAll = (force = false) => {
      if (!activeProjectRef.current) return;
      const ids = activeProjectRef.current.candidates.map(c => c.id);
      handleBatchEvaluation(ids, force);
  };
  
  const handleRegenerateCriterion = async (taskNumber: string, subTask: string, part: string) => {
      if (!activeProjectRef.current?.rubric) return;
      
      const startProjectId = activeProjectRef.current.id; // v9.1.6: Capture ID

      setRubricStatus({ loading: true, text: `Oppdaterer oppgave ${taskNumber}${subTask}...` });
      try {
          const taskFilesWithMedia = await Promise.all(activeProjectRef.current.taskFiles.map(async f => {
            if (f.mimeType === 'text/plain') return f;
            const base64 = await getMedia(f.id);
            return { ...f, base64Data: base64?.split(',')[1] || "" };
          }));
          const updatedCrit = await regenerateSingleCriterion(
              { taskNumber, subTask, part } as RubricCriterion,
              taskFilesWithMedia,
              getActiveReasoningModel()
          );
          
          if (activeProjectRef.current?.id !== startProjectId) return; // v9.1.6: Guard

          const newCriteria = activeProjectRef.current.rubric.criteria.map(c => {
              if (c.taskNumber === taskNumber && c.subTask === subTask && c.part === part) {
                  return { ...c, ...updatedCrit };
              }
              return c;
          });
          updateActiveProject({ rubric: { ...activeProjectRef.current.rubric, criteria: newCriteria } });
      } catch (e) {
          console.error(e);
          alert("Kunne ikke oppdatere oppgave.");
      } finally {
          if (activeProjectRef.current?.id === startProjectId) {
              setRubricStatus({ loading: false, text: '' });
          }
      }
  };

  const handleRetryFailed = () => {
      if (!activeProjectRef.current) return;
      const failedPages = (activeProjectRef.current.unprocessedPages || []).filter(p => p.status === 'error');
      if (failedPages.length === 0) return;

      failedPages.forEach(p => {
          delete retryCounts.current[p.id];
          rotatedIds.current.delete(p.id); 
      });

      setActiveProject(prev => {
          if (!prev) return null;
          const updatedUnprocessed = (prev.unprocessedPages || []).map(p => 
              p.status === 'error' ? { ...p, status: 'pending' as const, statusLabel: undefined } : p
          );
          return { ...prev, unprocessedPages: updatedUnprocessed, updatedAt: Date.now() };
      });
      setRetryTrigger(prev => prev + 1);
  };
  
  const handleSmartCleanup = async () => {
      if (!activeProject) return;
      const startProjectId = activeProject.id;
      setRubricStatus({ loading: true, text: 'Analyserer filrekkefølge (Sekvensiell redning)...' });
      try { 
        const rescueResult = performSequentialRescue(activeProject.candidates);
        if (rescueResult.deleted.length > 0) {
            console.log(`🧹 Sekvensiell redning slo sammen ${rescueResult.deleted.length} kandidater.`);
            const candidatesToSave = activeProject.candidates.filter(c => rescueResult.modifiedIds.has(c.id));
            if (activeProjectRef.current?.id === startProjectId) {
                await Promise.all([
                    ...candidatesToSave.map(c => saveCandidate(c)),
                    ...rescueResult.deleted.map(id => deleteCandidate(id))
                ]);
                activeProject.candidates = rescueResult.updated.filter(c => !rescueResult.deleted.includes(c.id));
            }
        }
        
        if (activeProjectRef.current?.id !== startProjectId) return; // Guard

        setRubricStatus({ loading: true, text: 'Kjører AI-basert smart-rydding...' });
        const updatedCandidates = await reconcileProjectData(activeProject);
        for (const cand of updatedCandidates) {
          if (activeProjectRef.current?.id !== startProjectId) break;
          for (const page of cand.pages) {
            if ((page as any).needsRepair) {
              setCurrentAction(`Reparerer layout: ${page.fileName}...`);
              await handleRegeneratePage(cand.id, page.id);
            }
          }
          await saveCandidate(cand);
        }
        if (activeProjectRef.current?.id === startProjectId) {
            updateActiveProject({ candidates: updatedCandidates });
        }
      } finally { 
        if (activeProjectRef.current?.id === startProjectId) {
            setRubricStatus({ loading: false, text: '' }); 
            setCurrentAction('');
        }
      }
  };

  return { 
    processingCount, batchTotal, batchCompleted, currentAction, activePageId, rubricStatus, 
    useFlashFallback, setUseFlashFallback,
    etaSeconds, 
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleSkipFile, 
    handleBatchEvaluation,
    handleEvaluateAll,
    handleEvaluateCandidate: handleEvaluateCandidateWrapper,
    handleGenerateRubric, 
    handleRegenerateCriterion,
    handleRetryFailed,
    handleDeleteUnprocessedPage,
    handleSmartCleanup,
    handleRetryPage: (p: Page) => {
      delete retryCounts.current[p.id];
      rotatedIds.current.delete(p.id); 
      setActiveProject(prev => {
        if (!prev) return null;
        return {
          ...prev,
          unprocessedPages: (prev.unprocessedPages || []).map(pg => 
            pg.id === p.id ? { ...pg, status: 'pending' as const, statusLabel: undefined } : pg
          ),
          updatedAt: Date.now()
        };
      });
      setRetryTrigger(prev => prev + 1);
    },
    handleRegeneratePage,
    updateActiveProject 
  };
};
