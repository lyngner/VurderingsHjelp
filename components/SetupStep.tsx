import React, { useMemo, useState, useEffect } from 'react';
import { Project, Page, Candidate } from '../types';
import { Spinner } from './SharedUI';

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
  handleRetryPage,
  updateActiveProject,
  onNavigateToCandidate
}) => {
  const [hasKey, setHasKey] = useState(true);
  const isAiWorking = rubricStatus.loading;
  const hasRubric = !!activeProject.rubric;

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
    const interval = setInterval(checkKey, 3000);
    return () => clearInterval(interval);
  }, []);

  const progressPercent = useMemo(() => {
    if (batchTotal === 0 && !isAiWorking) return 0;
    const safeTotal = Math.max(batchTotal, batchCompleted);
    const fileProgress = safeTotal > 0 ? (batchCompleted / safeTotal) * 100 : 0;
    
    if (isAiWorking) {
      if (safeTotal > 0 && batchCompleted >= safeTotal) return 98;
      if (safeTotal === 0) return 95;
    }
    return Math.min(100, Math.round(fileProgress));
  }, [batchTotal, batchCompleted, isAiWorking]);

  const stats = useMemo(() => {
    const candidates = activeProject?.candidates || [];
    const unprocessed = activeProject?.unprocessedPages || [];
    const hasQuotaError = unprocessed.some(p => p.statusLabel === 'Kvote brukt opp');
    
    return {
      totalCandidates: candidates.length,
      totalSider: candidates.reduce((acc, c) => acc + (c.pages?.length || 0), 0),
      processing: unprocessed.filter(p => p.status === 'processing').length,
      pending: unprocessed.filter(p => p.status === 'pending').length,
      errors: unprocessed.filter(p => p.status === 'error').length,
      hasQuotaError
    };
  }, [activeProject]);

  const handleConnectKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto h-full flex flex-col overflow-hidden">
      
      {!hasKey && (
        <div className="mb-6 bg-indigo-600 text-white p-4 rounded-3xl flex justify-between items-center animate-in slide-in-from-top-4 duration-500 shadow-xl border-4 border-white/10">
          <div className="flex items-center gap-4">
            <span className="text-2xl">🔑</span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest">API-tilkobling mangler</p>
              <p className="text-[10px] font-medium opacity-80">Du må velge en betalt API-nøkkel for å bruke Gemini 3 Pro-modellen.</p>
            </div>
          </div>
          <button 
            onClick={handleConnectKey}
            className="bg-white text-indigo-600 px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-colors"
          >
            Koble til nøkkel
          </button>
        </div>
      )}

      {stats.hasQuotaError && (
        <div className="mb-6 bg-rose-600 text-white p-6 rounded-[32px] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-in slide-in-from-top-4 duration-500 shadow-2xl border-b-4 border-rose-800/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-400/30"></div>
          <div className="flex items-start gap-5 relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl shrink-0">🚨</div>
            <div className="max-w-2xl">
              <p className="text-[13px] font-black uppercase tracking-wider leading-none mb-2">Tier 1 Begrensning (250 RPD)</p>
              <p className="text-[11px] font-medium opacity-95 leading-relaxed">
                Google rapporterer at du har nådd grensen på <strong>250 forespørsler per dag</strong> for Pro-modellen. Dette er normalt for nye betalende prosjekter (Tier 1). 
                <br /><br />
                <strong>Løsning:</strong> Appen i v5.8.0 bruker nå Flash-modellen til nesten alt arbeid for å spare kvoten din til den endelige karaktersettingen. Sørg for at <strong>"Pay-as-you-go"</strong> er aktiv i AI Studio Plan Management.
              </p>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto relative z-10">
            <a 
              href="https://aistudio.google.com/app/plan_management" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex-1 md:flex-none text-center bg-white text-rose-600 px-8 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] hover:bg-slate-50 transition-all hover:scale-105 shadow-xl ring-4 ring-rose-500/20"
            >
              Åpne Plan Management
            </a>
          </div>
        </div>
      )}

      {(batchTotal > 0 || isAiWorking) && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-end">
              <div>
                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${isAiWorking ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {isAiWorking ? (progressPercent >= 95 ? 'Finaliserer rettemanual...' : 'KI-Analyse') : 'Prosesserer filer'}
                </h4>
                <div className="flex items-center gap-3">
                  <p className="text-xl font-black text-slate-800">
                    {progressPercent}% <span className="text-slate-300 font-medium">({batchCompleted}/{Math.max(batchTotal, batchCompleted)})</span>
                  </p>
                  {currentAction && (
                    <span className="text-[11px] font-bold text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full animate-pulse border border-indigo-100/50">
                      {currentAction}
                    </span>
                  )}
                </div>
              </div>
              {(isAiWorking || (batchTotal > 0 && batchCompleted < batchTotal)) && (
                <div className="flex items-center gap-2 mb-1">
                  <Spinner size="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5 relative">
              <div 
                className={`h-full transition-all duration-700 ease-out rounded-full relative overflow-hidden ${isAiWorking ? 'bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}
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

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full overflow-hidden pb-10">
        
        <div className="md:col-span-4 bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20 shrink-0">
            <div>
              <h3 className="font-black text-[10px] uppercase text-indigo-600 tracking-[0.2em]">1. Oppgaver / prøver</h3>
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
            <div className="shrink-0">
               <div className="relative group h-40">
                 <input 
                   type="file" 
                   multiple 
                   accept=".pdf,.docx,.jpg,.jpeg,.png" 
                   onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} 
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                 />
                 <div className="border-2 border-dashed border-slate-100 rounded-[35px] h-full flex flex-col items-center justify-center p-6 text-center group-hover:border-emerald-200 transition-all bg-slate-50/30 group-hover:bg-emerald-50/20">
                   <div className="text-4xl mb-3">📥</div>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Last opp elevfiler</p>
                   <p className="text-[8px] font-bold text-slate-400 mt-2 uppercase tracking-widest">PDF, Word eller JPG (A3/A4)</p>
                 </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {!hasRubric && stats.pending > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
                   <span className="text-amber-500">⏳</span>
                   <p className="text-[10px] font-black uppercase text-amber-700 tracking-widest">Venter på rettemanual før transkribering starter...</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(activeProject?.unprocessedPages || []).map(p => (
                  <div key={p.id} className={`text-[11px] font-bold p-4 rounded-2xl border flex gap-4 items-center transition-all ${p.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : p.status === 'pending' && !hasRubric ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-indigo-50/50 border-indigo-100 text-indigo-700 shadow-sm'}`}>
                    <div className="shrink-0">
                      {p.status === 'processing' ? <Spinner size="w-3 h-3" color="text-indigo-600" /> : <div className={`w-3 h-3 rounded-full ${p.status === 'pending' ? 'bg-slate-200' : 'bg-indigo-200'}`}></div>}
                    </div>
                    <span className="truncate flex-1">{p.fileName}</span>
                    <span className={`text-[8px] font-black uppercase ${p.statusLabel === 'Kvote brukt opp' ? 'text-rose-600 font-black' : 'opacity-60'}`}>
                      {p.statusLabel || (p.status === 'processing' ? 'Analyserer' : p.status === 'error' ? 'Feil' : !hasRubric ? 'I kø' : 'Klar')}
                    </span>
                    {p.status === 'error' && <button onClick={() => handleRetryPage(p)} className="p-1 hover:bg-rose-100 rounded">↻</button>}
                  </div>
                ))}

                {(activeProject?.candidates || []).map(c => {
                  const isDigital = c.pages.some(p => p.isDigital);
                  const pageCount = c.pages.filter(p => !p.isDigital).length;
                  
                  return (
                    <button 
                      key={c.id} 
                      onClick={() => onNavigateToCandidate?.(c.id)}
                      className="group/card text-[11px] font-black bg-white p-4 rounded-2xl border border-slate-100 text-slate-700 flex flex-col gap-3 shadow-sm hover:border-indigo-600 hover:bg-indigo-50 transition-all text-left animate-in fade-in slide-in-from-bottom-2 duration-300"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="truncate flex items-center gap-3">
                          <span className="text-indigo-500 text-lg group-hover/card:scale-110 transition-transform">👤</span> 
                          <div>
                            <div className="truncate font-black text-slate-800">{c.name}</div>
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover/card:text-indigo-500">KLIKK FOR KONTROLL →</div>
                          </div>
                        </span>
                        <div className="flex items-center gap-2">
                           <div className="flex flex-col items-end gap-1">
                             <div className="flex gap-1">
                               {pageCount > 0 && (
                                 <span className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full uppercase">
                                   {pageCount} s
                                 </span>
                               )}
                               {isDigital && (
                                 <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">
                                   Digital
                                 </span>
                               )}
                             </div>
                           </div>
                           <span className="text-indigo-500 font-black">✓</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};