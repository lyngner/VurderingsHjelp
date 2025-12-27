
import React from 'react';
import { Project, Page } from '../types';
import { Spinner } from './SharedUI';

interface SetupStepProps {
  activeProject: Project;
  isProcessing: boolean;
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
  rubricStatus,
  handleTaskFileSelect,
  handleGenerateRubric,
  handleCandidateFileSelect,
  handleRetryPage,
  updateActiveProject
}) => {
  return (
    <div className="p-8 max-w-[1200px] mx-auto h-full flex flex-col overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full max-h-[85vh]">
        
        {/* KOLONNE 1: OPPGAVE / FASIT */}
        <div className="bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 shrink-0">
            <div className="flex flex-col">
              <h3 className="font-black text-[11px] uppercase text-slate-400 tracking-widest">1. Oppgave / Fasit</h3>
              <p className="text-[9px] text-slate-400 font-bold">Grunnlag for rettemanual</p>
            </div>
            {(activeProject?.taskFiles?.length || 0) > 0 && (
              <button onClick={() => updateActiveProject({ taskFiles: [] })} className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors">Tøm ✕</button>
            )}
          </div>

          <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="relative group h-32 shrink-0">
              <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-[25px] h-full flex flex-col items-center justify-center p-4 text-center group-hover:border-indigo-200 transition-colors bg-slate-50/50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Velg oppgaveark</p>
                <p className="text-[8px] text-slate-300 mt-1 uppercase font-bold tracking-tighter">Slipp filer her</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {(activeProject?.taskFiles || []).length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-widest opacity-50">
                  Ingen oppgaveark valgt
                </div>
              )}
              {(activeProject?.taskFiles || []).map(f => (
                <div key={f.id} className="text-[10px] font-bold bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm animate-in fade-in slide-in-from-bottom-1">
                  <span className="truncate flex-1 pr-4">{f.fileName}</span>
                  {rubricStatus.loading ? (
                    <div className="flex items-center gap-3">
                      <span className="text-[8px] text-indigo-400 font-black uppercase tracking-tight">Analyserer...</span>
                      <Spinner size="w-3 h-3" />
                    </div>
                  ) : (
                    <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-black shrink-0">KLAR</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* KOLONNE 2: ELEVBESVARELSER */}
        <div className="bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 shrink-0">
            <div className="flex flex-col">
              <h3 className="font-black text-[11px] uppercase text-slate-400 tracking-widest">2. Elevbesvarelser</h3>
              <p className="text-[9px] text-slate-400 font-bold">Skannede jpg/pdf-filer</p>
            </div>
            {(activeProject?.unprocessedPages?.length || 0) > 0 && (
              <button onClick={() => updateActiveProject({ unprocessedPages: [] })} className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors">Tøm kø ✕</button>
            )}
          </div>

          <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="relative group h-32 shrink-0">
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-[25px] h-full flex flex-col items-center justify-center p-4 text-center group-hover:border-emerald-200 transition-colors bg-slate-50/50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legg til elevsider</p>
                <p className="text-[8px] text-slate-300 mt-1 uppercase font-bold tracking-tighter">JPG eller PDF</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {(activeProject?.unprocessedPages || []).length === 0 && (activeProject?.candidates || []).length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-widest opacity-50">
                  Ingen besvarelser lastet inn
                </div>
              )}
              
              {/* Kø (Under behandling eller feilet) */}
              {(activeProject?.unprocessedPages || []).map(p => (
                <div key={p.id} className={`text-[10px] font-bold p-4 rounded-2xl border flex gap-4 items-center animate-in fade-in ${p.status === 'error' ? 'bg-rose-50 border-rose-100 cursor-pointer hover:bg-rose-100' : 'bg-slate-50 border-dashed border-slate-200'}`} onClick={() => p.status === 'error' && handleRetryPage(p)}>
                  <div className="shrink-0">
                    {p.status === 'error' ? (
                      <span className="text-rose-500 font-black">↻</span>
                    ) : (
                      <Spinner size="w-3 h-3" />
                    )}
                  </div>
                  <span className={`truncate flex-1 ${p.status === 'error' ? 'text-rose-600' : 'text-slate-400'}`}>
                    {p.fileName} {p.status === 'error' && '(Feilet - Klikk for å prøve igjen)'}
                  </span>
                </div>
              ))}

              {/* Ferdige kandidater */}
              {(activeProject?.candidates || []).map(c => (
                <div key={c.id} className="text-[11px] font-black bg-emerald-50 p-5 rounded-[25px] border border-emerald-100 text-emerald-700 flex justify-between items-center shadow-sm animate-in zoom-in-95">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span>{c.name}</span>
                  </div>
                  <span className="text-[9px] bg-emerald-500 text-white px-3 py-1 rounded-full uppercase shrink-0">{(c.pages || []).length} Sider</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
