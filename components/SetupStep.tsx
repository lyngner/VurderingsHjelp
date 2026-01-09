
import React, { useMemo, useState } from 'react';
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
  etaSeconds?: number | null; 
  handleTaskFileSelect: (files: FileList) => void;
  handleGenerateRubric: () => void;
  handleCandidateFileSelect: (files: FileList, layoutMode?: 'A3' | 'A4') => void;
  handleRetryPage: (page: Page) => void;
  updateActiveProject: (updates: Partial<Project>) => void;
  onNavigateToCandidate?: (id: string) => void;
  handleSkipFile?: () => void; 
  handleRetryFailed?: () => void;
  handleDeleteUnprocessedPage?: (pageId: string) => void;
  quotaCount?: number; 
}

export const SetupStep: React.FC<SetupStepProps> = ({
  activeProject,
  isProcessing,
  batchTotal,
  batchCompleted,
  currentAction,
  activePageId,
  rubricStatus,
  handleTaskFileSelect,
  handleGenerateRubric,
  handleCandidateFileSelect,
  handleRetryPage,
  handleSkipFile,
  handleRetryFailed,
  handleDeleteUnprocessedPage,
  onNavigateToCandidate,
  etaSeconds
}) => {
  const hasRubric = !!activeProject.rubric && activeProject.rubric.criteria.length > 0;
  const isProQuotaError = rubricStatus.errorType === 'PRO_QUOTA';
  const hasError = !!rubricStatus.errorType; 
  const hasTasks = activeProject.taskFiles.length > 0;
  const [uploadLayoutMode, setUploadLayoutMode] = useState<'A3' | 'A4'>('A3');
  
  const unprocessed = activeProject.unprocessedPages || [];
  const failed = unprocessed.filter(p => p.status === 'error');
  // v8.9.34: Sort queue to show active item first, then pending
  const queueList = unprocessed.filter(p => p.status !== 'completed').sort((a, b) => {
      if (a.id === activePageId) return -1;
      if (b.id === activePageId) return 1;
      // Errors at the bottom of queue list (or handled separately)
      if (a.status === 'error' && b.status !== 'error') return 1;
      if (b.status === 'error' && a.status !== 'error') return -1;
      return 0;
  });
  
  // v9.1.7: Calculate failed count for the global retry button
  const failedCount = queueList.filter(p => p.status === 'error').length;
  
  // Stats calculation
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

  // Sort candidates naturally
  const sortedCandidates = useMemo(() => {
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

  // Helper to collect tasks for badges (re-implemented from old code)
  const getCandidateTaskSummary = (candidate: Candidate) => {
    const tasks = new Set<string>();
    candidate.pages.forEach(p => {
      p.identifiedTasks?.forEach(t => {
        if (t.taskNumber) {
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

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const displayProgress = batchTotal > 0 ? (batchCompleted / batchTotal) * 100 : 0;

  // v9.0.3: Determine status box styling and text including partial failures
  const failedTasks = hasRubric ? (activeProject.rubric?.criteria.filter(c => c.description.includes("feilet") || c.description.includes("Venter")).length || 0) : 0;
  const isPartial = failedTasks > 0;

  const statusBoxClass = rubricStatus.loading 
      ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
      : hasError
          ? 'bg-rose-50 text-rose-700 border-rose-200 cursor-pointer hover:bg-rose-100'
          : hasRubric 
              ? (isPartial ? 'bg-amber-50 text-amber-700 border-amber-100 cursor-pointer hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100')
              : 'bg-slate-50 text-slate-500 border-slate-200 cursor-pointer hover:bg-slate-100';

  const statusBoxText = rubricStatus.loading 
      ? (hasRubric ? `Oppdaterer manual (${activeProject.rubric?.criteria.length})...` : rubricStatus.text || `Genererer rettemanual...`) 
      : hasError
          ? (rubricStatus.text || "Generering feilet. Prøv igjen.")
          : hasRubric 
              ? (isPartial ? `Delvis ferdig (${activeProject.rubric?.criteria.length - failedTasks}/${activeProject.rubric?.criteria.length}). ${failedTasks} feilet.` : `Rettemanual klar (${activeProject.rubric?.criteria.length} oppg)`)
              : `Venter på generering...`;

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F8FAFC]">
       <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
           <div className="max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
               
               {/* LEFT COLUMN: TASKS (1/3 width) */}
               <section className="lg:col-span-4 flex flex-col gap-6">
                   <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm relative overflow-hidden flex flex-col h-full">
                       <h2 className="text-sm font-black text-indigo-600 uppercase tracking-widest mb-6">1. Oppgaver / Prøver</h2>
                       
                       <label className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors group mb-6 bg-slate-50/30">
                           <input type="file" multiple accept="image/*,.pdf,.docx" className="hidden" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} />
                           <div className="text-2xl mb-2 group-hover:scale-110 transition-transform text-slate-300">📄</div>
                           <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest group-hover:text-indigo-600 text-center">+ Last opp oppgave</span>
                       </label>

                       <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mb-6 max-h-[300px]">
                           {activeProject.taskFiles.length === 0 ? (
                               <div className="text-center py-4 text-slate-300 italic text-xs">Ingen oppgaver lastet opp</div>
                           ) : (
                               activeProject.taskFiles.map((f, i) => (
                                   <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-600 animate-in fade-in">
                                       <span>📄</span> <span className="truncate">{f.fileName}</span>
                                   </div>
                               ))
                           )}
                       </div>

                       {/* Status Box: Vises alltid hvis det finnes oppgaver */}
                       {hasTasks && (
                           <div 
                                onClick={() => !rubricStatus.loading && handleGenerateRubric()}
                                className={`${statusBoxClass} px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest border animate-in zoom-in transition-all`}
                                title={!hasRubric && !rubricStatus.loading ? "Klikk for å starte generering manuelt" : ""}
                           >
                               {rubricStatus.loading ? <Spinner size="w-3 h-3" color="text-indigo-700"/> : hasError ? <span>⚠️</span> : (isPartial ? <span>⚠️</span> : <span>✅</span>)} 
                               {statusBoxText}
                           </div>
                       )}
                       
                       {isProQuotaError && (
                           <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-[10px] font-bold text-center">
                               Kvote nådd. Prøv igjen i morgen eller oppgrader nøkkel.
                           </div>
                       )}
                   </div>
               </section>

               {/* RIGHT COLUMN: RESPONSES (2/3 width) */}
               <section className="lg:col-span-8 flex flex-col gap-6 relative">
                   <div className={`bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex-1 flex flex-col transition-opacity ${!hasRubric && !isProcessing && !rubricStatus.loading ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                       
                       <div className="flex justify-between items-start mb-8 border-b border-slate-50 pb-4">
                           <h2 className="text-sm font-black text-emerald-600 uppercase tracking-widest mt-2">2. Besvarelser</h2>
                           <div className="flex gap-8 items-end">
                               <div className="text-center">
                                   <div className="text-2xl font-black text-slate-800">{stats.totalCandidates}</div>
                                   <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Kandidater</div>
                               </div>
                               <div className="text-center border-l border-slate-100 pl-6">
                                   <div className="text-2xl font-black text-slate-800">{stats.totalPages}</div>
                                   <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Sider</div>
                               </div>
                               <div className="text-center border-l border-slate-100 pl-6 hidden md:block">
                                   <div className="text-xl font-black text-slate-600 flex items-center justify-center gap-2">
                                       <span title="Digital">💻 {stats.digitalCount}</span>
                                       <span title="Papir">📝 {stats.handwrittenCount}</span>
                                   </div>
                                   <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Typer</div>
                               </div>
                           </div>
                       </div>

                       {/* MAIN UPLOAD AREA */}
                       <div className="relative group mb-8">
                           <label className="border-2 border-dashed border-slate-200 rounded-[32px] p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors bg-slate-50/30 min-h-[180px]">
                               <input type="file" multiple accept="image/*,.pdf,.docx" className="hidden" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files, uploadLayoutMode)} />
                               <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform relative border border-slate-100">
                                   📥
                                   <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping opacity-0 group-hover:opacity-100"></div>
                               </div>
                               <span className="text-[11px] font-black uppercase text-slate-500 tracking-[0.15em] mb-2 group-hover:text-indigo-600">LOKALE FILER</span>
                               <span className="text-[9px] font-bold text-slate-300">PDF, JPG, PNG ELLER DOCX</span>
                           </label>
                           
                           {/* Layout Toggle */}
                           <div className="absolute top-4 right-4 bg-white border border-slate-200 rounded-xl p-1 flex gap-1 shadow-sm z-10">
                               <button 
                                   onClick={(e) => { e.preventDefault(); setUploadLayoutMode('A3'); }}
                                   className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${uploadLayoutMode === 'A3' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
                                   title="Automatisk splitting av A3-oppslag (Standard)"
                               >
                                   A3 Oppslag
                               </button>
                               <button 
                                   onClick={(e) => { e.preventDefault(); setUploadLayoutMode('A4'); }}
                                   className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${uploadLayoutMode === 'A4' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
                                   title="Enkeltsider uten splitting"
                               >
                                   A4 Enkel
                               </button>
                           </div>
                       </div>

                       {/* PROGRESS & QUEUE LIST (v8.9.34) */}
                       {(isProcessing || queueList.length > 0) && (
                           <div className="mb-8">
                               {/* Progress Bar Header */}
                               <div className="flex justify-between items-end mb-2">
                                   <div className="flex flex-col">
                                       <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-1 animate-pulse">
                                           {currentAction || "Jobber..."}
                                       </span>
                                       {/* v8.9.35: Only show ETA if > 0 */}
                                       {(etaSeconds || 0) > 0 && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Est. tid: {formatEta(etaSeconds || 0)}</span>}
                                   </div>
                                   {/* v9.1.7: Global Retry Button */}
                                   <div className="flex items-center gap-4">
                                       {failedCount > 0 && handleRetryFailed && (
                                           <button 
                                               onClick={handleRetryFailed}
                                               className="flex items-center gap-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm animate-in fade-in"
                                           >
                                               <span>↻</span> Prøv {failedCount} feilede på nytt
                                           </button>
                                       )}
                                       <span className="text-[10px] font-bold text-slate-400">{batchCompleted}/{batchTotal}</span>
                                   </div>
                               </div>
                               <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                                   <div className="h-full bg-indigo-500 transition-all duration-500 ease-out rounded-full" style={{ width: `${displayProgress}%` }}></div>
                               </div>

                               {/* Live Queue List - "Glass Box" Visualization */}
                               <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar">
                                   {queueList.map((p) => {
                                       const isActive = p.id === activePageId;
                                       const isError = p.status === 'error';
                                       const isSkipped = p.status === 'skipped';
                                       
                                       return (
                                           <div key={p.id} className={`p-3 border-b border-slate-50 flex items-center justify-between transition-colors ${isActive ? 'bg-indigo-50/50' : isError ? 'bg-rose-50/50' : 'hover:bg-slate-50'}`}>
                                               <div className="flex items-center gap-3 min-w-0">
                                                   <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-indigo-500 animate-pulse' : isError ? 'bg-rose-500' : 'bg-slate-300'}`}></div>
                                                   <span className={`text-[10px] font-bold truncate ${isActive ? 'text-indigo-700' : isError ? 'text-rose-600' : 'text-slate-600'}`}>
                                                       {p.fileName}
                                                   </span>
                                               </div>
                                               <div className="flex items-center gap-2 shrink-0">
                                                   {isActive && <Spinner size="w-3 h-3" color="text-indigo-600" />}
                                                   <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                                       {isActive 
                                                          ? (currentAction?.split(':')[0] || 'Behandler') 
                                                          : (hasRubric ? p.statusLabel || (isError ? 'Feilet' : isSkipped ? 'Hoppet over' : 'I kø') : 'Venter på struktur...')
                                                       }
                                                   </span>
                                                   {isError && handleRetryFailed && (
                                                       <button onClick={() => handleRetryPage(p)} className="ml-2 w-5 h-5 bg-white border border-rose-200 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50 text-[10px]" title="Prøv denne igjen">↻</button>
                                                   )}
                                                   {/* v8.9.41: Allow deleting pending/error items from queue */}
                                                   {handleDeleteUnprocessedPage && (
                                                       <button 
                                                           onClick={() => handleDeleteUnprocessedPage(p.id)} 
                                                           className="ml-2 w-5 h-5 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
                                                           title="Fjern fra kø"
                                                       >
                                                           ✕
                                                       </button>
                                                   )}
                                               </div>
                                           </div>
                                       );
                                   })}
                               </div>
                           </div>
                       )}

                       {/* COMPLETED CANDIDATE GRID */}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
                           {sortedCandidates.map(c => {
                               const tasks = getCandidateTaskSummary(c);
                               const isUnknown = c.name.toLowerCase().includes("ukjent");
                               return (
                                   <button 
                                     key={c.id}
                                     onClick={() => onNavigateToCandidate && onNavigateToCandidate(c.id)}
                                     className={`p-5 rounded-[24px] border transition-all text-left group flex justify-between items-center ${isUnknown ? 'bg-rose-50/50 border-rose-100' : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-md'}`}
                                   >
                                       <div className="flex flex-col gap-3 w-full overflow-hidden">
                                           <div className="flex items-center gap-3">
                                               <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shadow-sm ${isUnknown ? 'bg-rose-100 text-rose-500' : 'bg-slate-50 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>
                                                   {isUnknown ? '❓' : '👤'}
                                               </div>
                                               <div className="min-w-0">
                                                   <div className="text-sm font-black text-slate-800 truncate">{c.name}</div>
                                                   <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                                                       {c.pages.length} sider {c.pages.some(p => p.isDigital) ? '• Digital' : ''}
                                                   </div>
                                               </div>
                                           </div>
                                           
                                           {tasks.length > 0 ? (
                                               <div className="flex flex-wrap gap-1">
                                                   {tasks.map((t, idx) => (
                                                       <span key={idx} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md leading-none border ${t.part === '2' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-50 text-indigo-500 border-indigo-100'}`}>
                                                           {t.label}
                                                       </span>
                                                   ))}
                                               </div>
                                           ) : (
                                               <span className="text-[9px] text-slate-300 italic pl-1">Venter på analyse...</span>
                                           )}
                                       </div>
                                       <span className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 ml-2">→</span>
                                   </button>
                               );
                           })}
                       </div>
                   </div>
               </section>
           </div>
       </main>
    </div>
  );
};
