
import React, { useRef, useState } from 'react';
import { Project, Candidate, Page } from '../types';
import { LatexRenderer } from './SharedUI';

interface ReviewStepProps {
  activeProject: Project;
  selectedReviewCandidateId: string | null;
  setSelectedReviewCandidateId: (id: string) => void;
  reviewFilter: string;
  setReviewFilter: (filter: string) => void;
  filteredCandidates: Candidate[];
  currentReviewCandidate: Candidate | null;
  rotatePage: (pageId: string) => void;
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>;
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
  setActiveProject
}) => {
  const [editorWidth, setEditorWidth] = useState(500);
  const isResizing = useRef(false);

  const startResizing = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < window.innerWidth * 0.7) {
      setEditorWidth(newWidth);
    }
  };

  const stopResizing = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: Kandidatliste */}
      <aside className="w-80 bg-white border-r flex flex-col shrink-0 no-print">
         <div className="p-6 border-b"><div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-2 border"><input type="text" placeholder="Søk..." className="bg-transparent border-none outline-none font-bold text-[11px] flex-1" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)} /></div></div>
         <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
           {filteredCandidates.map(c => (
             <button key={c.id} onClick={() => setSelectedReviewCandidateId(c.id)} className={`w-full text-left p-4 rounded-2xl border transition-all flex justify-between items-center ${selectedReviewCandidateId === c.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white hover:border-indigo-200'}`}>
               <div className="truncate"><span className="font-black text-[11px] block">{c.name}</span><span className="text-[8px] font-bold uppercase tracking-widest opacity-60">{(c.pages || []).length} Sider</span></div>
               {selectedReviewCandidateId === c.id && <span className="text-white text-[10px]">▶</span>}
             </button>
           ))}
         </div>
      </aside>

      <div className="flex-1 flex overflow-hidden">
        {/* Midten: Bildevisning */}
        <section className="flex-1 bg-slate-50 overflow-y-auto p-6 custom-scrollbar relative">
          <div className="max-w-4xl mx-auto space-y-8 pb-20">
            {currentReviewCandidate ? currentReviewCandidate.pages.map((p, idx) => (
              <div key={p.id} className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden relative group transition-all hover:shadow-md">
                <div className="px-10 py-6 bg-white flex justify-between items-center sticky top-0 z-10 bg-white/90 backdrop-blur-sm">
                  <div className="flex flex-col">
                     <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Side</span>
                     <span className="text-3xl font-black text-slate-800 leading-none">{idx + 1}</span>
                  </div>
                  <button onClick={() => rotatePage(p.id)} className="bg-indigo-50 text-indigo-600 px-6 py-3 rounded-full font-black text-[11px] uppercase tracking-widest shadow-sm hover:bg-indigo-600 hover:text-white transition-all active:scale-95">Roter 90° ↻</button>
                </div>
                <div className="px-10 pb-10 flex items-center justify-center bg-white min-h-[500px]">
                  {p.imagePreview ? (
                    <div className="relative w-full flex justify-center">
                      <img src={p.imagePreview} style={{ transform: `rotate(${p.rotation || 0}deg)`, maxHeight: '80vh' }} className="max-w-full rounded-2xl shadow-xl border border-slate-100 transition-transform duration-300" />
                    </div>
                  ) : <div className="text-slate-300 font-black uppercase tracking-widest text-[11px] py-40 border-4 border-dashed rounded-3xl w-full text-center">Digitalt dokument</div>}
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 py-40">
                <div className="text-6xl mb-6">📄</div>
                <p className="font-black uppercase tracking-widest text-[11px]">Velg en kandidat fra listen</p>
              </div>
            )}
          </div>
        </section>

        <div onMouseDown={startResizing} className="w-1.5 bg-slate-200 hover:bg-indigo-400 cursor-col-resize transition-colors shrink-0 group flex items-center justify-center">
          <div className="w-1 h-8 bg-slate-300 rounded-full group-hover:bg-white"></div>
        </div>

        {/* Høyre: Editor */}
        <aside className="bg-white border-l overflow-y-auto p-10 custom-scrollbar shrink-0 no-print" style={{ width: `${editorWidth}px` }}>
          {currentReviewCandidate ? (
            <div className="space-y-16 pb-40">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter">{currentReviewCandidate.name}</h2>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">Transkripsjon & Korrektur</p>
                </div>
                <span className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full font-black text-[10px] uppercase">Lese-modus</span>
              </div>
              {currentReviewCandidate.pages.map((p, idx) => (
                <div key={p.id} className="space-y-6 animate-in fade-in duration-500">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-black text-[11px]">{idx + 1}</div>
                     <span className="text-[11px] font-black uppercase text-slate-500 tracking-widest">Side {idx + 1}</span>
                   </div>
                   <textarea 
                     value={p.transcription} 
                     onChange={e => {
                       const val = e.target.value;
                       setActiveProject(prev => prev ? ({ 
                         ...prev, 
                         candidates: prev.candidates.map(c => c.id === currentReviewCandidate.id ? { ...c, pages: c.pages.map(pg => pg.id === p.id ? { ...pg, transcription: val } : pg) } : c) 
                       }) : null);
                     }} 
                     className="w-full min-h-[250px] bg-slate-50 border border-slate-200 rounded-[35px] p-8 text-[14px] font-medium text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-inner resize-none leading-relaxed"
                     placeholder="Ingen tekst funnet..."
                   />
                   <div className="p-8 bg-indigo-50/20 border border-indigo-50 rounded-[35px]">
                      <span className="text-[9px] font-black uppercase text-indigo-300 tracking-widest block mb-4">Matematisk Rendring</span>
                      <LatexRenderer content={p.transcription || ""} className="text-[14px] text-slate-800" />
                   </div>
                </div>
              ))}
            </div>
          ) : <div className="h-full flex items-center justify-center text-slate-200"><p className="text-[10px] font-black uppercase tracking-widest">Editor</p></div>}
        </aside>
      </div>
    </div>
  );
};
