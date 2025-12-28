
import React, { useMemo } from 'react';
import { Project, Page } from '../types';
import { Spinner } from './SharedUI';

interface SetupStepProps {
  activeProject: Project;
  isProcessing: boolean;
  batchTotal: number;
  batchCompleted: number;
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
  rubricStatus,
  handleTaskFileSelect,
  handleCandidateFileSelect,
  handleRetryPage,
  updateActiveProject
}) => {
  const progressPercent = batchTotal > 0 ? Math.round((batchCompleted / batchTotal) * 100) : 0;
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
      
      {/* Global fremdriftsvisning */}
      {(batchTotal > 0 || isAiWorking) && (
        <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-white p-5 rounded-[30px] border border-slate-100 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div>
                <h4 className={`text-[10px] font-black uppercase tracking-widest ${isAiWorking ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {isAiWorking ? 'KI-Analyse' : 'Laster inn filer'}
                </h4>
                <p className="text-[13px] font-bold text-slate-700">
                  {isAiWorking 
                    ? rubricStatus.text 
                    : `${batchCompleted} av ${batchTotal} prosessert (${progressPercent}%)`}
                </p>
              </div>
              {!isAiWorking && batchCompleted < batchTotal && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-300 uppercase animate-pulse">Arbeider...</span>
                  <Spinner size="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-700 ease-out rounded-full ${isAiWorking ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`}
                style={{ width: `${isAiWorking ? 100 : progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full overflow-hidden pb-10">
        
        {/* KOLONNE 1: OPPGAVE / FASIT */}
        <div className="md:col-span-4 bg-white rounded-[40px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 shrink-0">
            <div>
              <h3 className="font-black text-[10px] uppercase text-indigo-600 tracking-widest">1. Oppgave / Fasit</h3>
            </div>
            {(activeProject?.taskFiles?.length || 0) > 0 && (
              <button onClick={() => updateActiveProject({ taskFiles: [] })} className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600">Tøm ✕</button>
            )}
          </div>

          <div className="p-6 flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="relative group h-24 shrink-0">
              <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-2xl h-full flex flex-col items-center justify-center p-2 text-center group-hover:border-indigo-200 transition-colors bg-slate-50/50">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">+ Last opp oppgave</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {(activeProject?.taskFiles || []).map(f => (
                <div key={f.id} className="text-[10px] font-bold bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center">
                  <span className="truncate flex-1 pr-2">📄 {f.fileName}</span>
                  {isAiWorking ? <Spinner size="w-3 h-3" /> : <span className="text-emerald-500 font-black">✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* KOLONNE 2: ELEVBESVARELSER */}
        <div className="md:col-span-8 bg-white rounded-[40px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 shrink-0">
            <div className="flex flex-col">
              <h3 className="font-black text-[10px] uppercase text-emerald-600 tracking-widest">2. Elevbesvarelser</h3>
            </div>
            <div className="flex gap-4">
               <div className="text-center">
                  <div className="text-[11px] font-black text-slate-700 leading-none">{stats.totalCandidates}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Elever</div>
               </div>
               <div className="text-center">
                  <div className="text-[11px] font-black text-emerald-600 leading-none">{stats.totalSider}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Sider</div>
               </div>
            </div>
          </div>

          <div className="p-6 flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="relative group flex-1">
              <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-3xl h-full flex flex-col items-center justify-center p-10 text-center group-hover:border-emerald-200 transition-colors bg-slate-50/50">
                <div className="text-4xl mb-4">📥</div>
                <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Slipp filer her</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Støtter PDF, Word og Bilder</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {(activeProject?.unprocessedPages || []).map(p => (
                <div key={p.id} className={`text-[10px] font-bold p-3 rounded-xl border flex gap-3 items-center ${p.status === 'error' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                  <span className="truncate flex-1">{p.fileName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black uppercase">{p.status === 'processing' ? 'Analyserer...' : 'Venter...'}</span>
                    <Spinner size="w-3 h-3" />
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                {(activeProject?.candidates || []).map(c => (
                  <div key={c.id} className="text-[10px] font-black bg-white p-3 rounded-xl border border-slate-100 text-slate-700 flex justify-between items-center shadow-sm">
                    <span className="truncate">👤 {c.name}</span>
                    <span className="text-emerald-500 font-black">✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
