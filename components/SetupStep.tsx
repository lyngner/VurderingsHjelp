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
              <h3 className="font-black text-[11px] uppercase text-indigo-600 tracking-widest">1. Oppgave / Fasit</h3>
              <p className="text-[9px] text-slate-400 font-bold">Laster inn PDF, Word eller Bilder</p>
            </div>
            {(activeProject?.taskFiles?.length || 0) > 0 && (
              <button onClick={() => updateActiveProject({ taskFiles: [] })} className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors">Tøm ✕</button>
            )}
          </div>

          <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="relative group h-40 shrink-0">
              <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-[25px] h-full flex flex-col items-center justify-center p-4 text-center group-hover:border-indigo-200 transition-colors bg-slate-50/50">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 text-xl">📄</div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last opp oppgaveark</p>
                <p className="text-[8px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">Word, PDF eller skann</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {(activeProject?.taskFiles || []).length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-widest opacity-50 text-center px-8 leading-relaxed">
                  Ingen oppgaver lastet inn. Dette danner grunnlaget for KI-vurderingen.
                </div>
              )}
              {(activeProject?.taskFiles || []).map(f => (
                <div key={f.id} className="text-[10px] font-bold bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm animate-in fade-in slide-in-from-bottom-1">
                  <div className="flex items-center gap-3 truncate">
                    <span className="opacity-40">{f.fileName.endsWith('.docx') ? '📘' : '📄'}</span>
                    <span className="truncate">{f.fileName}</span>
                  </div>
                  {rubricStatus.loading ? <Spinner size="w-3 h-3" /> : <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-black shrink-0">KLAR</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* KOLONNE 2: ELEVBESVARELSER */}
        <div className="bg-white rounded-[45px] shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 shrink-0">
            <div className="flex flex-col">
              <h3 className="font-black text-[11px] uppercase text-emerald-600 tracking-widest">2. Elevbesvarelser</h3>
              <p className="text-[9px] text-slate-400 font-bold">Laster inn PDF, Word eller skannede JPG</p>
            </div>
          </div>

          <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="relative group h-40 shrink-0">
              <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-100 rounded-[25px] h-full flex flex-col items-center justify-center p-4 text-center group-hover:border-emerald-200 transition-colors bg-slate-50/50">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 text-xl">🎓</div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last opp elevsider</p>
                <p className="text-[8px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">Sider grupperes automatisk</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {(activeProject?.unprocessedPages || []).map(p => (
                <div key={p.id} className={`text-[10px] font-bold p-4 rounded-2xl border flex gap-4 items-center animate-in fade-in ${p.status === 'error' ? 'bg-rose-50 border-rose-100 cursor-pointer' : 'bg-slate-50 border-dashed'}`} onClick={() => p.status === 'error' && handleRetryPage(p)}>
                  {p.status === 'error' ? <span className="text-rose-500">↻</span> : <Spinner size="w-3 h-3" />}
                  <span className="truncate flex-1">{p.fileName}</span>
                </div>
              ))}
              {(activeProject?.candidates || []).length === 0 && (activeProject?.unprocessedPages || []).length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-widest opacity-50 text-center px-8 leading-relaxed">
                  Last inn elevsvar. KI-en vil forsøke å finne Kandidat-ID på hvert ark.
                </div>
              )}
              {(activeProject?.candidates || []).map(c => (
                <div key={c.id} className="text-[11px] font-black bg-emerald-50 p-5 rounded-[25px] border border-emerald-100 text-emerald-700 flex justify-between items-center animate-in zoom-in-95">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px]">👤</div>
                    <span>{c.name}</span>
                  </div>
                  <span className="text-[9px] bg-emerald-500 text-white px-3 py-1 rounded-full uppercase">{(c.pages || []).length} Sider</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};