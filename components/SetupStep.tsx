
import React, { useMemo, useState, useEffect } from 'react';
import { Project, Page, Candidate } from '../types';
import { Spinner } from './SharedUI';

interface SetupStepProps {
  activeProject: Project;
  isProcessing: boolean;
  batchTotal: number;
  batchCompleted: number;
  currentAction?: string;
  activePageId: string | null;
  rubricStatus: { loading: boolean; text: string; errorType?: 'PRO_QUOTA' | 'GENERIC' };
  useFlashFallback?: boolean;
  setUseFlashFallback?: (val: boolean) => void;
  etaSeconds?: number | null; // v7.9.28
  handleTaskFileSelect: (files: FileList) => void;
  handleGenerateRubric: () => void;
  handleCandidateFileSelect: (files: FileList) => void;
  handleRetryPage: (page: Page) => void;
  updateActiveProject: (updates: Partial<Project>) => void;
  onNavigateToCandidate?: (id: string) => void;
  handleSkipFile?: () => void; // v7.9.33: New Prop
}

export const SetupStep: React.FC<SetupStepProps> = ({
  activeProject,
  isProcessing,
  batchTotal,
  batchCompleted,
  currentAction,
  activePageId,
  rubricStatus,
  useFlashFallback,
  setUseFlashFallback,
  etaSeconds,
  handleTaskFileSelect,
  handleGenerateRubric,
  handleCandidateFileSelect,
  handleRetryPage,
  updateActiveProject,
  onNavigateToCandidate,
  handleSkipFile
}) => {
  const hasRubric = !!activeProject.rubric;
  const isProQuotaError = rubricStatus.errorType === 'PRO_QUOTA';
  const [simulatedProgress, setSimulatedProgress] = useState(0);

  // Simulert fremdrift for enkelt-operasjoner som tar tid (som Rubric Generation)
  useEffect(() => {
    let interval: any;
    if (rubricStatus.loading) {
      setSimulatedProgress(5);
      interval = setInterval(() => {
        setSimulatedProgress(prev => {
          if (prev >= 95) return prev;
          const remaining = 95 - prev;
          const jump = Math.max(0.2, remaining * 0.05); 
          return prev + jump;
        });
      }, 150);
    } else {
      setSimulatedProgress(100);
      const timeout = setTimeout(() => setSimulatedProgress(0), 800);
      return () => clearTimeout(timeout);
    }
    return () => clearInterval(interval);
  }, [rubricStatus.loading]);

  const handleFlashFailover = () => {
    if (setUseFlashFallback) {
      setUseFlashFallback(true);
      setTimeout(() => handleGenerateRubric(), 0);
    }
  };

  const handleDeleteTaskFile = (id: string) => {
    if (confirm("Vil du fjerne denne oppgavefilen?")) {
      updateActiveProject({
        taskFiles: activeProject.taskFiles.filter(f => f.id !== id),
        rubric: null
      });
    }
  };

  // Helper for å sjekke om kandidaten er komplett (klar til vurdering)
  // FIX v7.9.31: Nå parts-aware (Del 1 vs Del 2) for å unngå falske positiver ved overlappende oppgavenummer
  const getCompletionStatus = (candidate: Candidate) => {
    if (!activeProject.rubric) return { isComplete: false };
    
    // Bygg unike nøkler: "PART-TASK"
    const rubricTasks = new Set<string>();
    activeProject.rubric.criteria.forEach(c => {
      const part = (c.part || "Del 1").toLowerCase().includes("2") ? "2" : "1";
      const label = `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
      rubricTasks.add(`${part}-${label}`);
    });

    const foundTasks = new Set<string>();
    candidate.pages.forEach(p => {
      const part = (p.part || "Del 1").toLowerCase().includes("2") ? "2" : "1";
      p.identifiedTasks?.forEach(t => {
        if (t.taskNumber) {
          const label = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const key = `${part}-${label}`;
          if (rubricTasks.has(key)) foundTasks.add(key);
        }
      });
    });

    // Krav: Alle oppgaver i rubric må finnes i foundTasks
    const isComplete = rubricTasks.size > 0 && Array.from(rubricTasks).every(t => foundTasks.has(t));
    return { isComplete };
  };

  const getCandidateTaskSummary = (candidate: Candidate) => {
    const validTaskStrings = new Set(activeProject.rubric?.criteria.map(c => 
      `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
    ) || []);
    
    const shouldFilter = validTaskStrings.size > 0;

    const tasks = new Set<string>();
    candidate.pages.forEach(p => {
      p.identifiedTasks?.forEach(t => {
        if (t.taskNumber) {
          const rawLabel = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (shouldFilter && !validTaskStrings.has(rawLabel)) {
             return; 
          }
          const part = (p.part || "Del 1").toLowerCase().includes("2") ? "2" : "1";
          tasks.add(`${part}:${t.taskNumber}${t.subTask || ''}`);
        }
      });
    });
    
    return Array.from(tasks).sort((a,b) => {
      const [partA, labelA] = a.split(':');
      const [partB, labelB] = b.split(':');
      if (partA !== partB) return partA.localeCompare(partB);
      return labelA.localeCompare(labelB, undefined, {numeric: true});
    }).map(t => {
      const [part, label] = t.split(':');
      return { part, label };
    });
  };

  const stats = useMemo(() => {
    const candidates = activeProject?.candidates || [];
    const unprocessed = activeProject?.unprocessedPages || [];
    const allPages = [...candidates.flatMap(c => c.pages), ...unprocessed];
    const totalCandidates = candidates.length;
    const totalPages = allPages.length;
    const pending = unprocessed.filter(p => p.status === 'pending').length;
    const digitalCount = allPages.filter(p => p.mimeType === 'text/plain').length;
    const handwrittenCount = totalPages - digitalCount;

    return { totalCandidates, totalPages, pending, digitalCount, handwrittenCount };
  }, [activeProject]);

  const displayProgress = useMemo(() => {
    if (batchTotal > 0) return (batchCompleted / batchTotal) * 100;
    else if (rubricStatus.loading) return simulatedProgress;
    return 0;
  }, [batchTotal, batchCompleted, rubricStatus.loading, simulatedProgress]);

  const sortedCandidates = useMemo(() => {
    // Sorterer kandidater alfabetisk, med "Ukjent" til slutt (v7.9.5)
    return [...activeProject.candidates].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aIsUnknown = aName.includes("ukjent");
      const bIsUnknown = bName.includes("ukjent");
      if (aIsUnknown && !bIsUnknown) return 1;
      if (!aIsUnknown && bIsUnknown) return -1;
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeProject.candidates]);

  // v7.9.19: Dynamisk sortering av køen (Aktiv -> Ventende -> Feil)
  const sortedUnprocessedPages = useMemo(() => {
    const list = activeProject.unprocessedPages || [];
    return [...list].sort((a, b) => {
      // 1. Aktiv side øverst
      if (a.id === activePageId) return -1;
      if (b.id === activePageId) return 1;
      
      // 2. Pending sider (køen) nest
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      
      // 3. Resten (error, completed) til slutt
      return 0;
    });
  }, [activeProject.unprocessedPages, activePageId]);

  const activeModelName = useFlashFallback ? 'Gemini 3 Flash' : 'Gemini 3 Pro';

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `Ca. ${seconds} sekunder igjen`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `Ca. ${mins} min ${secs} sek igjen`;
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto h-full flex flex-col overflow-hidden">
      
      {isProQuotaError && (
        <div className="mb-6 bg-rose-600 text-white p-6 rounded-[32px] shadow-2xl border-b-4 border-rose-800 animate-in slide-in-from-top-4 duration-500 relative overflow-hidden shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">⚠️</div>
              <div>
                <p className="text-[13px] font-black uppercase tracking-wider mb-1">Dagsgrense for Pro er nådd</p>
                <p className="text-[11px] font-medium opacity-90 max-w-xl">
                  Du har brukt opp dagens kvote for Gemini Pro. Vil du fortsette med **Gemini Flash** i stedet? 
                  Flash er raskere og har ubegrenset kvote.
                </p>
              </div>
            </div>
            <button onClick={handleFlashFailover} className="bg-white text-rose-600 px-8 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-xl whitespace-nowrap active:scale-95">
              Bruk Flash i stedet ⚡
            </button>
          </div>
        </div>
      )}

      {rubricStatus.errorType === 'GENERIC' && !isProcessing && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-[32px] shadow-lg animate-in slide-in-from-top-4 duration-500 flex justify-between items-center gap-4">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl">⚠️</div>
               <div>
                 <p className="text-[11px] font-black uppercase tracking-wider mb-1">Kunne ikke generere rettemanual</p>
                 <p className="text-[10px] font-medium opacity-80">{rubricStatus.text || "Ukjent feil oppstod. Prøv igjen."}</p>
               </div>
            </div>
            <button onClick={() => handleGenerateRubric()} className="bg-white text-amber-700 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 transition-all shadow-sm whitespace-nowrap">
              Prøv på nytt ↻
            </button>
        </div>
      )}

      {useFlashFallback && !isProQuotaError && (
        <div className="mb-6 bg-emerald-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 animate-in fade-in duration-500 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest">⚡ Flash-modus Aktiv (Ubegrenset kvote)</span>
          <button onClick={() => setUseFlashFallback?.(false)} className="text-[10px] underline opacity-70 hover:opacity-100">Bytt tilbake til Pro</button>
        </div>
      )}

      {(batchTotal > 0 || rubricStatus.loading) && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500 shrink-0">
          <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-xl">
            <div className="flex justify-between items-end mb-2">
               <div className="flex flex-col">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                   {rubricStatus.loading ? rubricStatus.text : (currentAction || 'Prosesserer filer...')}
                 </h4>
                 {rubricStatus.loading && (
                   <span className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                     Motor: {activeModelName}
                   </span>
                 )}
               </div>
               <div className="text-right">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                   {batchTotal > 0 ? `Side ${batchCompleted} av ${batchTotal} i kø` : `${Math.round(displayProgress)}%`}
                 </span>
                 {etaSeconds !== null && etaSeconds !== undefined && batchTotal > 0 && (
                   <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest animate-pulse">
                     {formatEta(etaSeconds)}
                   </span>
                 )}
               </div>
            </div>
            <div className="h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
              <div 
                className={`h-full transition-all duration-300 rounded-full ${rubricStatus.loading ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                style={{ width: `${displayProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full overflow-hidden pb-10">
        <div className="md:col-span-4 bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-8 border-b bg-slate-50/20 shrink-0">
             <h3 className="font-black text-[10px] uppercase text-indigo-600 tracking-[0.2em]">1. Oppgaver / prøver</h3>
          </div>
          <div className="p-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            <div className="relative group h-24 shrink-0">
              <input type="file" multiple onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-3xl h-full flex items-center justify-center text-center bg-slate-50/30 group-hover:border-indigo-200 transition-all">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">+ Last opp oppgave</p>
              </div>
            </div>
            
            {hasRubric && (
               <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3 shrink-0">
                 <span className="text-emerald-500 text-xl">✅</span>
                 <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Fasit Klar ({useFlashFallback ? 'Flash' : 'Pro'})</div>
               </div>
            )}

            <div className="space-y-3">
              {activeProject.taskFiles.map(f => (
                <div key={f.id} className="flex justify-between items-center bg-slate-50/50 p-3 rounded-2xl border border-slate-100 group animate-in fade-in">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-lg shrink-0">📄</span>
                    <span className="text-[10px] font-bold text-slate-600 truncate">{f.fileName}</span>
                  </div>
                  <button onClick={() => handleDeleteTaskFile(f.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover:opacity-100">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-8 bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
           <div className="p-8 border-b bg-slate-50/20 flex justify-between items-center shrink-0">
              <h3 className="font-black text-[10px] uppercase text-emerald-600 tracking-[0.2em]">2. Besvarelser</h3>
              <div className="flex gap-6 items-end">
                 <div className="text-center">
                   <div className="text-sm font-black text-slate-800">{stats.totalCandidates}</div>
                   <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Kandidater</div>
                 </div>
                 <div className="text-center border-l border-slate-200 pl-6">
                   <div className="text-sm font-black text-slate-800">{stats.totalPages}</div>
                   <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Sider</div>
                 </div>
                 {stats.pending > 0 && (
                   <div className="text-center border-l border-slate-200 pl-6">
                     <div className="text-sm font-black text-indigo-600 animate-pulse">{stats.pending}</div>
                     <div className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mt-1">I Kø</div>
                   </div>
                 )}
                 {(stats.digitalCount > 0 || stats.handwrittenCount > 0) && (
                   <div className="hidden md:block border-l border-slate-200 pl-6">
                      <div className="flex gap-3 text-[10px] font-medium text-slate-500">
                         <span title="Digitale dokumenter (Word/Tekst)">💻 {stats.digitalCount}</span>
                         <span title="Håndskrevne/Skannede sider (Bilder/PDF)">📝 {stats.handwrittenCount}</span>
                      </div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 text-center">Typer</div>
                   </div>
                 )}
              </div>
           </div>
           <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex gap-4 mb-8">
                <div className="relative group h-40 flex-1 shrink-0">
                  <input type="file" multiple onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="border-2 border-dashed border-slate-100 rounded-[35px] h-full flex flex-col items-center justify-center text-center bg-slate-50/30 group-hover:bg-emerald-50/20 transition-all">
                    <div className="text-4xl mb-3">📥</div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Lokale filer</p>
                    <p className="text-[8px] font-bold text-slate-400 mt-2">PDF, JPG, PNG ELLER DOCX</p>
                  </div>
                </div>
              </div>

              {/* DYNAMISK STATUSMELDING v6.6.12 */}
              {isProcessing && (
                <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-[35px] text-center animate-pulse">
                   <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                     Klargjør dokumenter (Rotering/Splitting)...
                   </p>
                </div>
              )}

              {!isProcessing && !hasRubric && activeProject.taskFiles.length > 0 && stats.pending > 0 && rubricStatus.errorType !== 'GENERIC' && (
                <div className="mb-8 p-6 bg-amber-50 border border-amber-100 rounded-[35px] text-center animate-pulse">
                   <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                     Venter på rettemanual før transkribering starter...
                   </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sortedCandidates.map(c => {
                  const isUnknown = c.name.toLowerCase().includes("ukjent");
                  const tasks = getCandidateTaskSummary(c);
                  const { isComplete } = getCompletionStatus(c);
                  
                  return (
                    <div key={c.id} onClick={() => onNavigateToCandidate?.(c.id)} className={`p-4 rounded-[28px] border transition-all cursor-pointer flex justify-between items-center group animate-in zoom-in-95 ${isUnknown ? 'bg-rose-50/30 border-rose-100' : 'bg-white border-slate-100 hover:border-indigo-200 shadow-sm'}`}>
                       <div className="flex items-center gap-3 overflow-hidden w-full">
                          <div className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${isUnknown ? 'bg-rose-100' : 'bg-slate-50 group-hover:bg-indigo-50'}`}>{isUnknown ? '❓' : '👤'}</div>
                          <div className="overflow-hidden flex-1">
                            <div className="flex justify-between items-center">
                               <div className="flex items-center gap-1.5 overflow-hidden">
                                  <p className={`text-[11px] font-black truncate ${isUnknown ? 'text-rose-600' : 'text-slate-800'}`}>{c.name}</p>
                                  {isComplete && <span className="text-[10px]" title="Alle oppgaver funnet">✅</span>}
                               </div>
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5 shrink-0">{c.pages.length} s</p>
                            </div>
                            {tasks.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 h-auto">
                                {tasks.map((t, idx) => (
                                  <span key={idx} className={`text-[7px] font-black uppercase px-1 py-0.5 rounded-md leading-none ${t.part === '2' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-500'}`}>{t.label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                       </div>
                       <span className="text-indigo-600 text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 ml-2">→</span>
                    </div>
                  );
                })}

                {sortedUnprocessedPages.map(p => {
                   const isDigital = p.mimeType === 'text/plain' || p.fileName.toLowerCase().endsWith('.docx');
                   const isActive = activePageId === p.id;
                   const isError = p.status === 'error';
                   const isSkipped = p.status === 'skipped';
                   
                   // v7.9.27: Korrekt statusfeedback. Hvis ingen fasit, splitter vi bare.
                   const activeStatusText = isDigital 
                      ? 'Analyserer digitalt...' 
                      : (hasRubric ? 'Tolker håndskrift...' : 'Klargjør (Split/Roter)...');

                   return (
                     <div key={p.id} className={`p-4 rounded-[28px] border flex justify-between items-center transition-all duration-300 ${isActive ? 'bg-white border-indigo-200 shadow-md scale-[1.02] opacity-100' : isError ? 'bg-rose-50 border-rose-100' : isSkipped ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-slate-50/50 border-slate-100 opacity-60'}`}>
                        <div className="flex items-center gap-3 w-full">
                           {isActive ? (
                             <Spinner size="w-4 h-4" color="text-indigo-500" />
                           ) : isError ? (
                             <span className="text-rose-500 text-sm">⚠️</span>
                           ) : isSkipped ? (
                             <span className="text-slate-400 text-xs">⏭️</span>
                           ) : (
                             <span className="text-slate-300 text-xs grayscale">⏳</span>
                           )}
                           <div className="overflow-hidden flex-1">
                              <p className={`text-[10px] font-bold truncate max-w-[120px] ${isActive ? 'text-indigo-900' : isError ? 'text-rose-700' : isSkipped ? 'text-slate-500 line-through' : 'text-slate-400'}`}>{p.fileName}</p>
                              <div className="flex justify-between items-center">
                                <p className={`text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-indigo-500' : isError ? 'text-rose-500' : isSkipped ? 'text-slate-400' : 'text-slate-300'}`}>
                                   {isActive 
                                     ? activeStatusText
                                     : isError ? (p.statusLabel || 'Feilet') 
                                     : isSkipped ? 'Hoppet over'
                                     : 'I kø'}
                                </p>
                                {isActive && handleSkipFile && (
                                  <button onClick={handleSkipFile} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded text-[8px] font-black uppercase ml-2 transition-all hover:scale-105 shadow-sm">
                                    ⏭️ Hopp over (Utsett)
                                  </button>
                                )}
                              </div>
                           </div>
                        </div>
                     </div>
                   );
                })}
              </div>

              {activeProject.candidates.length === 0 && (activeProject.unprocessedPages || []).length === 0 && !isProcessing && (
                <div className="py-20 text-center opacity-20">
                   <p className="text-[10px] font-black uppercase tracking-[0.3em]">Ingen besvarelser lastet opp</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
