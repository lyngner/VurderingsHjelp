
import React from 'react';
import { Project, Rubric } from '../types';
import { LatexRenderer, Spinner } from './SharedUI';

interface RubricStepProps {
  activeProject: Project;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
  updateActiveProject?: (updates: Partial<Project>) => void;
}

export const RubricStep: React.FC<RubricStepProps> = ({
  activeProject,
  handleGenerateRubric,
  rubricStatus,
  updateActiveProject
}) => {
  const isGenerating = rubricStatus.loading && !activeProject.rubric;

  const updateRubric = (newRubric: Rubric) => {
    if (updateActiveProject) {
      const totalMaxPoints = newRubric.criteria.reduce((acc, c) => acc + Number(c.maxPoints || 0), 0);
      updateActiveProject({ rubric: { ...newRubric, totalMaxPoints } });
    }
  };

  const handlePointChange = (idx: number, points: string) => {
    if (!activeProject.rubric) return;
    const val = parseInt(points) || 0;
    const newCriteria = [...activeProject.rubric.criteria];
    newCriteria[idx] = { ...newCriteria[idx], maxPoints: val };
    updateRubric({ ...activeProject.rubric, criteria: newCriteria });
  };

  const handleFieldChange = (idx: number, field: keyof any, value: string) => {
    if (!activeProject.rubric) return;
    const newCriteria = [...activeProject.rubric.criteria];
    (newCriteria[idx] as any)[field] = value;
    updateRubric({ ...activeProject.rubric, criteria: newCriteria });
  };

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
          <p className="text-slate-400 font-bold uppercase text-[10px] mt-2 tracking-widest">Vurderingskriterier & Fasit (Redigerbar)</p>
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
              <th className="p-10">Kriterier, Løsning & Feilkilder</th>
              <th className="p-10 text-center w-32">Maks Poeng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(activeProject.rubric.criteria || []).map((crit, idx) => (
              <tr key={idx} className="hover:bg-slate-50/30 transition-colors group">
                <td className="p-10 align-top">
                  <input 
                    value={crit.name} 
                    onChange={e => handleFieldChange(idx, 'name', e.target.value)}
                    className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-800 text-center outline-none focus:ring-2 focus:ring-indigo-300" 
                  />
                </td>
                <td className="p-10 space-y-6">
                  <div>
                    <input 
                      value={crit.tema || ""} 
                      placeholder="Tema..."
                      onChange={e => handleFieldChange(idx, 'tema', e.target.value)}
                      className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2 bg-transparent outline-none w-full" 
                    />
                    <textarea 
                      value={crit.description} 
                      onChange={e => handleFieldChange(idx, 'description', e.target.value)}
                      className="text-sm text-slate-600 font-bold leading-relaxed w-full bg-transparent outline-none resize-none"
                      rows={2}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-6 bg-slate-50 rounded-[25px] border border-slate-100">
                      <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-3">Løsningsforslag (LaTeX)</span>
                      <textarea 
                        value={crit.suggestedSolution} 
                        onChange={e => handleFieldChange(idx, 'suggestedSolution', e.target.value)}
                        className="w-full text-[13px] text-slate-800 font-medium bg-transparent outline-none resize-none mb-2"
                        rows={3}
                      />
                      <LatexRenderer content={crit.suggestedSolution} className="text-[14px] text-slate-700 border-t pt-2 border-slate-200 mt-2" />
                    </div>

                    <div className="p-6 bg-rose-50/30 rounded-[25px] border border-rose-100/50">
                      <span className="text-[8px] font-black uppercase text-rose-400 tracking-widest block mb-3">Vanlige feil & Poengtrekk</span>
                      <textarea 
                        value={crit.commonErrors || ""} 
                        placeholder="Beskriv typiske feil og hvordan de påvirker poengsummen..."
                        onChange={e => handleFieldChange(idx, 'commonErrors', e.target.value)}
                        className="w-full text-[13px] text-slate-700 font-medium bg-transparent outline-none resize-none"
                        rows={5}
                      />
                    </div>
                  </div>
                </td>
                <td className="p-10 text-center align-top">
                  <input 
                    type="number" 
                    value={crit.maxPoints} 
                    onChange={e => handlePointChange(idx, e.target.value)}
                    className="text-4xl font-black text-indigo-600 w-24 text-center bg-transparent outline-none"
                  />
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
          {rubricStatus.loading ? <Spinner size="w-4 h-4" /> : '🔄 Overskriv med ny KI-analyse'}
        </button>
      </div>
    </div>
  );
};
