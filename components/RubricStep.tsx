
import React from 'react';
import { Project } from '../types';
import { LatexRenderer, Spinner } from './SharedUI';

interface RubricStepProps {
  activeProject: Project;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
}

export const RubricStep: React.FC<RubricStepProps> = ({
  activeProject,
  handleGenerateRubric,
  rubricStatus
}) => {
  const isGenerating = rubricStatus.loading && !activeProject.rubric;

  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-indigo-100 rounded-full"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size="w-10 h-10" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Genererer Rettemanual</h2>
          <p className="text-slate-400 text-sm font-medium max-w-xs mx-auto">Gemini analyserer oppgavearkene dine...</p>
        </div>
      </div>
    );
  }

  if (!activeProject.rubric) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
        <div className="text-6xl grayscale opacity-30">📋</div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Ingen rettemanual ennå</h2>
          <p className="text-slate-400 text-sm font-medium mb-8">Legg til oppgaveark for å starte.</p>
          <button 
            onClick={handleGenerateRubric} 
            disabled={rubricStatus.loading}
            className="bg-indigo-600 text-white px-10 py-4 rounded-full font-black text-xs uppercase shadow-lg active:scale-95"
          >
            {rubricStatus.loading ? <Spinner color="text-white" /> : 'Generer Rettemanual'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-12 overflow-y-auto h-full custom-scrollbar">
      <header className="flex justify-between items-end bg-white p-10 rounded-[50px] shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
        <div>
          <h2 className="text-3xl font-black text-slate-800">{activeProject.rubric.title}</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] mt-2 tracking-widest">Vurderingskriterier & Fasit</p>
        </div>
        <div className="text-indigo-600 font-black text-[10px] uppercase tracking-widest px-6 py-3 bg-indigo-50 rounded-full">
           KLAR TIL BRUK
        </div>
      </header>

      <div className="bg-white rounded-[50px] border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b text-[10px] font-black uppercase text-slate-400">
            <tr>
              <th className="p-10 w-24">Oppg</th>
              <th className="p-10">Kriterier & Løsningsforslag</th>
              <th className="p-10 text-center w-32">Maks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(activeProject.rubric.criteria || []).map((crit, idx) => (
              <tr key={idx} className="hover:bg-slate-50/30 transition-colors group">
                <td className="p-10 align-top">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-800 text-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    {crit.name}
                  </div>
                </td>
                <td className="p-10 space-y-6">
                  <div>
                    <div className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2">{crit.tema}</div>
                    <p className="text-sm text-slate-600 font-bold leading-relaxed">{crit.description}</p>
                  </div>
                  <div className="p-8 bg-slate-50 rounded-[35px] border border-slate-100">
                    <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-4">Løsningsforslag</span>
                    <LatexRenderer content={crit.suggestedSolution} className="text-[15px] text-slate-800 font-medium" />
                  </div>
                </td>
                <td className="p-10 text-center align-top">
                  <div className="text-4xl font-black text-indigo-600">{crit.maxPoints}</div>
                  <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1">Poeng</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="pb-20 flex flex-col items-center gap-6">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Totalt {activeProject.rubric.totalMaxPoints} poeng tilgjengelig</p>
        <button 
          onClick={handleGenerateRubric} 
          disabled={rubricStatus.loading}
          className={`px-10 py-5 rounded-[25px] font-black text-[10px] uppercase shadow-lg transition-all active:scale-95 flex items-center gap-3 ${
            rubricStatus.loading ? 'bg-indigo-50 text-indigo-300' : 'bg-white border text-slate-600 hover:border-indigo-200'
          }`}
        >
          {rubricStatus.loading ? <Spinner size="w-4 h-4" /> : '🔄 Oppdater Rettemanual'}
        </button>
      </div>
    </div>
  );
};
