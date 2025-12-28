
import React, { useState, useEffect } from 'react';
import { Project, Candidate, Page } from '../types';
import { LatexRenderer } from './SharedUI';
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
  setActiveProject
}) => {
  
  // Hjelpefunksjon for å finne alle unike oppgaver en kandidat har besvart
  const getIdentifiedTasks = (candidate: Candidate) => {
    const tasks = new Set<string>();
    candidate.pages.forEach(p => {
      p.identifiedTasks?.forEach(t => tasks.add(t));
    });
    return Array.from(tasks).sort();
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#F1F5F9]">
      {/* Sidebar: Kandidatliste - NÅ MED UAVHENGIG SKROLLING */}
      <aside className="w-80 bg-white border-r flex flex-col shrink-0 no-print shadow-sm">
         <div className="p-6 border-b shrink-0 bg-white/80 backdrop-blur-md">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Besvarelser</h3>
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
         
         <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
           {filteredCandidates.map(c => {
             const tasks = getIdentifiedTasks(c);
             return (
               <button 
                 key={c.id} 
                 onClick={() => setSelectedReviewCandidateId(c.id)} 
                 className={`w-full text-left p-5 rounded-[25px] border transition-all relative overflow-hidden group ${selectedReviewCandidateId === c.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl scale-[1.02]' : 'bg-white hover:border-indigo-200'}`}
               >
                 <div className="flex justify-between items-start mb-2">
                   <div className="font-black text-[12px] truncate max-w-[150px]">{c.name}</div>
                   <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${selectedReviewCandidateId === c.id ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                     {c.pages.length} s
                   </div>
                 </div>
                 
                 {/* OPPGAVEOVERSIKT I SIDEBAR */}
                 <div className="flex flex-wrap gap-1 mt-3">
                   {tasks.length > 0 ? tasks.map(t => (
                     <span key={t} className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${selectedReviewCandidateId === c.id ? 'bg-white/10 text-white' : 'bg-indigo-50 text-indigo-400'}`}>
                       {t}
                     </span>
                   )) : (
                     <span className="text-[8px] font-bold opacity-40 uppercase">Ingen oppgaver detektert</span>
                   )}
                 </div>
               </button>
             );
           })}
         </div>
      </aside>

      {/* HOVEDOMRÅDE: SIDE-VED-SIDE VISNING PER SIDE */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
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
                {currentReviewCandidate.pages.sort((a,b) => (a.pageNumber || 0) - (b.pageNumber || 0)).map((p, idx) => (
                  <div key={p.id} className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start animate-in fade-in slide-in-from-bottom-6 duration-700">
                    
                    {/* VENSTRE: BILDET */}
                    <div className="space-y-4">
                       <div className="flex justify-between items-center px-4">
                         <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-black text-xs shadow-lg">
                             {p.pageNumber || idx + 1}
                           </div>
                           <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sidevisning</span>
                         </div>
                         <div className="flex gap-2">
                           <button onClick={() => rotatePage(p.id)} className="p-3 bg-white border rounded-xl hover:bg-slate-50 transition-all shadow-sm" title="Roter 90 grader">
                             ↻
                           </button>
                           <button onClick={() => { if(confirm('Slette side?')) deletePage(currentReviewCandidate.id, p.id); }} className="p-3 bg-white border rounded-xl hover:bg-rose-50 text-rose-400 transition-all shadow-sm" title="Slett side">
                             ✕
                           </button>
                         </div>
                       </div>
                       <LazyImage page={p} />
                    </div>

                    {/* HØYRE: EDITOR & RENDERING (Side-ved-side med bildet) */}
                    <div className="space-y-6">
                       <div className="flex items-center gap-3 px-4 h-10">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Transkripsjon & Korrektur</span>
                       </div>
                       
                       <div className="bg-white rounded-[35px] shadow-sm border border-slate-200 overflow-hidden">
                          <textarea 
                             value={p.transcription} 
                             onChange={e => {
                               const val = e.target.value;
                               setActiveProject(prev => prev ? ({ 
                                 ...prev, 
                                 candidates: prev.candidates.map(c => c.id === currentReviewCandidate.id ? { ...c, pages: c.pages.map(pg => pg.id === p.id ? { ...pg, transcription: val } : pg) } : c) 
                               }) : null);
                             }} 
                             className="w-full min-h-[350px] p-10 text-[15px] font-medium text-slate-700 outline-none resize-none leading-relaxed custom-scrollbar"
                             placeholder="Ingen tekst funnet på denne siden..."
                          />
                       </div>

                       {/* RENDERING UNDER EDITOREN FOR SAMME SIDE */}
                       <div className="bg-indigo-600 rounded-[35px] p-10 shadow-xl shadow-indigo-100">
                          <div className="flex justify-between items-center mb-6 border-b border-indigo-400/30 pb-4">
                            <span className="text-[9px] font-black uppercase text-indigo-100 tracking-widest">Matematisk forhåndsvisning (LaTeX)</span>
                            <div className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse"></div>
                          </div>
                          <LatexRenderer content={p.transcription || "*Ingen tekst å rendre*"} className="text-[16px] text-white font-medium" />
                       </div>
                    </div>

                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
