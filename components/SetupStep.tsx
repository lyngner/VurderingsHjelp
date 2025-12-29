
import React, { useMemo } from 'react';
import { Project, Page } from '../types';
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
}

export const SetupStep: React.FC<SetupStepProps> = ({
  activeProject,
  isProcessing,
  batchTotal,
  batchCompleted,
  currentAction,
  rubricStatus,
  handleTaskFileSelect,
  handleCandidateFileSelect,
  handleRetryPage,
  updateActiveProject
}) => {
  const progressPercent = batchTotal > 0 ? Math.min(100, Math.round((batchCompleted / batchTotal) * 100)) : 0;
  const isAiWorking = rubricStatus.loading;

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
      
      {/* Global fremdriftsvisning - Mer kompakt og informativ */}
      {(batchTotal > 0 || isAiWorking) && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-end">
              <div>
                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${isAiWorking ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {isAiWorking ? 'KI-Analyse' : 'Prosesserer filer'}
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
              {!isAiWorking && batchCompleted < batchTotal && (
                <div className="flex items-center gap-2 mb-1">
                  <Spinner size="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
              <div 
                className={`h-full transition-all duration-1000 ease-out rounded-full ${isAiWorking ? 'bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}
                style={{ width: `${isAiWorking ? 100 : progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full overflow-hidden pb-10">
        
        {/* KOLONNE 1: OPPGAVE / FASIT */}
        <div className="md:col-span-4 bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20 shrink-0">
            <div>
              <h3 className="font-black text-[10px] uppercase text-indigo-600 tracking-[0.2em]">1. Oppgave / Fasit</h3>
            </div>
            {(activeProject?.taskFiles?.length || 0) > 0 && (
              <button onClick={() => updateActiveProject({ taskFiles: [] })} className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors">Tøm ✕</button>
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
              {(activeProject?.taskFiles || []).map(f => (
                <div key={f.id} className="text-[11px] font-bold bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                  <span className="truncate flex-1 pr-3 text-slate-600">📄 {f.fileName}</span>
                  <span className="text-emerald-500 font-black">✓</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* KOLONNE 2: ELEVBESVARELSER - Optimalisert utnyttelse */}
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

          <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
            {/* Mindre dominerende drop-zone */}
            <div className="relative group h-32 shrink-0">
              <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-[35px] h-full flex flex-col items-center justify-center p-4 text-center group-hover:border-emerald-200 transition-all bg-slate-50/30 group-hover:bg-emerald-50/20">
                <div className="text-2xl mb-2">📥</div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em]">Slipp filer eller klikk for å velge</p>
              </div>
            </div>

            {/* Liste over ferdige og prosesserende filer */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Prosesserer / Venter */}
                {(activeProject?.unprocessedPages || []).map(p => (
                  <div key={p.id} className={`text-[11px] font-bold p-4 rounded-2xl border flex gap-4 items-center transition-all ${p.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-indigo-50/50 border-indigo-100 text-indigo-700 shadow-sm'}`}>
                    <div className="shrink-0">
                      {p.status === 'processing' ? <Spinner size="w-3 h-3" color="text-indigo-600" /> : <div className="w-3 h-3 rounded-full bg-indigo-200"></div>}
                    </div>
                    <span className="truncate flex-1">{p.fileName}</span>
                    <span className="text-[8px] font-black uppercase opacity-60">
                      {p.status === 'processing' ? 'Analyserer' : p.status === 'error' ? 'Feil' : 'I kø'}
                    </span>
                    {p.status === 'error' && <button onClick={() => handleRetryPage(p)} className="p-1 hover:bg-rose-100 rounded">↻</button>}
                  </div>
                ))}

                {/* Ferdig prosessert (Kandidater) */}
                {(activeProject?.candidates || []).map(c => (
                  <div key={c.id} className="text-[11px] font-black bg-white p-4 rounded-2xl border border-slate-100 text-slate-700 flex justify-between items-center shadow-sm hover:border-emerald-200 transition-colors">
                    <span className="truncate flex items-center gap-3">
                      <span className="text-emerald-500">👤</span> {c.name}
                    </span>
                    <div className="flex items-center gap-2">
                       <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{c.pages.length} s</span>
                       <span className="text-emerald-500 font-black">✓</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {activeProject?.candidates?.length === 0 && activeProject?.unprocessedPages?.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                  <div className="text-6xl mb-4">📂</div>
                  <p className="font-black uppercase tracking-widest text-[10px]">Ingen filer lastet inn ennå</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
