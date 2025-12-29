
import React, { useState, useEffect, useMemo } from 'react';
import { Project, Candidate, Page } from '../types';
import { LatexRenderer, Spinner } from './SharedUI';
import { getMedia } from '../services/storageService';

interface ReviewStepProps {
  activeProject: Project;
  selectedReviewCandidateId: string | null;
  setSelectedReviewCandidateId: (id: string) => void;
  reviewFilter: string;
  setReviewFilter: (filter: string) => void;
  filteredCandidates: Candidate[];
  currentReviewCandidate: Candidate | null;
  rotatePage: (pageId: string) => void;
  deletePage: (candidateId: string, pageId: string) => void;
  updatePageNumber: (candidateId: string, pageId: string, newNum: number) => void;
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>;
  handleSmartCleanup?: () => void;
  isCleaning?: boolean;
}

const LazyImage: React.FC<{ page: Page }> = ({ page }) => {
  const [src, setSrc] = useState<string | null>(page.imagePreview || null);
  const [isFullRes, setIsFullRes] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsFullRes(false);
    setError(false);

    const loadFullRes = async () => {
      try {
        const fullRes = await getMedia(page.id);
        if (isMounted && fullRes) {
          setSrc(fullRes);
          setIsFullRes(true);
        }
      } catch (e) {
        console.error("Feil ved lasting av høyoppløselig bilde", e);
        if (isMounted) setError(true);
      }
    };

    loadFullRes();
    return () => { isMounted = false; };
  }, [page.id]);

  if (!src && !error) return <div className="aspect-[1/1.41] w-full flex items-center justify-center bg-slate-100 rounded-2xl animate-pulse text-slate-400 font-black uppercase text-[10px]">Laster bilde...</div>;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 shadow-md group bg-white">
      {/* HD Indikator */}
      <div className={`absolute top-4 right-4 z-10 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all duration-500 ${isFullRes ? 'bg-emerald-500 text-white opacity-100' : 'bg-slate-200 text-slate-500 opacity-50'}`}>
        {isFullRes ? 'HD ✓' : 'Laster HD...'}
      </div>

      <img 
        src={src || ""} 
        style={{ transform: `rotate(${page.rotation || 0}deg)` }} 
        className={`w-full transition-all duration-300 object-contain ${isFullRes ? 'opacity-100 scale-100' : 'opacity-80 scale-[0.99] filter contrast-125'}`} 
      />
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-50/90 text-rose-500 p-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest">Kunne ikke laste originalbilde. Viser forhåndsvisning.</p>
        </div>
      )}
      
      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/5 transition-all pointer-events-none"></div>
    </div>
  );
};

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
          // Normaliserer ukjente varianter i visningen
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
      <aside className="w-80 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full">
         <div className="p-6 border-b shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Besvarelser</h3>
               {handleSmartCleanup && (
                 <button onClick={handleSmartCleanup} disabled={isCleaning} className="text-[9px] font-black uppercase text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-all flex items-center gap-2">
                   {isCleaning ? <Spinner size="w-3 h-3" /> : '✨ Smart-avstemming'}
                 </button>
               )}
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-2 border">
                <input type="text" placeholder="Søk kandidat..." className="bg-transparent border-none outline-none font-bold text-[11px] flex-1" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)} />
              </div>

              {allUniqueTasks.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.1em] px-1 flex justify-between">
                    <span>Filtrer oppgave:</span>
                    {taskFilter && <button onClick={() => setTaskFilter(null)} className="text-rose-500 hover:underline">Nullstill</button>}
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 custom-scrollbar">
                    {allUniqueTasks.map(t => {
                      const isUnknown = t.toLowerCase().includes('ukjent');
                      return (
                        <button 
                          key={t}
                          onClick={() => setTaskFilter(t === taskFilter ? null : t)}
                          className={`text-[9px] font-black uppercase px-2.5 py-1.5 rounded-xl border transition-all ${taskFilter === t ? 'bg-slate-800 text-white border-slate-800 shadow-md' : isUnknown ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-white text-slate-500 hover:border-indigo-300'}`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/30">
           {finalCandidates.length === 0 ? (
             <div className="py-20 text-center opacity-30 italic text-[11px] font-bold uppercase tracking-widest text-slate-400">Ingen treff</div>
           ) : (
             finalCandidates.map(c => {
               const { del1, del2 } = getGroupedTasks(c);
               const isSelected = selectedReviewCandidateId === c.id;
               const isUnknown = c.name.toLowerCase().includes('ukjent');
               return (
                 <button key={c.id} onClick={() => setSelectedReviewCandidateId(c.id)} className={`w-full text-left p-5 rounded-[35px] border transition-all relative overflow-hidden group ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-xl scale-[1.02]' : isUnknown ? 'bg-rose-50/30 border-rose-100 hover:border-rose-300' : 'bg-white hover:border-indigo-200'}`}>
                   <div className="flex justify-between items-start mb-3">
                     <div className={`font-black text-[13px] truncate max-w-[150px] ${isUnknown && !isSelected ? 'text-rose-600' : ''}`}>{c.name || 'Ukjent'}</div>
                     <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>{c.pages.length} s</div>
                   </div>
                   <div className="space-y-4 mt-4">
                     {(del1.length > 0 || del2.length > 0) ? (
                       <div className="flex flex-col gap-2">
                         {del1.length > 0 && (
                           <div className="flex flex-wrap gap-1">
                             {del1.map(t => (<span key={t} className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${isSelected ? 'bg-indigo-500/30 text-white' : 'bg-indigo-50 text-indigo-500 border border-indigo-100/50'}`}>{t}</span>))}
                           </div>
                         )}
                         {del2.length > 0 && (
                           <div className="flex flex-wrap gap-1">
                             {del2.map(t => (<span key={t} className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${isSelected ? 'bg-emerald-500/30 text-white' : 'bg-emerald-50 text-emerald-600 border border-emerald-100/50'}`}>{t}</span>))}
                           </div>
                         )}
                       </div>
                     ) : (
                       <div className="text-[7px] font-black uppercase opacity-20 italic">Ingen oppgaver detektert</div>
                     )}
                   </div>
                 </button>
               );
             })
           )}
         </div>
      </aside>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-8 h-full bg-[#F1F5F9]">
        <div className="max-w-[1600px] mx-auto space-y-12 pb-40">
          {!currentReviewCandidate ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-40">
              <div className="text-9xl mb-12 opacity-10">📄</div>
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-400">Velg en kandidat fra listen</h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4 opacity-50">Analysert med Gemini 3 Pro</p>
            </div>
          ) : (
            <>
              <header className="flex justify-between items-end mb-16 animate-in fade-in slide-in-from-top-4 duration-500">
                 <div>
                   <h2 className="text-5xl font-black text-slate-800 tracking-tighter">{currentReviewCandidate.name || 'Ukjent'}</h2>
                   <p className="text-[11px] font-black uppercase text-indigo-500 tracking-[0.3em] mt-3">Kontrollerer transkripsjon & oppgavekobling</p>
                 </div>
              </header>

              <div className="space-y-20">
                {currentReviewCandidate.pages.sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)).map((p, idx) => {
                  const isEditing = editingPageIds.has(p.id);
                  return (
                    <div key={p.id} className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start animate-in fade-in slide-in-from-bottom-6 duration-700">
                      <div className="space-y-6">
                         <div className="flex justify-between items-center px-4">
                           <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-[20px] bg-slate-800 text-white flex items-center justify-center font-black text-sm shadow-xl shrink-0">{p.pageNumber || idx + 1}</div>
                             <div className="flex flex-col">
                               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sidevisning</span>
                               <span className="text-[12px] font-black text-slate-800 uppercase">{p.part || "Ukjent Del"}</span>
                             </div>
                           </div>
                           <div className="flex gap-3">
                             <button onClick={() => rotatePage(p.id)} title="Roter 90 grader" className="w-12 h-12 flex items-center justify-center bg-white border rounded-[18px] hover:bg-slate-50 transition-all shadow-sm">↻</button>
                             <button onClick={() => { if(confirm('Slette side?')) deletePage(currentReviewCandidate.id, p.id); }} title="Slett side" className="w-12 h-12 flex items-center justify-center bg-white border rounded-[18px] hover:bg-rose-50 text-rose-400 transition-all shadow-sm">✕</button>
                           </div>
                         </div>
                         <LazyImage page={p} />
                      </div>
                      <div className="space-y-6">
                         <div className="flex items-center justify-between px-4 h-12">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Transkripsjon & Oppgave-ID</span>
                            <button onClick={() => toggleEdit(p.id)} className={`text-[10px] font-black uppercase px-6 py-3 rounded-full border transition-all ${isEditing ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50 shadow-sm'}`}>
                              {isEditing ? 'Lagre Endringer ✓' : 'Rediger Tekst ✎'}
                            </button>
                         </div>
                         <div className="bg-indigo-600 rounded-[45px] p-12 shadow-2xl min-h-[600px] flex flex-col relative overflow-hidden group/trans">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover/trans:scale-110"></div>
                            <div className="flex justify-between items-center mb-10 border-b border-indigo-400/40 pb-6 relative z-10">
                              <span className="text-[10px] font-black uppercase text-indigo-100 tracking-[0.2em]">Matematikk (LaTeX)</span>
                              {p.identifiedTasks && p.identifiedTasks.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-1.5 max-w-[60%]">
                                   {p.identifiedTasks.map(t => {
                                     const cleanSub = (t.subTask || "").toUpperCase().includes('UKJENT') ? 'UKJENT' : t.subTask || "";
                                     const label = `${t.taskNumber || ''}${cleanSub}`;
                                     if (!label) return null;
                                     const isUnknown = label.toLowerCase().includes('ukjent');
                                     return (
                                       <span key={label} className={`text-[9px] font-black px-3 py-1.5 rounded-xl uppercase shadow-sm ${isUnknown ? 'bg-rose-500 text-white' : 'bg-white/20 text-white'}`}>
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
                                    className="w-full h-full min-h-[500px] bg-indigo-700/40 text-white p-8 rounded-3xl text-[16px] font-medium outline-none resize-none custom-scrollbar border border-indigo-400/30 focus:ring-4 ring-white/10" 
                                 />
                               ) : (
                                 <div className="text-white">
                                   <LatexRenderer content={p.transcription || ""} className="text-[18px] text-white font-medium leading-[1.8]" />
                                   {(!p.transcription || p.transcription.trim() === "") && (
                                     <div className="py-20 text-center opacity-40 italic font-black uppercase text-[10px] tracking-widest">Ingen tekst detektert</div>
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
