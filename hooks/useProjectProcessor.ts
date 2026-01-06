
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
  improveRubricWithStudentData,
  PRO_MODEL,
  OCR_MODEL
} from '../services/geminiService';

export const useProjectProcessor = (
  activeProject: Project | null, 
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>,
  forceFlash: boolean = false // v8.1.2: New prop
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
  const [autoFlowPending, setAutoFlowPending] = useState(false); // v8.0.5: Track auto-flow state
  
  const isBatchProcessing = useRef(false);
  const isStoppingEvaluation = useRef(false);
  const retryCounts = useRef<Record<string, number>>({});
  const rotatedIds = useRef<Set<string>>(new Set()); // v8.0.23: Track auto-rotated pages
  
  // v7.9.33: Abort Controller for skipping pages
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const activeProjectRef = useRef(activeProject);
  const useFlashFallbackRef = useRef(useFlashFallback);
  const forceFlashRef = useRef(forceFlash);

  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  useEffect(() => { useFlashFallbackRef.current = useFlashFallback; }, [useFlashFallback]);
  useEffect(() => { forceFlashRef.current = forceFlash; }, [forceFlash]);

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

  // v8.1.2: If Force Flash is on, use OCR_MODEL (Flash). Else check fallback.
  const getActiveReasoningModel = () => (forceFlashRef.current || useFlashFallbackRef.current) ? OCR_MODEL : PRO_MODEL;

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
    
    // v7.9.40: Session Hash Set for immediate deduplication within the same batch
    const sessionHashes = new Set<string>();

    for (const file of fileArray) {
      setCurrentAction(`Laster oppgave: ${file.name}...`);
      const processed = await processFileToImages(file);
      
      // v7.9.40: Deduplication Logic for Tasks
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
         } else {
            console.warn(`Skippet duplikat oppgavefil: ${file.name}`);
         }
      }
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
    setCurrentAction('');
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessingCount(prev => prev + files.length);
    
    // v8.0.5: Activate Auto-Flow when candidates are added
    setAutoFlowPending(true);

    const fileArray = Array.from(files);

    for (const file of fileArray) {
      setCurrentAction(`Laster elevfil: ${file.name}...`);
      const processed = await processFileToImages(file);
      
      // v8.1.7: Duplicate Permission
      // We allow duplicates now, but ensure they get unique metadata to avoid DB collisions
      const uniquePages = processed.map(p => {
          // Check if this hash ALREADY exists in the project
          const isDuplicate = activeProjectRef.current?.candidates.some(c => c.pages.some(existing => existing.contentHash === p.contentHash)) 
                           || activeProjectRef.current?.unprocessedPages?.some(existing => existing.contentHash === p.contentHash);
          
          if (isDuplicate) {
              console.log(`Tillater duplikat fil: ${p.fileName} (Legger til suffix)`);
              // Mutate hash and filename slightly to bypass "Already Exists" logic in user's mind
              return {
                  ...p,
                  fileName: `${p.fileName} (Kopi)`,
                  // Append timestamp to hash to make it unique in IndexedDB cache
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
      setProcessingCount(prev => Math.max(0, prev - 1));
    }
    setCurrentAction('');
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || proj.taskFiles.length === 0) return;
    
    setRubricStatus({ loading: true, text: 'Starter fase 1: Kartlegger oppgaver...', errorType: undefined });
    try {
      const taskFilesWithMedia = await Promise.all(proj.taskFiles.map(async f => {
        if (f.mimeType === 'text/plain') return f;
        const base64 = await getMedia(f.id);
        return { ...f, base64Data: base64?.split(',')[1] || "" };
      }));
      
      const model = getActiveReasoningModel();
      
      // v8.2.0: Live Update Callback
      const onProgress = (msg: string, partialRubric?: Rubric) => {
          setRubricStatus({ loading: true, text: msg, errorType: undefined });
          if (partialRubric) {
              updateActiveProject({ rubric: partialRubric });
          }
      };

      const rubric = await generateRubricFromTaskAndSamples(taskFilesWithMedia, model, onProgress);
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
    // V8.0.4: Safe Async & Sibling Logic Refactor
    // This function calculates the new state first, PERFORMS DB OPS, and then updates React.
    
    // 1. Get snapshot of current state
    const currentProject = activeProjectRef.current;
    if (!currentProject) return;

    // Clone to work on
    let newCandidates = [...currentProject.candidates];
    const removeId = parentIdToRemove || pageToSave.id;
    
    // Prepare unprocessed update
    const newUnprocessed = (currentProject.unprocessedPages || []).filter(p => p.id !== removeId);

    const hasRubric = !!currentProject.rubric && (currentProject.rubric.criteria.length > 0);
    const validTaskStrings = new Set(currentProject.rubric?.criteria.map(c => 
      `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
    ) || []);

    const pagesToDefer: Page[] = []; // Pages that should be marked as skipped (waiting for sibling)
    const candidatesToSave: Candidate[] = [];
    const candidatesToDeleteIds: string[] = [];

    // Helper logic
    const cleanBaseName = (name: string) => {
       if (!name) return "";
       // Robust cleanup for V/H/Ø/N suffixes
       let clean = name.replace(/\s*\([VHØN]\)$/i, "");
       clean = clean.replace(/\.[^/.]+$/, ""); // Remove extension
       return clean.trim();
    };
    
    const currentBaseName = cleanBaseName(pageToSave.fileName);
    const isSplitPage = pageToSave.fileName.match(/\([VHØN]\)$/i);
    const isDigital = pageToSave.mimeType === 'text/plain'; // v8.0.41: Digital check

    // Process all results from the AI (usually 1, sometimes 2 if A3 logic in AI was used - rare now due to local split)
    for (const res of results) {
        const isBlank = (res.fullText || res.transcription || "").includes("[TOM SIDE]") || (res.fullText || "").length < 15;
        let rawId = res.candidateId === "UKJENT" ? `UKJENT_${pageToSave.id}` : res.candidateId;
        
        if (rawId && !rawId.startsWith("UKJENT")) {
            rawId = rawId.trim().replace(/^(?:kandidat|kand|cand)(?:nummer|nr|\.|_)?\s*:?\s*/i, "").trim();
            rawId = rawId.replace(/^(?:nr|nummer)\.?\s*/i, "").trim();
        }

        let candId = rawId || `UKJENT_${pageToSave.id}`;
        let isUnknownStart = candId.startsWith("UKJENT");

        if (isBlank && isUnknownStart) {
            console.log(`Auto-discarding blank page from ${pageToSave.fileName}`);
            continue; 
        }

        // v8.0.4: Smart Sibling Inference (Safe)
        if (isUnknownStart) {
            // 1. Try to find a KNOWN sibling (Best case)
            const knownSibling = newCandidates.find(c => 
                !c.id.startsWith("UKJENT") && 
                c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName)
            );

            if (knownSibling) {
                candId = knownSibling.id;
                isUnknownStart = false;
            } else {
                // 2. Try to find an UNKNOWN sibling (Group them together)
                const unknownSibling = newCandidates.find(c => 
                    c.id.startsWith("UKJENT") && 
                    c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName)
                );
                
                if (unknownSibling) {
                    candId = unknownSibling.id;
                } 
                // v8.0.29: Removed Deferral Logic. Always create Unknown if no sibling found.
                // The "Rescue Logic" below handles merging if a known sibling appears later.
            }
        }

        // v8.0.15: Strict Integer Task Logic (Auto-fix suffixes like "2CAS" -> "2")
        let filteredTasks: IdentifiedTask[] = [];
        if (res.identifiedTasks) {
             filteredTasks = res.identifiedTasks.map((t: any) => {
                 if (!t.taskNumber) return null;
                 if (hasRubric) {
                    const label = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const parentLabel = t.taskNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    
                    if (validTaskStrings.has(label)) {
                       // Perfect match (e.g. "2")
                       return t;
                    } 
                    
                    // Fallback: If "2CAS" not found, but "2" exists in rubric, force map to "2".
                    if (validTaskStrings.has(parentLabel)) {
                        return { ...t, subTask: '' };
                    }
                    return null; // Invalid, remove it.
                 }
                 return t; // No rubric, keep everything
             }).filter((t: any) => t !== null);
        }

        const pageId = pageToSave.id + (results.length > 1 ? `_res` : '');
        
        // v8.0.41: Force "Del 2" for digital files (hard override)
        let determinedPart = res.part || pageToSave.part;
        if (isDigital) {
            determinedPart = "Del 2";
        }

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

        // Find or Create Candidate
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
            candidatesToSave.push(newCand); // Mark for saving
        } else {
            const updatedCand = {
                ...newCandidates[candIdx],
                pages: [...newCandidates[candIdx].pages, newPage].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
            };
            newCandidates[candIdx] = updatedCand;
            candidatesToSave.push(updatedCand); // Mark for saving
        }

        // Rescue Logic (Backward Merge)
        if (!isUnknownStart) {
             const unknownSiblingIndex = newCandidates.findIndex(c => 
                c.id.startsWith("UKJENT") && 
                c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName)
             );

             if (unknownSiblingIndex !== -1) {
                 const unknownCand = newCandidates[unknownSiblingIndex];
                 const rescuedPages = unknownCand.pages.map(p => ({ ...p, candidateId: candId }));
                 
                 // Update the KNOWN candidate again with rescued pages
                 // Note: candIdx might have shifted if we are not careful, but finding by ID is safer
                 const targetIdx = newCandidates.findIndex(c => c.id === candId);
                 if (targetIdx !== -1) {
                     const mergedCand = {
                         ...newCandidates[targetIdx],
                         pages: [...newCandidates[targetIdx].pages, ...rescuedPages].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
                     };
                     newCandidates[targetIdx] = mergedCand;
                     candidatesToSave.push(mergedCand); // Re-save merged
                 }
                 
                 // Mark unknown for deletion
                 newCandidates = newCandidates.filter(c => c.id !== unknownCand.id);
                 candidatesToDeleteIds.push(unknownCand.id);
             }
        }
    } // End Loop

    // 2. Perform DB Operations (Safely)
    try {
        await Promise.all([
            ...candidatesToSave.map(c => saveCandidate(c)),
            ...candidatesToDeleteIds.map(id => deleteCandidate(id))
        ]);
    } catch (e) {
        console.error("DB Save failed", e);
    }

    // 3. Update React State (Atomic)
    setActiveProject(prev => {
        if (!prev) return null;
        // Merge deferred pages back into unprocessed
        const finalUnprocessed = [...newUnprocessed, ...pagesToDefer];
        
        return {
            ...prev,
            candidates: newCandidates,
            unprocessedPages: finalUnprocessed,
            updatedAt: Date.now()
        };
    });
  };

  useEffect(() => {
    if (isBatchProcessing.current || !activeProject) return;
    
    const hasPending = (activeProject.unprocessedPages || []).some(p => p.status === 'pending');
    
    // v8.0.5: Auto-Flow Logic
    // If the queue is empty, no processing is happening, and we have pending Auto-Flow
    if (!hasPending && processingCount === 0 && autoFlowPending && !rubricStatus.loading) {
       
       const triggerAutoFlow = async () => {
          if (!activeProjectRef.current?.rubric) return; // Wait for rubric
          
          const cands = activeProjectRef.current.candidates;
          if (cands.length === 0) return; // Nothing to analyze

          setAutoFlowPending(false); // Stop loop
          
          try {
             // Step 1: Analyze Errors
             setCurrentAction("🤖 Auto-pilot: Analyserer klassens feil...");
             const improvedRubric = await improveRubricWithStudentData(activeProjectRef.current.rubric, cands, getActiveReasoningModel());
             
             // Update project with new rubric immediately (Ref and State)
             if (activeProjectRef.current) activeProjectRef.current.rubric = improvedRubric;
             updateActiveProject({ rubric: improvedRubric });
             
             // Step 2: Evaluate All (Force Refresh)
             setCurrentAction("🚀 Auto-pilot: Vurderer alle kandidater...");
             const allIds = cands.map(c => c.id);
             await handleBatchEvaluation(allIds, true); // True = Force re-evaluation
             
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
        
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
          // v8.0.12: MANDATORY UNIVERSAL SPLIT - NO AI, NO EXCEPTIONS
          // If it's an image and hasn't been split yet (layoutType is undefined), split it.
          if (page.mimeType.startsWith('image/') && !page.layoutType) {
             setCurrentAction(`Geometri-sjekk: ${page.fileName}...`);
             const base64 = await getMedia(page.id);
             if (!base64) throw new Error("Mangler bildedata");

             // Logic:
             // Part 1: Left (if Landscape) OR Top (if Portrait)
             // Part 2: Right (if Landscape) OR Bottom (if Portrait)
             // splitImageInHalf handles the axis decision based on dimensions.
             let split1 = await splitImageInHalf(base64, 1);
             let split2 = await splitImageInHalf(base64, 2);
             
             // If portrait split (Top/Bottom), resulting images are likely landscape.
             // We rotate them 90 degrees to ensure they are upright A4 for OCR.
             if (!split1.isLandscapeSplit) {
                split1.fullRes = await processImageRotation(split1.fullRes, 90);
                split2.fullRes = await processImageRotation(split2.fullRes, 90);
             }
             
             const id1 = `${page.id}_1`;
             const id2 = `${page.id}_2`;
             
             await Promise.all([saveMedia(id1, split1.fullRes), saveMedia(id2, split2.fullRes)]);
             
             // Suffix logic
             const s1Suffix = split1.isLandscapeSplit ? '(V)' : '(Ø)'; // V=Venstre, Ø=Øvre
             const s2Suffix = split2.isLandscapeSplit ? '(H)' : '(N)'; // H=Høyre, N=Nedre

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
             
             // Immediate loop continue to pick up the new split pages
             continue; 
          }

          if (currentProject.rubric && currentProject.rubric.criteria.length > 0) {
             // v8.3.1: Strict Block - Do not transcribe if rubric is loading (partial)
             if (rubricStatus.loading) {
                 hasMore = false;
                 break;
             }

             if (page.mimeType === 'text/plain') {
                setCurrentAction(`Analyserer digital tekst: ${page.fileName}...`);
                const res = await analyzeTextContent(page.rawText || "", activeProjectRef.current?.rubric, page.attachedImages, signal);
                setCurrentAction(`Lagrer analyse for ${page.fileName}...`);
                await integratePageResults(page, [res]);
             } else {
                setCurrentAction(`🚀 Sender til Google: ${page.fileName}...`);
                const base64 = await getMedia(page.id);
                if (base64) {
                  const sizeInMB = base64.length / 1024 / 1024;
                  if (sizeInMB > 15) console.warn(`⚠️ Veldig stor fil (${sizeInMB.toFixed(1)} MB): ${page.fileName}. Kan forårsake timeouts.`);

                  const pWithData = { ...page, base64Data: base64.split(',')[1] };
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
           if (e.name === 'AbortError' || e.message === 'Aborted') {
             console.log(`Fil ${page.fileName} ble hoppet over av bruker.`);
             updateActiveProject({ 
               unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'skipped', statusLabel: 'Hoppet over' } : p) 
             });
             continue; 
           }

           const msg = e?.message || String(e);
           const isNetworkError = msg.includes("fetch failed") || msg.includes("NetworkError") || msg.includes("503") || msg.includes("504") || msg.includes("Failed to fetch") || msg.includes("timeout") || msg.includes("timed out");
           
           // v8.0.23: Smart Rotation Retry Logic
           // If it's NOT a network error, and we haven't rotated this page yet, try rotating 180 degrees.
           if (!isNetworkError && !rotatedIds.current.has(page.id)) {
              console.log(`Smart Retry: Feil oppstod, forsøker å rotere ${page.fileName} 180 grader...`);
              rotatedIds.current.add(page.id); // Mark as rotated
              setCurrentAction(`⚠️ Feil (roterer 180 grader): ${page.fileName}...`);
              
              try {
                 const base64 = await getMedia(page.id);
                 if (base64) {
                    const rotated = await processImageRotation(base64, 180);
                    // Update Media
                    await saveMedia(page.id, rotated);
                    
                    // Force refresh of page state in unprocessedPages (reset status, new hash?)
                    // Actually, we just need to retry loop. 
                    // processedIds.delete(page.id) ensures loop picks it up again.
                    // We don't change ID or Hash, just the content.
                    
                    processedIds.delete(page.id);
                    await new Promise(r => setTimeout(r, 1000)); // Small delay
                    continue; // Retry immediatly
                 }
              } catch (rotErr) {
                 console.error("Rotation retry failed", rotErr);
                 // Fall through to normal error handling
              }
           }

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
        
        await new Promise(r => setTimeout(r, 50)); 
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
  }, [activeProject?.unprocessedPages, activeProject?.rubric, retryTrigger, processingCount, rubricStatus.loading]); // v8.0.5: Trigger on processingCount for auto-flow, v8.3.1: Trigger on rubricStatus.loading

  const handleRetryFailed = () => {
    setActiveProject(prev => {
        if (!prev) return null;
        const failed = (prev.unprocessedPages || []).filter(p => p.status === 'error');
        if (failed.length === 0) return prev;
        
        // Reset retry counters for these
        failed.forEach(p => delete retryCounts.current[p.id]);
        
        // v8.0.23: Reset rotation flags so we can try rotating again if needed (or if manual intervention happened)
        failed.forEach(p => rotatedIds.current.delete(p.id));

        return {
            ...prev,
            unprocessedPages: (prev.unprocessedPages || []).map(p => p.status === 'error' ? { ...p, status: 'pending', statusLabel: undefined } : p)
        };
    });
    // Trigger queue restart
    setRetryTrigger(prev => prev + 1);
  };

  const handleRegeneratePage = async (candId: string, pageId: string) => {
    if (!activeProject) return;
    const candidate = activeProject.candidates.find(c => c.id === candId);
    if (!candidate) return;
    const page = candidate.pages.find(p => p.id === pageId);
    if (!page) return;

    try {
      const base64 = await getMedia(page.id);
      if (!base64) return;
      
      // v8.1.4: Use PRO_MODEL for manual regeneration to ensure deep reasoning and avoid hallucinations
      const results = await transcribeAndAnalyzeImage(
          { ...page, base64Data: base64.split(',')[1], forceRescan: true } as any, 
          activeProject.rubric,
          undefined, // no abort signal
          PRO_MODEL // Override with PRO
      );
      
      // v8.0.10 Fix: Force only the first result to be integrated.
      // This prevents split-image hallucination from creating duplicate/ghost pages during regeneration.
      // We assume one physical page image = one logical page here.
      if (results && results.length > 0) {
         await integratePageResults(page, [results[0]]);
      }
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

  const handleBatchEvaluation = async (candidateIds: string[], force: boolean = false) => {
    if (!activeProjectRef.current?.rubric) return;
    isStoppingEvaluation.current = false;
    
    let candsToProcess = activeProjectRef.current.candidates;
    if (candidateIds && candidateIds.length > 0) {
       candsToProcess = candsToProcess.filter(c => candidateIds.includes(c.id));
    }

    setRubricStatus({ loading: true, text: `Vurderer ${candsToProcess.length} kandidater...` });
    
    // v8.1.3: Initialize Progress Stats
    setBatchTotal(candsToProcess.length);
    setBatchCompleted(0);
    const batchStartTime = Date.now();
    let localProcessedCount = 0;

    for (let i = 0; i < candsToProcess.length; i++) {
      const cand = candsToProcess[i];
      if (isStoppingEvaluation.current) break;
      if (!force && cand.status === 'evaluated') {
          // v8.1.3: Still count skipped as completed for progress bar consistency
          localProcessedCount++;
          setBatchCompleted(localProcessedCount);
          continue;
      }
      
      setCurrentAction(`Vurderer ${cand.name} (${i + 1}/${candsToProcess.length})...`);
      try {
        const res = await evaluateCandidate(cand, activeProjectRef.current.rubric, getActiveReasoningModel());
        const updatedCand = { ...cand, evaluation: res, status: 'evaluated' as const };
        await saveCandidate(updatedCand);
        
        setActiveProject(prev => {
           if (!prev) return null;
           const updatedList = prev.candidates.map(c => c.id === cand.id ? updatedCand : c);
           return { ...prev, candidates: updatedList };
        });
      } catch (e) {
         console.error(`Feil ved vurdering av ${cand.name}:`, e);
      }

      // v8.1.3: Update Progress
      localProcessedCount++;
      setBatchCompleted(localProcessedCount);
      
      const elapsedTime = Date.now() - batchStartTime;
      const averageTimePerItem = elapsedTime / localProcessedCount;
      const remaining = candsToProcess.length - localProcessedCount;
      const estSeconds = (averageTimePerItem * remaining) / 1000;
      setEtaSeconds(Math.round(estSeconds));
    }
    setRubricStatus({ loading: false, text: '' });
    setCurrentAction('');
    setBatchTotal(0);
    setBatchCompleted(0);
    setEtaSeconds(null);
  };

  const handleEvaluateAll = (force: boolean = false) => handleBatchEvaluation([], force);

  const handleEvaluateCandidateWrapper = async (id: string) => {
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
      // v8.0.9 Fix: Use functional update to ensure we work on latest state and clear label immediately
      setActiveProject(prev => {
        if (!prev) return null;
        return {
          ...prev,
          unprocessedPages: (prev.unprocessedPages || []).map(pg => 
            pg.id === p.id ? { ...pg, status: 'pending', statusLabel: undefined } : pg
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
