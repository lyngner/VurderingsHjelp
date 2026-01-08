
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

// Helper for Sequential Rescue (Moved outside to be accessible everywhere)
// v8.9.11: Smart Duplex Pairing (Bidirectional 1-2, 3-4 logic)
const performSequentialRescue = (candidates: Candidate[]): { updated: Candidate[], deleted: string[], modifiedIds: Set<string> } => {
    const candidatesToDelete = new Set<string>();
    const modifiedIds = new Set<string>();
    const candidatesMap = new Map(candidates.map(c => [c.id, c]));

    const isUnknownCandidate = (c: Candidate) => {
        const id = c.id || "";
        const name = (c.name || "").toLowerCase();
        return id.startsWith("UKJENT") || 
               name.includes("ikke oppgitt") || 
               name.includes("ukjent") ||
               name.includes("unknown");
    };

    const isStartPage = (p: Page) => {
        const text = (p.transcription || "").toLowerCase();
        return text.includes("side 1") || 
               text.includes("del 1") || 
               (text.includes("oppgave 1") && !text.includes("oppgave 10") && !text.includes("oppgave 11")); 
    };

    const getFileSequence = (fileName: string): { prefix: string, num: number } | null => {
        // v8.9.11: Ignorer split-suffikser for å finne originalfilens nummer
        const cleanName = fileName.replace(/\s*\([VHØN]\)/g, ""); 
        // Matcher "Scan_001.jpg", "Kandidat_101.jpg" osv.
        const match = cleanName.match(/^(.*?)(\d+)\.[^.]+$/);
        if (!match) return null;
        return { prefix: match[1], num: parseInt(match[2], 10) };
    };

    // 1. Group candidates by "Physical Sheet" (Duplex Pair)
    // Pair Logic: (1,2) is a pair. (3,4) is a pair.
    // Key formula: Prefix + "::" + Math.ceil(Number / 2)
    const pairBuckets = new Map<string, Set<string>>();

    candidates.forEach(c => {
        c.pages.forEach(p => {
            const seq = getFileSequence(p.fileName);
            if (seq) {
                const pairIndex = Math.ceil(seq.num / 2);
                const key = `${seq.prefix}::${pairIndex}`;
                if (!pairBuckets.has(key)) pairBuckets.set(key, new Set());
                pairBuckets.get(key)?.add(c.id);
            }
        });
    });

    // 2. Analyze Buckets
    for (const [key, candidateIds] of pairBuckets) {
        // Vi kan kun flette hvis nøyaktig to FORSKJELLIGE kandidater møtes i et par (f.eks. Nora og Ukjent)
        if (candidateIds.size !== 2) continue; 

        const ids = Array.from(candidateIds);
        const c1 = candidatesMap.get(ids[0]);
        const c2 = candidatesMap.get(ids[1]);
        
        if (!c1 || !c2) continue;
        if (candidatesToDelete.has(c1.id) || candidatesToDelete.has(c2.id)) continue; // Already processed

        const u1 = isUnknownCandidate(c1);
        const u2 = isUnknownCandidate(c2);

        // XOR Sjekk: Nøyaktig én av dem må være ukjent for at vi skal tørre å flette
        if ((u1 && !u2) || (!u1 && u2)) {
            const known = u1 ? c2 : c1;
            const unknown = u1 ? c1 : c2;

            // SIKKERHETSSJEKK: Ser den ukjente ut som en startside (Side 1)?
            // Hvis den ukjente filen er Partall (f.eks. 2, 4, 6) i paret (Odd, Even),
            // og den ser ut som "Side 1", så er det sannsynligvis en ny elev (Single-sided scan feil).
            // Da skal vi IKKE flette.
            
            let blocked = false;
            for (const p of unknown.pages) {
                const seq = getFileSequence(p.fileName);
                if (seq && seq.num % 2 === 0) { // Partall = Baksiden i et duplex-par
                    if (isStartPage(p)) {
                        blocked = true;
                        console.log(`🛡️ Smart-Pairing blokkert: ${unknown.name} (Fil ${p.fileName}) ser ut som en startside, men er baksiden i paret.`);
                        break;
                    }
                }
            }

            if (!blocked) {
                // Merge Unknown into Known
                console.log(`🧹 Smart-Pairing: Fletter ${unknown.name} inn i ${known.name} (Par-match).`);
                known.pages = [...known.pages, ...unknown.pages].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0));
                
                modifiedIds.add(known.id);
                candidatesToDelete.add(unknown.id);
                candidatesMap.delete(unknown.id);
                candidatesMap.set(known.id, known);
            }
        }
    }

    return { 
        updated: Array.from(candidatesMap.values()), 
        deleted: Array.from(candidatesToDelete),
        modifiedIds
    };
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
         } else {
            console.warn(`Skippet duplikat oppgavefil: ${file.name}`);
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
              console.log(`Tillater duplikat fil: ${p.fileName} (Legger til suffix)`);
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
    const proj = overrideProject || activeProject;
    if (!proj || proj.taskFiles.length === 0) return;
    
    // v8.9.12: ID Guard - Husk hvilket prosjekt vi startet med
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
          // Guard inside callback
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
      
      // Final Guard
      if (activeProjectRef.current?.id === startProjectId) {
          updateActiveProject({ rubric });
      }
      setRubricStatus({ loading: false, text: '', errorType: undefined });
    } catch (e: any) { 
      const msg = e?.message || String(e);
      setRubricStatus({ loading: false, text: 'Feil ved generering', errorType: 'GENERIC' });
    }
  };

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
    const candidatesToSave: Candidate[] = [];
    const candidatesToDeleteIds: string[] = [];
    const idsToSave = new Set<string>(); // v8.9.6: Track which IDs to actually write to DB

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
        
        // v8.9.9: Normaliser "Ikke oppgitt" til standard UKJENT format
        if (rawId && !rawId.startsWith("UKJENT")) {
            if (/^(ikke\s*oppgitt|ukjent|unknown|ingen)$/i.test(rawId)) {
                rawId = ""; // Force fallback to UKJENT_${pageId}
            } else {
                rawId = rawId.trim().replace(/^(?:kandidat|kand|cand)(?:nummer|nr|\.|_)?\s*:?\s*/i, "").trim();
                rawId = rawId.replace(/^(?:nr|nummer)\.?\s*/i, "").trim();
            }
        }

        let candId = rawId || `UKJENT_${pageToSave.id}`;
        let isUnknownStart = candId.startsWith("UKJENT");

        if (isBlank && isUnknownStart) {
            console.log(`Auto-discarding blank page from ${pageToSave.fileName}`);
            continue; 
        }

        if (isUnknownStart) {
            // v7.9.0: Sibling Inference (Same file base name check)
            const knownSibling = newCandidates.find(c => !c.id.startsWith("UKJENT") && c.pages.some(p => cleanBaseName(p.fileName) === currentBaseName));
            if (knownSibling) {
                candId = knownSibling.id;
                isUnknownStart = false;
            } else {
                // v7.9.37: Merge with existing Unknown Sibling
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
             // Rescue orphans (Unknown siblings) into this new Known candidate
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

    // v8.9.11: RUN SMART DUPLEX PAIRING RESCUE
    const rescueResult = performSequentialRescue(newCandidates);
    newCandidates = rescueResult.updated;
    candidatesToDeleteIds.push(...rescueResult.deleted);
    rescueResult.modifiedIds.forEach(id => idsToSave.add(id)); 

    try {
        // v8.9.6: Performance Fix - Only save MODIFIED candidates
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
    
    // v8.9.12: Project ID Guard for Process Queue
    const sessionProjectId = activeProject.id;

    const hasPending = (activeProject.unprocessedPages || []).some(p => p.status === 'pending');
    
    // ... Auto Flow logic ...
    if (!hasPending && processingCount === 0 && autoFlowPending && !rubricStatus.loading) {
       // ... existing autoflow logic ...
       const triggerAutoFlow = async () => {
          if (!activeProjectRef.current?.rubric) return;
          const cands = activeProjectRef.current.candidates;
          if (cands.length === 0) return; 
          setAutoFlowPending(false); 
          try {
             setCurrentAction("🤖 Auto-pilot: Analyserer klassens feil...");
             const improvedRubric = await improveRubricWithStudentData(activeProjectRef.current.rubric, cands, getActiveReasoningModel());
             
             // Guard
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
        // v8.9.12: Guard inside loop
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
                // Guard in state update
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

          if (currentProject.rubric && currentProject.rubric.criteria.length > 0) {
             if (rubricStatus.loading) { hasMore = false; break; }

             if (page.mimeType === 'text/plain') {
                setCurrentAction(`Analyserer digital tekst: ${page.fileName}...`);
                const res = await analyzeTextContent(page.rawText || "", activeProjectRef.current?.rubric, page.attachedImages, signal);
                setCurrentAction(`Lagrer analyse for ${page.fileName}...`);
                // Guard Check before integrate
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
                  // Guard Check before integrate
                  if (activeProjectRef.current?.id === sessionProjectId) {
                      await integratePageResults(page, results);
                  }
                }
             }
             localBatchCompleted++;
             setBatchCompleted(localBatchCompleted);
             localProcessedCount++;
             const elapsedTime = Date.now() - batchStartTime;
             setEtaSeconds(Math.round(((elapsedTime / localProcessedCount) * (currentProject.unprocessedPages!.length - localBatchCompleted)) / 1000));
          }
          
        } catch (e: any) {
           if (e.name === 'AbortError' || e.message === 'Aborted') {
             console.log(`Fil ${page.fileName} ble hoppet over av bruker.`);
             updateActiveProject({ unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'skipped' as const, statusLabel: 'Hoppet over' } : p) });
             continue; 
           }

           const msg = e?.message || String(e);
           const isNetworkError = msg.includes("fetch failed") || msg.includes("NetworkError") || msg.includes("503") || msg.includes("504") || msg.includes("Failed to fetch") || msg.includes("timeout") || msg.includes("timed out");
           const isQuotaError = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");

           if (!isNetworkError && !isQuotaError && !rotatedIds.current.has(page.id)) {
              console.log(`Smart Retry: Feil oppstod, forsøker å rotere ${page.fileName} 180 grader...`);
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

           console.error(`Feil under prosessering av ${page.id}`, e);
           failedIds.add(page.id); 
           // Guard update
           if (activeProjectRef.current?.id === sessionProjectId) {
               updateActiveProject({ unprocessedPages: (activeProjectRef.current?.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error' as const, statusLabel: isNetworkError ? 'Tidsavbrudd' : 'Feilet' } : p) });
           }
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
  }, [activeProject?.unprocessedPages, activeProject?.rubric, retryTrigger, processingCount, rubricStatus.loading]); 

  // ... rest of the hook (handleRetryFailed, handleRegeneratePage, etc.) unchanged but included in context logic ...
  
  const handleRegeneratePage = async (candId: string, pageId: string) => {
    if (!activeProject) return;
    // Guard
    const startProjectId = activeProject.id;

    const candidate = activeProject.candidates.find(c => c.id === candId);
    if (!candidate) return;
    const page = candidate.pages.find(p => p.id === pageId);
    if (!page) return;

    try {
      const base64 = await getMedia(page.id);
      if (!base64) return;
      
      const results = await transcribeAndAnalyzeImage(
          { ...page, base64Data: base64.split(',')[1], forceRescan: true } as any, 
          activeProject.rubric,
          undefined,
          PRO_MODEL 
      );
      if (results && results.length > 0) {
         // Guard Check
         if (activeProjectRef.current?.id === startProjectId) {
             await integratePageResults(page, [results[0]]);
         }
      }
    } catch (e) { console.error(e); }
  };

  const handleRegenerateCriterion = async (name: string) => {
    if (!activeProject?.rubric) return;
    // Guard
    const startProjectId = activeProject.id;

    const criterion = activeProject.rubric.criteria.find(c => c.name === name);
    if (!criterion) return;
    try {
      const updates = await regenerateSingleCriterion(criterion, getActiveReasoningModel());
      
      // Guard Check
      if (activeProjectRef.current?.id !== startProjectId) return;

      const newCriteria = activeProject.rubric.criteria.map(c => c.name === name ? { ...c, ...updates } : c);
      updateActiveProject({ rubric: { ...activeProject.rubric, criteria: newCriteria } });
    } catch (e) { console.error(e); }
  };

  const handleRetryFailed = () => {
      setActiveProject(prev => {
          if (!prev) return null;
          const updatedUnprocessed = (prev.unprocessedPages || []).map(p => 
              p.status === 'error' ? { ...p, status: 'pending' as const, statusLabel: undefined } : p
          );
          return { ...prev, unprocessedPages: updatedUnprocessed, updatedAt: Date.now() };
      });
      setRetryTrigger(prev => prev + 1);
  };

  const handleBatchEvaluation = async (candidateIds: string[], force: boolean = false) => {
    if (!activeProjectRef.current?.rubric) return;
    // Guard
    const startProjectId = activeProjectRef.current.id;

    isStoppingEvaluation.current = false;
    
    let candsToProcess = activeProjectRef.current.candidates;
    if (candidateIds && candidateIds.length > 0) {
       candsToProcess = candsToProcess.filter(c => candidateIds.includes(c.id));
    }

    setRubricStatus({ loading: true, text: `Vurderer ${candsToProcess.length} kandidater...` });
    setBatchTotal(candsToProcess.length);
    setBatchCompleted(0);
    const batchStartTime = Date.now();
    let localProcessedCount = 0;

    for (let i = 0; i < candsToProcess.length; i++) {
      // Loop Guard
      if (activeProjectRef.current?.id !== startProjectId) break;

      const cand = candsToProcess[i];
      if (isStoppingEvaluation.current) break;
      if (!force && cand.status === 'evaluated') {
          localProcessedCount++;
          setBatchCompleted(localProcessedCount);
          continue;
      }
      
      setCurrentAction(`Vurderer ${cand.name} (${i + 1}/${candsToProcess.length})...`);
      try {
        const res = await evaluateCandidate(cand, activeProjectRef.current.rubric, getActiveReasoningModel());
        
        // Save Guard
        if (activeProjectRef.current?.id === startProjectId) {
            const updatedCand = { ...cand, evaluation: res, status: 'evaluated' as const };
            await saveCandidate(updatedCand);
            
            setActiveProject(prev => prev ? ({ ...prev, candidates: prev.candidates.map(c => c.id === cand.id ? updatedCand : c) }) : null);
        }
      } catch (e: any) {
         console.error(`Feil ved vurdering av ${cand.name}:`, e);
      }

      localProcessedCount++;
      setBatchCompleted(localProcessedCount);
      const elapsedTime = Date.now() - batchStartTime;
      setEtaSeconds(Math.round(((elapsedTime / localProcessedCount) * (candsToProcess.length - localProcessedCount)) / 1000));
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
    // Guard
    const startProjectId = activeProject.id;

    const cand = activeProject.candidates.find(c => c.id === id);
    if (!cand) return;
    setRubricStatus({ loading: true, text: `Vurderer ${cand.name}...` });
    try {
      const res = await evaluateCandidate(cand, activeProject.rubric, getActiveReasoningModel());
      
      // Save Guard
      if (activeProjectRef.current?.id === startProjectId) {
          const updated = { ...cand, evaluation: res, status: 'evaluated' as const };
          await saveCandidate(updated);
          setActiveProject(prev => prev ? ({ ...prev, candidates: prev.candidates.map(c => c.id === id ? updated : c) }) : null);
      }
    } catch(e: any) {
        console.error(e);
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
      // Guard
      const startProjectId = activeProject.id;

      setRubricStatus({ loading: true, text: 'Analyserer filrekkefølge (Sekvensiell redning)...' });
      try { 
        // 1. Run local sequential rescue with SMART DUPLEX PAIRING (v8.9.11)
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

        // 2. Run AI cleanup (Original logic)
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
        setRubricStatus({ loading: false, text: '' }); 
        setCurrentAction('');
      }
    },
    handleRetryPage: (p: Page) => {
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
