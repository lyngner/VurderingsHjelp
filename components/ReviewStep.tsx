
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Project, Candidate, Page } from '../types';
import { LatexRenderer, Spinner } from './SharedUI';
import { getMedia, saveCandidate } from '../services/storageService';

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
        } else {
          setIsVisible(false);
        }
      },
      { rootMargin: '400px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let currentUrl: string | null = null;

    const loadFullRes = async () => {
      if (!isVisible) {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          setBlobUrl(null);
          setIsLoaded(false);
        }
        return;
      }

      if (blobUrl) return;

      try {
        const base64 = await getMedia(page.id);
        if (base64) {
          const blob = base64ToBlob(base64);
          currentUrl = URL.createObjectURL(blob);
          setBlobUrl(currentUrl);
        }
      } catch (e) {
        console.error("Feil ved lasting av bilde", e);
        setError(true);
      }
    };

    loadFullRes();

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [isVisible, page.id]);

  if (page.mimeType === 'text/plain') {
    return (
      <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 shadow-md bg-white p-8 min-h-[400px]">
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-blue-500 text-white text-[7px] font-black uppercase tracking-widest opacity-80">
          DIGITAL BESVARELSE
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
          <p className="text-[8px] font-black uppercase tracking-widest">Kunne ikke laste bildet.</p>
        </div>
      )}
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
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>;
  handleSmartCleanup?: () => Promise<void>;
  isCleaning: boolean;
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
  setActiveProject,
  handleSmartCleanup,
  isCleaning
}) => {
  const [editingPageIds, setEditingPageIds] = useState<Set<string>>(new Set());
  const [taskFilter, setTaskFilter] = useState<string | null>(null);
  const mainScrollRef = useRef<HTMLElement>(null);

  // CRITICAL UX v4.75.0: Auto-scroll til toppen ved kandidatbytte
  useEffect(() => {
    if (selectedReviewCandidateId && mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [selectedReviewCandidateId]);

  const toggleEdit = (pageId: string) => {
    const next = new Set(editingPageIds);
    if (next.has(pageId)) next.delete(pageId);
    else next.add(pageId);
    setEditingPageIds(next);
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
          const cleanSub = subT.toUpperCase().includes('UKJENT') ? 'UKJENT' : subT;
          const label = `${taskNum}${cleanSub}`;
          groups[groupKey].add(label);
        }
      });
    });
    return {
      del1: Array.from(groups["Del 1"]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})),
      del2: Array.from(groups["Del 2"]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}))
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
          let targetCandidateIdx = newCandidates.findIndex(c => c.id === targetCandidateId);
          
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
    const tasks = new Set<string>();
    activeProject.candidates.forEach(c => {
      c.pages.forEach(p => {
        p.identifiedTasks?.forEach(t => {
          if (t.taskNumber) {
            const cleanSub = (t.subTask || "").toUpperCase().includes('UKJENT') ? 'UKJENT' : t.subTask || "";
            tasks.add(`${t.taskNumber}${cleanSub}`);
          }
        });
      });
    });
    return Array.from(tasks).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
  }, [activeProject.candidates]);

  const finalCandidates = useMemo(() => {
    return filteredCandidates.filter(c => {
      if (!taskFilter) return true;
      return c.pages.some(p => p.identifiedTasks?.some(t => {
        const cleanSub = (t.subTask || "").toUpperCase().includes('UKJENT') ? 'UKJENT' : t.subTask || "";
        return `${t.taskNumber}${cleanSub}` === taskFilter;
      }));
    });
  }, [filteredCandidates, taskFilter]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F1F5F9]">
      <aside className="w-64 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full">
         <div className="p-4 border-b shrink-0 bg-white/80 sticky top-0 z-20">
            <div className="flex justify-between items-center mb-3">
               <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Kandidater</h3>
               {handleSmartCleanup && (
                 <button onClick={handleSmartCleanup} disabled={isCleaning} className="text-[8px] font-black uppercase text-indigo-600 px-2 py-1 rounded-md border border-indigo-100 hover:bg-indigo-50 transition-all">
                   {isCleaning ? <Spinner size="w-2 h-2" /> : '✨ Rydd'}
                 </button>
               )}
            </div>
            
            <div className="space-y-3">
              <input type="text" placeholder="Søk..." className="w-full bg-slate-50 border p-2 rounded-lg font-bold text-[10px] outline-none" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)} />

              {allUniqueTasks.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar p-1">
                  {allUniqueTasks.map(t => (
                    <button 
                      key={t}
                      onClick={() => setTaskFilter(t === taskFilter ? null : t)}
                      className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all ${taskFilter === t ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'}`}
                    >
                      {t}
                    </button>
                  ))}
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
               const isSelected = selectedReviewCandidateId === c.id;
               const isUnknown = c.name.toLowerCase().includes('ukjent');
               return (
                 <button key={c.id} onClick={() => setSelectedReviewCandidateId(c.id)} className={`w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : isUnknown ? 'bg-rose-50/30 border-rose-100' : 'bg-white hover:border-indigo-100'}`}>
                   <div className="flex justify-between items-start mb-2">
                     <div className={`font-black text-[12px] truncate max-w-[120px] ${isUnknown && !isSelected ? 'text-rose-600' : ''}`}>{c.name || 'Ukjent'}</div>
                     <div className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>{c.pages.length} s</div>
                   </div>
                   <div className="flex flex-col gap-1.5">
                     {(del1.length > 0 || del2.length > 0) && (
                       <div className="flex flex-wrap gap-1">
                         {del1.map(t => (<span key={t} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-indigo-500/30' : 'bg-indigo-50 text-indigo-500'}`}>{t}</span>))}
                         {del2.map(t => (<span key={t} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-emerald-500/30' : 'bg-emerald-50 text-emerald-600'}`}>{t}</span>))}
                       </div>
                     )}
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
                {currentReviewCandidate.pages.sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)).map((p, idx) => {
                  const isEditing = editingPageIds.has(p.id);
                  return (
                    <div key={p.id} className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                      <div className="space-y-4">
                         <div className="flex justify-between items-center px-2">
                           <div className="flex items-center gap-4">
                             <div className="flex flex-col items-center">
                               <span className="text-[7px] font-black uppercase text-slate-400 mb-0.5 tracking-widest">Side</span>
                               <input 
                                 type="number"
                                 value={p.pageNumber || idx + 1}
                                 onChange={e => handleMetadataChange(p.id, 'pageNumber', parseInt(e.target.value) || 0)}
                                 className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center font-black text-xs text-center outline-none ring-indigo-500/30 focus:ring-2"
                               />
                             </div>

                             <div className="flex flex-col">
                               <span className="text-[7px] font-black uppercase text-slate-400 mb-0.5 tracking-widest">Kandidat / Del</span>
                               <div className="flex items-center gap-1.5">
                                  <input 
                                    type="text"
                                    value={p.candidateId || ""}
                                    placeholder="ID"
                                    onChange={e => handleMetadataChange(p.id, 'candidateId', e.target.value)}
                                    className="w-14 h-7 bg-white border border-slate-200 rounded-md text-center font-black text-[10px] outline-none"
                                  />
                                  <select 
                                    value={p.part || "Del 1"}
                                    onChange={e => handleMetadataChange(p.id, 'part', e.target.value)}
                                    className="h-7 bg-white border border-slate-200 rounded-md px-1 font-black text-[10px] outline-none"
                                  >
                                    <option value="Del 1">Del 1</option>
                                    <option value="Del 2">Del 2</option>
                                  </select>
                               </div>
                             </div>
                           </div>
                           <div className="flex gap-2">
                             <button onClick={() => rotatePage(p.id)} title="Roter" className="w-10 h-10 flex items-center justify-center bg-white border rounded-xl hover:bg-slate-50 transition-all">↻</button>
                             <button onClick={() => { if(confirm('Slett?')) deletePage(currentReviewCandidate.id, p.id); }} title="Slett" className="w-10 h-10 flex items-center justify-center bg-white border rounded-xl hover:bg-rose-50 text-rose-400 transition-all">✕</button>
                           </div>
                         </div>
                         <LazyImage page={p} />
                      </div>
                      <div className="space-y-4">
                         <div className="flex items-center justify-between px-2 h-10">
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Transkripsjon</span>
                            <button onClick={() => toggleEdit(p.id)} className={`text-[9px] font-black uppercase px-4 py-2 rounded-full border transition-all ${isEditing ? 'bg-emerald-600 text-white' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}>
                              {isEditing ? 'Lagre ✓' : 'Rediger ✎'}
                            </button>
                         </div>
                         <div className="bg-indigo-600 rounded-2xl p-8 shadow-xl min-h-[400px] flex flex-col relative overflow-hidden group/trans">
                            <div className="flex justify-between items-center mb-6 border-b border-indigo-400/40 pb-4 relative z-10">
                              <span className="text-[9px] font-black uppercase text-indigo-100 tracking-[0.2em]">LaTeX Matematikk</span>
                              {p.identifiedTasks && p.identifiedTasks.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-1 max-w-[60%]">
                                   {p.identifiedTasks.map(t => {
                                     const cleanSub = (t.subTask || "").toUpperCase().includes('UKJENT') ? 'UKJENT' : t.subTask || "";
                                     const label = `${t.taskNumber || ''}${cleanSub}`;
                                     if (!label) return null;
                                     const isUnknown = label.toLowerCase().includes('ukjent');
                                     return (
                                       <span key={label} className={`text-[8px] font-black px-2 py-1 rounded-md uppercase ${isUnknown ? 'bg-rose-500 text-white' : 'bg-white/20 text-white'}`}>
                                         {label}
                                       </span>
                                     );
                                   })}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 relative z-10 custom-scrollbar overflow-y-auto">
                               {isEditing ? (
                                 <textarea 
                                    autoFocus 
                                    value={p.transcription || ''} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      setActiveProject(prev => prev ? ({ ...prev, candidates: prev.candidates.map(c => c.id === currentReviewCandidate.id ? { ...c, pages: c.pages.map(pg => pg.id === p.id ? { ...pg, transcription: val } : pg) } : c) }) : null);
                                    }} 
                                    className="w-full h-full min-h-[350px] bg-indigo-700/40 text-white p-4 rounded-xl text-sm font-medium outline-none resize-none custom-scrollbar" 
                                 />
                               ) : (
                                 <div className="text-white">
                                   <LatexRenderer content={p.transcription || ""} className="text-base text-white font-medium leading-relaxed" />
                                   {(!p.transcription || p.transcription.trim() === "") && (
                                     <div className="py-10 text-center opacity-40 italic font-black uppercase text-[9px] tracking-widest">Tom side</div>
                                   )}
                                 </div>
                               )}
                            </div>
                         </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
