
import React, { useState, useEffect } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadFullRes = async () => {
      setIsLoading(true);
      const fullRes = await getMedia(page.id);
      if (isMounted && fullRes) setSrc(fullRes);
      setIsLoading(false);
    };
    loadFullRes();
    return () => { isMounted = false; };
  }, [page.id]);

  if (!src) return <div className="aspect-[1/1.41] w-full flex items-center justify-center bg-slate-100 rounded-2xl animate-pulse">Laster...</div>;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border shadow-sm group">
      <img 
        src={src} 
        style={{ transform: `rotate(${page.rotation || 0}deg)` }} 
        className={`w-full transition-all duration-300 ${isLoading ? 'opacity-50 blur-sm' : 'opacity-100'}`} 
      />
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
      p.identifiedTasks?.forEach(t => groups[groupKey].add(t));
    });
    return {
      del1: Array.from(groups["Del 1"]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})),
      del2: Array.from(groups["Del 2"]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}))
    };
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F1F5F9]">
      {/* SIDEBAR - UAVHENGIG SKROLL */}
      <aside className="w-80 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full">
         <div className="p-6 border-b shrink-0 bg-white/80 backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Besvarelser</h3>
               {handleSmartCleanup && (
                 <button 
                  onClick={handleSmartCleanup} 
                  disabled={isCleaning}
                  className="text-[9px] font-black uppercase text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-all flex items-center gap-2"
                  title="Kjør AI-avstemming for å finne feilplasserte sider og IDer"
                 >
                   {isCleaning ? <Spinner size="w-3 h-3" /> : '✨ Smart-avstemming'}
                 </button>
               )}
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-2 border">
              <input 
                type="text" 
                placeholder="Søk kandidat..." 
                className="bg-transparent border-none outline-none font-bold text-[11px] flex-1" 
                value={reviewFilter} 
                onChange={e => setReviewFilter(e.target.value)} 
              />
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/30">
           {filteredCandidates.map(c => {
             const { del1, del2 } = getGroupedTasks(c);
             const isSelected = selectedReviewCandidateId === c.id;
             return (
               <button 
                 key={c.id} 
                 onClick={() => setSelectedReviewCandidateId(c.id)} 
                 className={`w-full text-left p-5 rounded-[30px] border transition-all relative overflow-hidden group ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-xl scale-[1.02]' : 'bg-white hover:border-indigo-200'}`}
               >
                 <div className="flex justify-between items-start mb-3">
                   <div className="font-black text-[13px] truncate max-w-[150px]">{c.name}</div>
                   <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                     {c.pages.length} s
                   </div>
                 </div>
                 <div className="space-y-3 mt-4">
                   {del1.length > 0 && (
                     <div className="space-y-1.5">
                       <div className={`text-[8px] font-black uppercase tracking-widest ${isSelected ? 'text-indigo-300' : 'text-slate-400'}`}>Del 1</div>
                       <div className="flex flex-wrap gap-1">
                         {del1.map(t => (
                           <span key={t} className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${isSelected ? 'bg-white/10 text-white' : 'bg-indigo-50 text-indigo-500 border border-indigo-100'}`}>
                             {t}
                           </span>
                         ))}
                       </div>
                     </div>
                   )}
                   {del2.length > 0 && (
                     <div className="space-y-1.5">
                       <div className={`text-[8px] font-black uppercase tracking-widest ${isSelected ? 'text-emerald-300' : 'text-slate-400'}`}>Del 2</div>
                       <div className="flex flex-wrap gap-1">
                         {del2.map(t => (
                           <span key={t} className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${isSelected ? 'bg-white/10 text-white' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                             {t}
                           </span>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>
               </button>
             );
           })}
         </div>
      </aside>

      {/* HOVEDINNHOLD - UAVHENGIG SKROLL */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-8 h-full bg-[#F1F5F9]">
        <div className="max-w-[1600px] mx-auto space-y-12 pb-40">
          {!currentReviewCandidate ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-40">
              <div className="text-8xl mb-8 opacity-20">📂</div>
              <h2 className="text-xl font-black uppercase tracking-widest">Velg en kandidat</h2>
              <p className="text-sm font-bold opacity-50 mt-2">Kontroller transkripsjon og visuell beskjæring</p>
            </div>
          ) : (
            <>
              <header className="flex justify-between items-end mb-16">
                 <div>
                   <h2 className="text-5xl font-black text-slate-800 tracking-tighter">{currentReviewCandidate.name}</h2>
                   <div className="flex gap-4 mt-4">
                      <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full tracking-widest border border-indigo-100">
                         Full kontroll ({currentReviewCandidate.pages.length} sider)
                      </span>
                   </div>
                 </div>
              </header>

              <div className="space-y-16">
                {currentReviewCandidate.pages.sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)).map((p, idx) => {
                  const isEditing = editingPageIds.has(p.id);
                  return (
                    <div key={p.id} className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start animate-in fade-in slide-in-from-bottom-6 duration-700">
                      <div className="space-y-4">
                         <div className="flex justify-between items-center px-4">
                           <div className="flex items-center gap-3 max-w-[80%] overflow-hidden">
                             <div className="w-10 h-10 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-black text-xs shadow-lg shrink-0">
                               {p.pageNumber || idx + 1}
                             </div>
                             <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest truncate">
                               Sidevisning - {p.part || "Ukjent del"}
                             </span>
                           </div>
                           <div className="flex gap-2 shrink-0">
                             <button onClick={() => rotatePage(p.id)} title="Roter 90 grader" className="p-3 bg-white border rounded-xl hover:bg-slate-50 transition-all shadow-sm">↻</button>
                             <button onClick={() => { if(confirm('Slette side?')) deletePage(currentReviewCandidate.id, p.id); }} className="p-3 bg-white border rounded-xl hover:bg-rose-50 text-rose-400 transition-all shadow-sm">✕</button>
                           </div>
                         </div>
                         <LazyImage page={p} />
                      </div>
                      <div className="space-y-6">
                         <div className="flex items-center justify-between px-4 h-10">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{isEditing ? 'Redigeringsmodus' : 'Transkripsjon & Matematikk'}</span>
                            <button onClick={() => toggleEdit(p.id)} className={`text-[9px] font-black uppercase px-4 py-2 rounded-full border transition-all ${isEditing ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`}>
                              {isEditing ? 'Lagre & Vis ✓' : 'Rediger Tekst ✎'}
                            </button>
                         </div>
                         <div className="bg-indigo-600 rounded-[35px] p-10 shadow-xl shadow-indigo-100 min-h-[500px] flex flex-col relative overflow-hidden group">
                            <div className="absolute top-8 right-10 text-white/5 font-black text-6xl pointer-events-none uppercase">{p.part?.includes('2') ? 'Del 2' : 'Del 1'}</div>
                            <div className="flex justify-between items-center mb-8 border-b border-indigo-400/30 pb-4 relative z-10">
                              <div className="flex items-center gap-3">
                                 <div className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse"></div>
                                 <span className="text-[9px] font-black uppercase text-indigo-100 tracking-widest">Matematisk visning (LaTeX)</span>
                              </div>
                              {p.identifiedTasks && p.identifiedTasks.length > 0 && (
                                <div className="flex gap-1">
                                   {p.identifiedTasks.map(t => (<span key={t} className="text-[8px] font-black bg-white/10 text-white px-2 py-0.5 rounded uppercase">{t}</span>))}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 relative z-10">
                               {isEditing ? (
                                 <textarea 
                                    autoFocus
                                    value={p.transcription} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      setActiveProject(prev => prev ? ({ ...prev, candidates: prev.candidates.map(c => c.id === currentReviewCandidate.id ? { ...c, pages: c.pages.map(pg => pg.id === p.id ? { ...pg, transcription: val } : pg) } : c) }) : null);
                                    }} 
                                    className="w-full h-full min-h-[400px] bg-indigo-700/30 text-white p-6 rounded-2xl text-[15px] font-medium outline-none resize-none leading-relaxed custom-scrollbar border border-indigo-400/20"
                                 />
                               ) : (
                                 <LatexRenderer content={p.transcription || "*Ingen tekst funnet på denne siden*"} className="text-[17px] text-white font-medium leading-loose" />
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
