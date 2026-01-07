
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Project, Candidate, Page, Rubric } from '../types';
import { LatexRenderer, Spinner, DocxRenderer } from './SharedUI';
import { getMedia, saveCandidate } from '../services/storageService';
import { cleanTaskPair } from '../services/geminiService';

const base64ToBlob = (base64: string): Blob => {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

// v8.0.46: Sticky Loading LazyImage
// Once visible, it stays visible. No more toggling off when scrolling away.
const LazyImage: React.FC<{ page: Page }> = ({ page }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // STOP observing once visible. Keep it loaded.
        }
      },
      { rootMargin: '600px' } // Increased margin to load earlier
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // v8.5.7: Docx Visual Preview
  if (page.fileName.toLowerCase().endsWith('.docx')) {
      return (
          <div ref={containerRef} className="relative w-full overflow-hidden rounded-xl border border-slate-200 shadow-md bg-white min-h-[400px]">
              <div className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-blue-500 text-white text-[7px] font-black uppercase tracking-widest opacity-80">
                  WORD DOKUMENT
              </div>
              {isVisible ? (
                  <DocxRenderer pageId={page.id} />
              ) : (
                  <div className="h-full flex items-center justify-center bg-slate-50">
                      <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Laster dokument...</p>
                  </div>
              )}
          </div>
      );
  }

  // Fallback for pure text files that are not docx
  if (page.mimeType === 'text/plain') {
    return (
      <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 shadow-md bg-white p-8 min-h-[400px]">
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-blue-500 text-white text-[7px] font-black uppercase tracking-widest opacity-80">
          TEKSTFIL
        </div>
        <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4 border-b pb-2">
          {page.fileName}
        </div>
        <div className="text-slate-600 text-sm whitespace-pre-wrap font-medium leading-relaxed font-serif italic">
          {page.rawText || page.transcription}
        </div>
      </div>
    );
  }

  useEffect(() => {
    let currentUrl: string | null = null;
    let timeoutId: any;

    const loadFullRes = async () => {
      // If not visible yet, don't load. 
      // NOTE: We do NOT unload if isVisible becomes false (because we disconnected the observer)
      if (!isVisible) return;

      if (blobUrl) return;

      timeoutId = setTimeout(() => {
        if (!blobUrl && !error) {
          // Do not set error on timeout, just keep trying or show loading
          console.warn(`Slow loading for page ${page.id}`);
        }
      }, 5000);

      try {
        const base64 = await getMedia(page.id);
        clearTimeout(timeoutId);
        if (base64) {
          const blob = base64ToBlob(base64);
          currentUrl = URL.createObjectURL(blob);
          setBlobUrl(currentUrl);
        } else {
          setError(true);
        }
      } catch (e) {
        clearTimeout(timeoutId);
        console.error("Feil ved lasting av bilde", e);
        setError(true);
      }
    };

    loadFullRes();

    return () => {
      clearTimeout(timeoutId);
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [isVisible, page.id]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 shadow-md group bg-white min-h-[300px]"
    >
      {!blobUrl && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 flex-col gap-3">
          <Spinner size="w-6 h-6" color="text-slate-300" />
          <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">
            {isVisible ? 'Henter fra arkiv...' : 'Venter på skroll...'}
          </p>
          {page.imagePreview && !isVisible && (
            <img 
              src={page.imagePreview} 
              className="absolute inset-0 w-full h-full object-contain opacity-20 blur-sm" 
              alt="Preview"
            />
          )}
        </div>
      )}

      {blobUrl && (
        <div className="relative">
          <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded bg-emerald-500 text-white text-[7px] font-black uppercase tracking-widest opacity-80">
            HD ✓
          </div>
          <img 
            src={blobUrl} 
            onLoad={() => setIsLoaded(true)}
            style={{ transform: `rotate(${page.rotation || 0}deg)` }} 
            className={`w-full transition-all duration-500 object-contain ${isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} 
            alt={page.fileName}
          />
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-50/90 text-rose-500 p-4 text-center">
          <p className="text-[8px] font-black uppercase tracking-widest Fil mangler">Fil mangler (Slett & Last opp på nytt)</p>
        </div>
      )}
    </div>
  );
};

// Helper for hydration
const hydrateEvidence = (text: string, evidence?: string) => {
  if (!evidence || !text) return text;
  return text.replace(/\[BILDEVEDLEGG:\s*Se visualEvidence\s*\]/gi, `[BILDEVEDLEGG: ${evidence}]`);
};

// v8.3.5: Extracted PageEditor to handle local state for deferred updates (Enter to commit)
const PageEditor: React.FC<{
  page: Page;
  index: number;
  isEditing: boolean;
  isRefreshing: boolean;
  onToggleEdit: () => void;
  onRotate: () => void;
  onRescan: () => void;
  onDelete: () => void;
  onMetadataChange: (field: 'candidateId' | 'pageNumber' | 'part', value: string | number) => void;
  onTaskUpdate: (tasks: string) => void;
  onTextChange: (val: string) => void;
  onEvidenceChange: (val: string) => void;
}> = ({ 
  page, index, isEditing, isRefreshing, 
  onToggleEdit, onRotate, onRescan, onDelete, 
  onMetadataChange, onTaskUpdate, onTextChange, onEvidenceChange 
}) => {
  // Local state for page number to prevent jumping
  const [localPageNum, setLocalPageNum] = useState(page.pageNumber || index + 1);

  useEffect(() => {
    setLocalPageNum(page.pageNumber || index + 1);
  }, [page.pageNumber, index]);

  const commitPageNum = () => {
    if (localPageNum !== (page.pageNumber || index + 1)) {
        onMetadataChange('pageNumber', localPageNum);
    }
  };

  const handlePageNumKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        commitPageNum();
        (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-start relative ${isRefreshing ? 'opacity-50 pointer-events-none' : ''}`}>
      {isRefreshing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white/40 backdrop-blur-[2px] rounded-3xl animate-in fade-in duration-300">
          <Spinner size="w-12 h-12" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 animate-pulse">Transkriberer på nytt...</p>
        </div>
      )}
      
      <div className="space-y-4">
         <div className="flex justify-between items-center px-2">
           <div className="flex items-center gap-4">
             <div className="flex flex-col items-center">
               <span className="text-[7px] font-black uppercase text-slate-400 mb-0.5 tracking-widest">Side</span>
               <input 
                 type="number"
                 title="Endre sidetall (Trykk Enter for å lagre)"
                 value={localPageNum}
                 onChange={e => setLocalPageNum(parseInt(e.target.value) || 0)}
                 onBlur={commitPageNum}
                 onKeyDown={handlePageNumKeyDown}
                 className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center font-black text-xs text-center outline-none ring-indigo-500/30 focus:ring-2"
               />
             </div>

             <div className="flex flex-col">
               <span className="text-[7px] font-black uppercase text-slate-400 mb-0.5 tracking-widest">Kandidat / Del</span>
               <div className="flex items-center gap-1.5">
                  <input 
                    type="text"
                    title="Flytt denne siden til et annet kandidatnummer"
                    value={page.candidateId || ""}
                    placeholder="ID"
                    onChange={e => onMetadataChange('candidateId', e.target.value)}
                    className="w-14 h-7 bg-white border border-slate-200 rounded-md text-center font-black text-[10px] outline-none"
                  />
                  <select 
                    value={page.part || "Del 1"}
                    title="Bytt mellom Del 1 og Del 2 for denne siden"
                    onChange={e => onMetadataChange('part', e.target.value)}
                    className="h-7 bg-white border border-slate-200 rounded-md px-1 font-black text-[10px] outline-none"
                  >
                    <option value="Del 1">Del 1</option>
                    <option value="Del 2">Del 2</option>
                  </select>
                </div>
             </div>
           </div>
           <div className="flex gap-2">
             <button onClick={onRotate} title="Roter bildet 90 grader med klokken" className="w-10 h-10 flex items-center justify-center bg-white border rounded-xl hover:bg-slate-50 transition-all text-xs">↻</button>
             <button 
               onClick={onRescan} 
               title="Slett nåværende tekst og tving KI-en til å se på bildet helt på nytt (høyeste presisjon)" 
               className="h-10 px-3 flex items-center justify-center bg-white border rounded-xl hover:bg-indigo-50 text-indigo-600 transition-all text-[9px] font-black gap-1.5"
             >
               ↻ Transkriber på nytt
             </button>
             <button onClick={onDelete} title="Slett denne siden" className="w-10 h-10 flex items-center justify-center bg-white border rounded-xl hover:bg-rose-50 text-rose-400 transition-all">✕</button>
           </div>
         </div>
         <LazyImage page={page} />
      </div>
      <div className="space-y-4">
         <div className="flex items-center justify-between px-2 h-10">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Elevens tekst & Bevis</span>
            <button onClick={onToggleEdit} className={`text-[9px] font-black uppercase px-4 py-2 rounded-full border transition-all ${isEditing ? 'bg-emerald-600 text-white' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}>
              {isEditing ? 'Lagre ✓' : 'Rediger ✎'}
            </button>
         </div>
         <div className="bg-indigo-600 rounded-2xl p-8 shadow-xl min-h-[400px] flex flex-col relative overflow-hidden group/trans">
            <div className="flex justify-between items-center mb-6 border-b border-indigo-400/40 pb-4 relative z-10">
              <span className="text-[9px] font-black uppercase text-indigo-100 tracking-[0.2em]">LaTeX Matematikk</span>
              {isEditing ? (
                <input 
                  type="text" 
                  defaultValue={page.identifiedTasks?.map(t => `${t.taskNumber}${t.subTask}`).join(", ") || ""}
                  placeholder="Oppgaver (f.eks 1a, 2b)..."
                  className="text-[10px] font-black bg-indigo-800 text-white px-3 py-1.5 rounded-lg border border-indigo-500 outline-none w-1/2 placeholder-indigo-400"
                  onBlur={(e) => onTaskUpdate(e.target.value)}
                />
              ) : (
                page.identifiedTasks && page.identifiedTasks.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1 max-w-[60%]">
                     {page.identifiedTasks.map(t => {
                       const label = `${t.taskNumber || ''}${t.subTask || ''}`;
                       if (!label) return null;
                       return (
                         <span key={label} className="text-[8px] font-black px-2 py-1 rounded-md uppercase bg-white/20 text-white">
                           {label}
                         </span>
                       );
                     })}
                  </div>
                )
              )}
            </div>
            <div className="flex-1 relative z-10 custom-scrollbar overflow-y-auto">
               {isEditing ? (
                 <div className="flex flex-col gap-4 h-full">
                   <div className="flex-1 flex flex-col">
                     <label className="text-[7px] font-black uppercase text-indigo-200 mb-1 block tracking-widest">Hovedtranskripsjon</label>
                     <textarea 
                        autoFocus 
                        value={(page.transcription || '').replace(/\\n/g, '\n').replace(/\\\\/g, '\\\\\n')} 
                        onChange={e => onTextChange(e.target.value)} 
                        className="w-full min-h-[600px] flex-1 bg-indigo-700/40 text-white p-4 rounded-xl text-sm font-medium outline-none resize-none custom-scrollbar border border-indigo-500/30" 
                     />
                     <label className="text-[7px] font-black uppercase text-indigo-200 mt-4 mb-1 block tracking-widest">CAS / Figurtolkning (visualEvidence)</label>
                     <textarea 
                        value={(page.visualEvidence || '').replace(/\\n/g, '\n')} 
                        onChange={e => onEvidenceChange(e.target.value)} 
                        className="w-full h-32 bg-indigo-700/40 text-white p-4 rounded-xl text-xs font-mono outline-none resize-none custom-scrollbar border border-indigo-500/30" 
                     />
                   </div>
                 </div>
               ) : (
                 <div className="text-white space-y-6">
                   <div className="pl-1">
                     <LatexRenderer content={hydrateEvidence(page.transcription || "", page.visualEvidence)} className="text-base text-white font-medium leading-relaxed" />
                     
                     {page.visualEvidence && !page.transcription?.match(/\[(?:AI-TOLKNING AV FIGUR|BILDEVEDLEGG)/) && (
                       <div className="mt-8">
                          <LatexRenderer content={`[BILDEVEDLEGG: ${page.visualEvidence}]`} />
                       </div>
                     )}

                     {(!page.transcription || page.transcription.trim() === "") && !page.visualEvidence && (
                       <div className="py-10 text-center opacity-40 italic font-black uppercase text-[9px] tracking-widest">Tom side</div>
                     )}
                   </div>
                 </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

interface ReviewStepProps {
  activeProject: Project;
  selectedReviewCandidateId: string | null;
  setSelectedReviewCandidateId: (id: string | null) => void;
  reviewFilter: string;
  setReviewFilter: (filter: string) => void;
  filteredCandidates: Candidate[];
  currentReviewCandidate: Candidate | null;
  rotatePage: (pageId: string) => void;
  deletePage: (candidateId: string, pageId: string) => void;
  updatePageNumber: (candidateId: string, pageId: string, newNum: number) => void;
  updatePageTasks: (candidateId: string, pageId: string, tasks: string) => void;
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>;
  handleSmartCleanup?: () => Promise<void>;
  isCleaning: boolean;
  handleRegeneratePage: (candidateId: string, pageId: string) => Promise<void>;
  initialTaskFilter?: { id: string, part: 1 | 2 } | null; // v8.0.53
}

export const ReviewStep: React.FC<ReviewStepProps> = ({
  activeProject,
  selectedReviewCandidateId,
  setSelectedReviewCandidateId,
  reviewFilter,
  setReviewFilter,
  filteredCandidates,
  currentReviewCandidate,
  rotatePage,
  deletePage,
  updatePageNumber,
  updatePageTasks,
  setActiveProject,
  handleSmartCleanup,
  isCleaning,
  handleRegeneratePage,
  initialTaskFilter
}) => {
  const [editingPageIds, setEditingPageIds] = useState<Set<string>>(new Set());
  const [taskFilter, setTaskFilter] = useState<{ id: string, part: 1 | 2 } | null>(null);
  const [pageLoadingIds, setPageLoadingIds] = useState<Set<string>>(new Set());
  const mainScrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedReviewCandidateId && mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [selectedReviewCandidateId]);

  // v8.0.53: Apply deep link filter
  useEffect(() => {
    if (initialTaskFilter) {
      setTaskFilter(initialTaskFilter);
    }
  }, [initialTaskFilter]);

  const toggleEdit = (pageId: string) => {
    const next = new Set(editingPageIds);
    if (next.has(pageId)) next.delete(pageId);
    else next.add(pageId);
    setEditingPageIds(next);
  };

  const onRescan = async (candidateId: string, pageId: string) => {
    setPageLoadingIds(prev => new Set(prev).add(pageId));
    await handleRegeneratePage(candidateId, pageId);
    setPageLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(pageId);
        return next;
    });
  };
  
  const getGroupedTasks = (candidate: Candidate) => {
    const groups: Record<string, Set<string>> = {
      "Del 1": new Set<string>(),
      "Del 2": new Set<string>()
    };
    candidate.pages.forEach(p => {
      const part = p.part || "Del 1";
      const groupKey = part.toLowerCase().includes("2") ? "Del 2" : "Del 1";
      p.identifiedTasks?.forEach(t => {
        const taskNum = t.taskNumber || "";
        const subT = t.subTask || "";
        if (taskNum) {
          const label = `${taskNum}${subT}`;
          groups[groupKey].add(label);
        }
      });
    });
    return {
      del1: Array.from(groups["Del 1"]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})),
      del2: Array.from(groups["Del 2"]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}))
    };
  };

  // v8.0.35: Enhanced Completion Status with Part-Check
  // v8.2.12: Page existence check to avoid missing status if pages are submitted but no tasks found
  const getCandidateStatus = (candidate: Candidate, rubric: Rubric | null) => {
    if (!rubric) return { isComplete: false, d1Status: 'missing', d2Status: 'missing' };

    const tasksD1 = new Set<string>();
    const tasksD2 = new Set<string>();

    rubric.criteria.forEach(c => {
      const part = (c.part || "Del 1").toLowerCase().includes("2") ? "2" : "1";
      const label = `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (part === "2") tasksD2.add(label);
      else tasksD1.add(label);
    });

    const foundD1 = new Set<string>();
    const foundD2 = new Set<string>();
    
    // Check if any pages exist for each part (regardless of task detection)
    const hasPagesD1 = candidate.pages.some(p => !(p.part || "Del 1").toLowerCase().includes("2"));
    const hasPagesD2 = candidate.pages.some(p => (p.part || "").toLowerCase().includes("2"));

    candidate.pages.forEach(p => {
      const part = (p.part || "Del 1").toLowerCase().includes("2") ? "2" : "1";
      p.identifiedTasks?.forEach(t => {
        if (t.taskNumber) {
           const label = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
           if (part === "2") foundD2.add(label);
           else foundD1.add(label);
        }
      });
    });

    const checkPart = (rubricTasks: Set<string>, foundTasks: Set<string>, hasPages: boolean) => {
        if (rubricTasks.size === 0) return 'none';
        if (foundTasks.size === 0) {
            // If pages exist but no tasks found, treat as partial (warning) instead of missing (ban)
            return hasPages ? 'partial' : 'missing';
        }
        return Array.from(rubricTasks).every(t => foundTasks.has(t)) ? 'complete' : 'partial';
    };

    const d1Status = checkPart(tasksD1, foundD1, hasPagesD1);
    const d2Status = checkPart(tasksD2, foundD2, hasPagesD2);

    return { 
        isComplete: (d1Status === 'complete' || d1Status === 'none') && (d2Status === 'complete' || d2Status === 'none'),
        d1Status,
        d2Status
    };
  };

  const handleMetadataChange = async (pageId: string, field: 'candidateId' | 'pageNumber' | 'part', value: string | number) => {
    setActiveProject(prev => {
      if (!prev) return null;
      let newCandidates = [...prev.candidates];
      let pageToMove: Page | null = null;
      let sourceCandidateId = "";

      if (field === 'candidateId') {
        newCandidates = newCandidates.map(c => {
          const pageIndex = c.pages.findIndex(p => p.id === pageId);
          if (pageIndex !== -1) {
            sourceCandidateId = c.id;
            pageToMove = { ...c.pages[pageIndex], candidateId: String(value) };
            const updatedPages = c.pages.filter(p => p.id !== pageId);
            return { ...c, pages: updatedPages };
          }
          return c;
        }).filter(c => c.pages.length > 0);

        if (pageToMove) {
          const targetCandidateId = String(value);
          let targetCandidateIdx = newCandidates.findIndex(c => String(c.id) === targetCandidateId);
          
          if (targetCandidateIdx === -1) {
            const newCand: Candidate = {
              id: targetCandidateId,
              projectId: prev.id,
              name: `Kandidat ${targetCandidateId}`,
              status: 'completed',
              pages: [pageToMove]
            };
            newCandidates.push(newCand);
            saveCandidate(newCand);
          } else {
            newCandidates[targetCandidateIdx] = {
              ...newCandidates[targetCandidateIdx],
              pages: [...newCandidates[targetCandidateIdx].pages, pageToMove].sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0))
            };
            saveCandidate(newCandidates[targetCandidateIdx]);
          }
          if (selectedReviewCandidateId === sourceCandidateId) {
             setSelectedReviewCandidateId(targetCandidateId);
          }
        }
      } else {
        newCandidates = newCandidates.map(c => {
          if (c.pages.some(p => p.id === pageId)) {
            const updatedCand = {
              ...c,
              pages: c.pages.map(p => p.id === pageId ? { ...p, [field]: value } : p)
            };
            saveCandidate(updatedCand);
            return updatedCand;
          }
          return c;
        });
      }

      return { ...prev, candidates: newCandidates };
    });
  };

  const allUniqueTasks = useMemo(() => {
    const del1 = new Set<string>();
    const del2 = new Set<string>();

    activeProject.candidates.forEach(c => {
      c.pages.forEach(p => {
        const part = p.part || "Del 1";
        const isDel2 = part.toLowerCase().includes("2");
        p.identifiedTasks?.forEach(t => {
          if (t.taskNumber) {
            const label = `${t.taskNumber}${t.subTask || ""}`;
            if (isDel2) del2.add(label); else del1.add(label);
          }
        });
      });
    });

    return [
      ...Array.from(del1).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).map(id => ({ id, part: 1 as const })),
      ...Array.from(del2).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).map(id => ({ id, part: 2 as const }))
    ];
  }, [activeProject.candidates]);

  const finalCandidates = useMemo(() => {
    let filtered = filteredCandidates.filter(c => {
      if (!taskFilter) return true;
      return c.pages.some(p => {
        const pagePart = (p.part || "Del 1").toLowerCase().includes("2") ? 2 : 1;
        if (pagePart !== taskFilter.part) return false;
        return p.identifiedTasks?.some(t => {
          return `${t.taskNumber}${t.subTask || ""}` === taskFilter.id;
        });
      });
    });
    return filtered.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aIsUnknown = aName.includes("ukjent");
      const bIsUnknown = bName.includes("ukjent");
      if (aIsUnknown && !bIsUnknown) return 1;
      if (!aIsUnknown && bIsUnknown) return -1;
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredCandidates, taskFilter]);

  const sortedReviewPages = useMemo(() => {
    if (!currentReviewCandidate) return [];
    return [...currentReviewCandidate.pages].sort((a, b) => {
      const partA = (a.part || "Del 1").toLowerCase().includes("2") ? 2 : 1;
      const partB = (b.part || "Del 1").toLowerCase().includes("2") ? 2 : 1;
      if (partA !== partB) return partA - partB;
      return (a.pageNumber || 0) - (b.pageNumber || 0);
    });
  }, [currentReviewCandidate]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F1F5F9]">
      <aside className="w-64 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full">
         <div className="p-4 border-b shrink-0 bg-white/80 sticky top-0 z-20">
            {/* ... Header and Search ... */}
            <div className="flex justify-between items-center mb-3">
               <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Kandidater</h3>
               {handleSmartCleanup && (
                 <button onClick={handleSmartCleanup} disabled={isCleaning} title="Kjører en global KI-rydding som slår sammen kandidater og flytter ukjente sider" className="text-[8px] font-black uppercase text-indigo-600 px-2 py-1 rounded-md border border-indigo-100 hover:bg-indigo-50 transition-all">
                   {isCleaning ? <Spinner size="w-2 h-2" /> : '✨ Rydd'}
                 </button>
               )}
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="Søk..." className="w-full bg-slate-50 border p-2 rounded-lg font-bold text-[10px] outline-none" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)} />
              {/* Task Pills */}
              {allUniqueTasks.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-60 overflow-y-auto custom-scrollbar p-1">
                  {allUniqueTasks.map(t => {
                    const isActive = taskFilter?.id === t.id && taskFilter?.part === t.part;
                    const isDel2 = t.part === 2;
                    return (
                      <button 
                        key={`${t.part}-${t.id}`}
                        onClick={() => setTaskFilter(isActive ? null : t)}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all ${
                          isActive 
                            ? (isDel2 ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' : 'bg-indigo-600 text-white border-indigo-700 shadow-sm') 
                            : (isDel2 ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100')
                        }`}
                      >
                        {t.id}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50/30">
           {finalCandidates.length === 0 ? (
             <div className="py-10 text-center opacity-30 italic text-[10px] font-bold uppercase tracking-widest text-slate-400">Ingen treff</div>
           ) : (
             finalCandidates.map(c => {
               const { del1, del2 } = getGroupedTasks(c);
               // v8.0.35: Updated Status Check
               const { isComplete, d1Status, d2Status } = getCandidateStatus(c, activeProject.rubric); 
               const isSelected = selectedReviewCandidateId === c.id;
               const isUnknown = c.name.toLowerCase().includes('ukjent');
               return (
                 <button key={c.id} onClick={() => setSelectedReviewCandidateId(c.id)} className={`w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : isUnknown ? 'bg-rose-50/30 border-rose-100' : 'bg-white hover:border-indigo-100'}`}>
                   <div className="flex justify-between items-start mb-2">
                     <div className="flex items-center gap-1.5">
                       <div className={`font-black text-[12px] truncate max-w-[100px] ${isUnknown && !isSelected ? 'text-rose-600' : ''}`}>{c.name || 'Ukjent'}</div>
                       {isComplete && <span className="text-[10px]" title="Alle oppgaver funnet">✅</span>}
                     </div>
                     <div className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>{c.pages.length} s</div>
                   </div>
                   <div className="flex flex-col gap-1.5">
                     {(del1.length > 0 || del2.length > 0) && (
                       <div className="flex flex-wrap gap-1">
                         {del1.map(t => (<span key={t} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-indigo-500/30' : 'bg-indigo-50 text-indigo-500'}`}>{t}</span>))}
                         {del2.map(t => (<span key={t} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-emerald-500/30' : 'bg-emerald-50 text-emerald-600'}`}>{t}</span>))}
                       </div>
                     )}
                     {/* v8.0.35: Smart Badges */}
                     <div className="flex gap-1 mt-1 justify-end opacity-80">
                        {d1Status === 'complete' ? <span title="Del 1 Komplett">1️⃣✅</span> : d1Status === 'missing' ? <span title="Ingen Del 1">1️⃣🚫</span> : <span title="Del 1 Ufullstendig/Delvis">1️⃣⚠️</span>}
                        {d2Status === 'complete' ? <span title="Del 2 Komplett">2️⃣✅</span> : d2Status === 'missing' ? <span title="Ingen Del 2">2️⃣🚫</span> : <span title="Del 2 Ufullstendig/Delvis">2️⃣⚠️</span>}
                     </div>
                   </div>
                 </button>
               );
             })
           )}
         </div>
      </aside>

      <main ref={mainScrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-6 h-full bg-[#F1F5F9]">
        <div className="max-w-[1400px] mx-auto space-y-8 pb-32">
          {!currentReviewCandidate ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
              <h2 className="text-lg font-black uppercase tracking-widest text-slate-400">Velg en kandidat</h2>
            </div>
          ) : (
            <>
              <header className="flex justify-between items-end mb-8">
                 <div>
                   <h2 className="text-3xl font-black text-slate-800 tracking-tighter">{currentReviewCandidate.name || 'Ukjent'}</h2>
                   <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mt-1">Kontrollerer transkripsjon</p>
                 </div>
              </header>

              <div className="space-y-12">
                {sortedReviewPages.map((p, idx) => (
                  <PageEditor
                    key={p.id}
                    page={p}
                    index={idx}
                    isEditing={editingPageIds.has(p.id)}
                    isRefreshing={pageLoadingIds.has(p.id)}
                    onToggleEdit={() => toggleEdit(p.id)}
                    onRotate={() => rotatePage(p.id)}
                    onRescan={() => onRescan(currentReviewCandidate.id, p.id)}
                    onDelete={() => { if(confirm('Slett denne siden permanent?')) deletePage(currentReviewCandidate.id, p.id); }}
                    onMetadataChange={(field, value) => handleMetadataChange(p.id, field, value)}
                    onTaskUpdate={(val) => updatePageTasks(currentReviewCandidate.id, p.id, val)}
                    onTextChange={(val) => {
                       setActiveProject(prev => prev ? ({ ...prev, candidates: prev.candidates.map(c => c.id === currentReviewCandidate.id ? { ...c, pages: c.pages.map(pg => pg.id === p.id ? { ...pg, transcription: val } : pg) } : c) }) : null);
                    }}
                    onEvidenceChange={(val) => {
                       setActiveProject(prev => prev ? ({ ...prev, candidates: prev.candidates.map(c => c.id === currentReviewCandidate.id ? { ...c, pages: c.pages.map(pg => pg.id === p.id ? { ...pg, visualEvidence: val } : pg) } : c) }) : null);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
