import React, { useMemo, useState } from 'react';
import { Project, Page } from '../types';
import { Spinner } from './SharedUI';
import { extractFolderId } from '../services/driveService';

interface SetupStepProps {
  activeProject: Project;
  isProcessing: boolean;
  batchTotal: number;
  batchCompleted: number;
  currentAction?: string;
  rubricStatus: { loading: boolean; text: string };
  handleTaskFileSelect: (files: FileList) => void;
  handleGenerateRubric: () => void;
  handleCandidateFileSelect: (files: FileList) => void;
  handleDriveImport?: (folderId: string) => void;
  handleRetryPage: (page: Page) => void;
  updateActiveProject: (updates: Partial<Project>) => void;
  onNavigateToCandidate?: (id: string) => void;
}

export const SetupStep: React.FC<SetupStepProps> = ({
  activeProject,
  isProcessing,
  batchTotal,
  batchCompleted,
  currentAction,
  rubricStatus,
  handleTaskFileSelect,
  handleGenerateRubric,
  handleCandidateFileSelect,
  handleDriveImport,
  handleRetryPage,
  updateActiveProject,
  onNavigateToCandidate
}) => {
  const [driveUrl, setDriveUrl] = useState('');
  const isAiWorking = rubricStatus.loading;
  const hasRubric = !!activeProject.rubric;

  const handleDriveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const folderId = extractFolderId(driveUrl);
    if (folderId && handleDriveImport) {
      handleDriveImport(folderId);
      setDriveUrl('');
    } else {
      alert("Ugyldig Google Drive-link. Sørg for at mappen er offentlig.");
    }
  };

  // Beregn progress mer intuitivt
  const progressPercent = useMemo(() => {
    if (batchTotal === 0 && !isAiWorking) return 0;
    
    const fileProgress = batchTotal > 0 ? (batchCompleted / batchTotal) * 100 : 0;
    
    // Hvis alle filer er prosessert, men KI-en jobber fortsatt med manualen, hold den på 98%
    if (fileProgress >= 100 && isAiWorking) {
      return 98;
    }
    
    return Math.min(100, Math.round(fileProgress));
  }, [batchTotal, batchCompleted, isAiWorking]);

  const stats = useMemo(() => {
    const candidates = activeProject?.candidates || [];
    const unprocessed = activeProject?.unprocessedPages || [];
    return {
      totalCandidates: candidates.length,
      totalSider: candidates.reduce((acc, c) => acc + (c.pages?.length || 0), 0),
      processing: unprocessed.filter(p => p.status === 'processing').length,
      pending: unprocessed.filter(p => p.status === 'pending').length,
      errors: unprocessed.filter(p => p.status === 'error').length
    };
  }, [activeProject]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto h-full flex flex-col overflow-hidden">
      
      {(batchTotal > 0 || isAiWorking) && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-end">
              <div>
                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${isAiWorking ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {isAiWorking ? (progressPercent >= 98 ? 'Finaliserer rettemanual...' : 'KI-Analyse') : 'Prosesserer filer'}
                </h4>
                <div className="flex items-center gap-3">
                  <p className="text-xl font-black text-slate-800">
                    {progressPercent}% <span className="text-slate-300 font-medium">({batchCompleted}/{batchTotal})</span>
                  </p>
                  {currentAction && (
                    <span className="text-[11px] font-bold text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full animate-pulse border border-indigo-100/50">
                      {currentAction}
                    </span>
                  )}
                </div>
              </div>
              {(isAiWorking || batchCompleted < batchTotal) && (
                <div className="flex items-center gap-2 mb-1">
                  <Spinner size="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5 relative">
              <div 
                className={`h-full transition-all duration-1000 ease-out rounded-full relative overflow-hidden ${isAiWorking ? 'bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}
                style={{ width: `${progressPercent}%` }}
              >
                {isAiWorking && (
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress-bar-stripes_1s_linear_infinite]"></div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progress-bar-stripes {
          from { background-position: 20px 0; }
          to { background-position: 0 0; }
        }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full overflow-hidden pb-10">
        
        {/* KOLONNE 1: OPPGAVE / FASIT */}
        <div className="md:col-span-4 bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20 shrink-0">
            <div>
              <h3 className="font-black text-[10px] uppercase text-indigo-600 tracking-[0.2em]">1. Oppgave / Fasit</h3>
            </div>
            {(activeProject?.taskFiles?.length || 0) > 0 && (
              <button onClick={() => updateActiveProject({ taskFiles: [], rubric: null })} className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors">Tøm ✕</button>
            )}
          </div>

          <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="relative group h-24 shrink-0">
              <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-3xl h-full flex flex-col items-center justify-center p-2 text-center group-hover:border-indigo-200 transition-all bg-slate-50/30">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">+ Last opp oppgave</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {hasRubric && (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                  <span className="text-emerald-500 text-xl">✅</span>
                  <div>
                    <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Fasit Klar</div>
                    <div className="text-[11px] font-bold text-emerald-800 truncate max-w-[180px]">{activeProject.rubric?.title}</div>
                  </div>
                </div>
              )}
              {(activeProject?.taskFiles || []).map(f => (
                <div key={f.id} className="text-[11px] font-bold bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                  <span className="truncate flex-1 pr-3 text-slate-600">📄 {f.fileName}</span>
                  <span className="text-emerald-500 font-black opacity-40">✓</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* KOLONNE 2: ELEVBESVARELSER */}
        <div className="md:col-span-8 bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20 shrink-0">
            <div className="flex flex-col">
              <h3 className="font-black text-[10px] uppercase text-emerald-600 tracking-[0.2em]">2. Elevbesvarelser</h3>
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                  <div className="text-sm font-black text-slate-800 leading-none">{stats.totalCandidates}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Elever</div>
              </div>
              <div className="text-center border-l border-slate-100 pl-6">
                  <div className="text-sm font-black text-emerald-600 leading-none">{stats.totalSider}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Sider</div>
              </div>
            </div>
          </div>

          <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
               <div className="relative group h-32">
                 <input 
                   type="file" 
                   multiple 
                   accept=".pdf,.docx,.jpg,.jpeg,.png" 
                   onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} 
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                 />
                 <div className="border-2 border-dashed border-slate-100 rounded-[35px] h-full flex flex-col items-center justify-center p-4 text-center group-hover:border-emerald-200 transition-all bg-slate-50/30 group-hover:bg-emerald-50/20">
                   <div className="text-2xl mb-2">📥</div>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em]">Slipp filer eller klikk</p>
                 </div>
               </div>

               <div className="bg-slate-50 rounded-[35px] p-6 border border-slate-100 flex flex-col justify-center">
                  <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">Google Drive Import</h4>
                  <form onSubmit={handleDriveSubmit} className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Lim inn mappe-link..." 
                      className="flex-1 bg-white border border-slate-100 p-3 rounded-2xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      value={driveUrl}
                      onChange={e => setDriveUrl(e.target.value)}
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-2xl font-black text-[9px] uppercase hover:bg-indigo-700 transition-all">Koble til</button>
                  </form>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {!hasRubric && stats.pending > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
                   <span className="text-amber-500">⏳</span>
                   <p className="text-[10px] font-black uppercase text-amber-700 tracking-widest">Venter på fasit før analyse starter...</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Prosesserende filer */}
                {(activeProject?.unprocessedPages || []).map(p => (
                  <div key={p.id} className={`text-[11px] font-bold p-4 rounded-2xl border flex gap-4 items-center transition-all ${p.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : p.status === 'pending' && !hasRubric ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-indigo-50/50 border-indigo-100 text-indigo-700 shadow-sm'}`}>
                    <div className="shrink-0">
                      {p.status === 'processing' ? <Spinner size="w-3 h-3" color="text-indigo-600" /> : <div className={`w-3 h-3 rounded-full ${p.status === 'pending' ? 'bg-slate-200' : 'bg-indigo-200'}`}></div>}
                    </div>
                    <span className="truncate flex-1">{p.fileName}</span>
                    <span className="text-[8px] font-black uppercase opacity-60">
                      {p.status === 'processing' ? 'Analyserer' : p.status === 'error' ? 'Feil' : !hasRubric ? 'I kø' : 'Klar'}
                    </span>
                    {p.status === 'error' && <button onClick={() => handleRetryPage(p)} className="p-1 hover:bg-rose-100 rounded">↻</button>}
                  </div>
                ))}

                {/* Ferdige kandidat-kort */}
                {(activeProject?.candidates || []).map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => onNavigateToCandidate?.(c.id)}
                    className="group/card text-[11px] font-black bg-white p-4 rounded-2xl border border-slate-100 text-slate-700 flex justify-between items-center shadow-sm hover:border-indigo-600 hover:bg-indigo-50 transition-all text-left animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <span className="truncate flex items-center gap-3">
                      <span className="text-indigo-500 text-lg group-hover/card:scale-110 transition-transform">👤</span> 
                      <div>
                        <div className="truncate font-black text-slate-800">{c.name}</div>
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover/card:text-indigo-500">KLIKK FOR KONTROLL →</div>
                      </div>
                    </span>
                    <div className="flex items-center gap-2">
                       <span className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full uppercase">{c.pages.length} s</span>
                       <span className="text-indigo-500 font-black">✓</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
