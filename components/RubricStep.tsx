
import React, { useState, useMemo } from 'react';
import { Project, Rubric, RubricCriterion } from '../types';
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
  const [selectedFilter, setSelectedFilter] = useState<{ part: string | null; taskNum: string | null }>({ part: null, taskNum: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingErrorsId, setEditingErrorsId] = useState<string | null>(null);

  const criteria = activeProject.rubric?.criteria || [];

  // Grupperer kun etter hovedoppgaver (f.eks. "1", "2") forsidemenyen
  const groupedByPartAndMainTask = useMemo(() => {
    const parts: Record<string, string[]> = {};
    criteria.forEach(c => {
      // Normaliser partKey til "Del 1", "Del 2" etc.
      const partKey = c.part?.trim() || "Uspesifisert";
      const match = c.name.match(/(\d+)/);
      const mainTaskNum = match ? match[1] : c.name;
      
      if (!parts[partKey]) parts[partKey] = [];
      if (!parts[partKey].includes(mainTaskNum)) parts[partKey].push(mainTaskNum);
    });

    // Sorterer hovedoppgaver numerisk
    Object.keys(parts).forEach(pk => {
      parts[pk].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    });
    return parts;
  }, [criteria]);

  const sortedPartKeys = Object.keys(groupedByPartAndMainTask).sort();

  const filteredCriteria = useMemo(() => {
    let result = criteria;
    if (selectedFilter.part) {
      result = result.filter(c => (c.part?.trim() || "Uspesifisert") === selectedFilter.part);
    }
    if (selectedFilter.taskNum) {
      result = result.filter(c => {
        const match = c.name.match(/(\d+)/);
        return match ? match[1] === selectedFilter.taskNum : c.name === selectedFilter.taskNum;
      });
    }
    return result;
  }, [selectedFilter, criteria]);

  const handleFieldChange = (criterionName: string, field: keyof RubricCriterion, value: any) => {
    if (!activeProject.rubric || !updateActiveProject) return;
    const newCriteria = activeProject.rubric.criteria.map(c => 
      c.name === criterionName ? { ...c, [field]: value } : c
    );
    const newRubric = { ...activeProject.rubric, criteria: newCriteria };
    const totalMaxPoints = newCriteria.reduce((acc, c) => acc + Number(c.maxPoints || 0), 0);
    updateActiveProject({ rubric: { ...newRubric, totalMaxPoints } });
  };

  if (rubricStatus.loading && !activeProject.rubric) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
        <Spinner size="w-12 h-12" />
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Genererer rettemanual</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">Analyserer deloppgaver med Gemini 3 Pro...</p>
        </div>
      </div>
    );
  }

  if (!activeProject.rubric) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
        <div className="text-6xl grayscale opacity-30">📋</div>
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Ingen rettemanual</h2>
        <button onClick={handleGenerateRubric} className="bg-indigo-600 text-white px-10 py-4 rounded-full font-black text-xs uppercase shadow-lg">Generer nå</button>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-slate-50/50">
      <aside className="w-64 bg-white border-r flex flex-col shrink-0 no-print">
        <div className="p-6 border-b bg-slate-50/30">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Filtrering</h3>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          <button 
            onClick={() => setSelectedFilter({ part: null, taskNum: null })}
            className={`w-full text-left px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${!selectedFilter.part && !selectedFilter.taskNum ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Alle oppgaver
          </button>
          
          {sortedPartKeys.map(partKey => (
            <div key={partKey} className="space-y-2">
              <div className="px-4 text-[9px] font-black text-indigo-400 uppercase tracking-widest border-b border-indigo-50 pb-1 mt-4">{partKey}</div>
              <div className="grid grid-cols-4 gap-1.5 px-1">
                {groupedByPartAndMainTask[partKey].map(num => (
                  <button 
                    key={num}
                    onClick={() => setSelectedFilter({ part: partKey, taskNum: num })}
                    className={`h-9 rounded-lg font-black text-[10px] transition-all border flex items-center justify-center ${selectedFilter.taskNum === num && selectedFilter.part === partKey ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-500 border-slate-100 hover:border-indigo-200'}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-4 border-t">
           <button onClick={handleGenerateRubric} disabled={rubricStatus.loading} className="w-full py-3 rounded-xl border border-dashed text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-all">
             {rubricStatus.loading ? <Spinner size="w-3 h-3 mx-auto" /> : 'Oppdater KI ↻'}
           </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-5xl mx-auto space-y-8 pb-32">
          
          <header className="bg-white p-8 md:p-10 rounded-[40px] shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight">
                  {activeProject.rubric.title}
                </h2>
                <div className="flex gap-2 mt-3">
                   <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] bg-indigo-50 px-3 py-1 rounded-full whitespace-nowrap">
                      {selectedFilter.taskNum ? `Hovedoppgave ${selectedFilter.taskNum}` : selectedFilter.part || 'Full oversikt'}
                   </span>
                   {selectedFilter.part && (
                     <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] bg-emerald-50 px-3 py-1 rounded-full whitespace-nowrap">
                        {selectedFilter.part}
                     </span>
                   )}
                </div>
              </div>
              <div className="shrink-0 bg-slate-50 px-6 py-4 rounded-[25px] border border-slate-100 min-w-[120px] text-center">
                <div className="text-3xl font-black text-indigo-600 leading-none">{activeProject.rubric.totalMaxPoints.toFixed(1)}</div>
                <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">Poeng totalt</div>
              </div>
            </div>
          </header>

          <div className="space-y-12">
            {sortedPartKeys.filter(pk => !selectedFilter.part || pk === selectedFilter.part).map(partKey => {
              const partCriteria = filteredCriteria.filter(c => (c.part?.trim() || "Uspesifisert") === partKey);
              if (partCriteria.length === 0) return null;
              
              return (
                <div key={partKey} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-[11px] font-black uppercase text-slate-300 tracking-[0.3em]">{partKey}</h3>
                    <div className="h-px bg-slate-100 flex-1"></div>
                  </div>
                  
                  <div className="space-y-10">
                    {partCriteria.map((crit) => {
                      const isEditing = editingId === crit.name;
                      const isEditingErrors = editingErrorsId === crit.name;
                      const taskDisplay = crit.name.toUpperCase();

                      return (
                        <div key={crit.name} className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500">
                          
                          <div className="px-8 md:px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20 flex-wrap gap-6">
                            <div className="flex items-center gap-6 min-w-0 flex-1">
                              <div className="w-16 h-14 md:w-20 md:h-16 rounded-[20px] bg-slate-800 text-white flex flex-col items-center justify-center shadow-lg shrink-0 overflow-hidden">
                                <span className="text-[8px] font-black opacity-40 uppercase tracking-tighter mb-0.5">{crit.part}</span>
                                <span className="text-base md:text-lg font-black leading-none">{taskDisplay}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <input value={crit.tema || ""} placeholder="Tema..." onChange={e => handleFieldChange(crit.name, 'tema', e.target.value)} className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-transparent outline-none w-full mb-1" />
                                <input value={crit.description} onChange={e => handleFieldChange(crit.name, 'description', e.target.value)} className="text-lg md:text-xl font-bold text-slate-700 bg-transparent outline-none w-full focus:bg-white focus:ring-4 focus:ring-indigo-50 rounded-xl transition-all" />
                              </div>
                            </div>
                            <div className="flex gap-4 items-center shrink-0">
                              <div className="text-center">
                                <input 
                                  type="number" 
                                  step="0.5"
                                  value={crit.maxPoints} 
                                  onChange={e => handleFieldChange(crit.name, 'maxPoints', Number(e.target.value) || 0)} 
                                  className="text-2xl md:text-3xl font-black text-indigo-600 w-16 text-center bg-transparent outline-none" 
                                />
                                <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Maks</div>
                              </div>
                            </div>
                          </div>

                          <div className="p-8 md:p-10">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                              <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                                    <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Løsningsforslag</h4>
                                  </div>
                                  <button onClick={() => setEditingId(isEditing ? null : crit.name)} className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full border transition-all ${isEditing ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`}>
                                    {isEditing ? 'Lagre ✓' : 'Rediger ✎'}
                                  </button>
                                </div>
                                <div className={`rounded-[30px] p-8 md:p-10 border min-h-[180px] transition-all ${isEditing ? 'bg-white border-indigo-200 ring-8 ring-indigo-50/50' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                                  {isEditing ? (
                                    <textarea value={crit.suggestedSolution} autoFocus onChange={e => handleFieldChange(crit.name, 'suggestedSolution', e.target.value)} className="w-full bg-transparent outline-none text-[15px] font-medium text-slate-600 resize-none h-48 leading-relaxed custom-scrollbar" placeholder="Skriv LaTeX her..." />
                                  ) : (
                                    <LatexRenderer content={crit.suggestedSolution} className="text-slate-800 text-[15px] md:text-[16px]" />
                                  )}
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
                                    <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Retteveiledning</h4>
                                  </div>
                                  <button onClick={() => setEditingErrorsId(isEditingErrors ? null : crit.name)} className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full border transition-all ${isEditingErrors ? 'bg-rose-600 text-white shadow-md' : 'text-rose-600 border-rose-100 hover:bg-rose-50'}`}>
                                    {isEditingErrors ? 'Lagre ✓' : 'Rediger ✎'}
                                  </button>
                                </div>
                                <div className={`rounded-[30px] p-8 md:p-10 border min-h-[180px] transition-all ${isEditingErrors ? 'bg-white border-rose-200 ring-8 ring-rose-50/50' : 'bg-rose-50/5 border-rose-100/30 shadow-inner'}`}>
                                  {isEditingErrors ? (
                                    <textarea value={crit.commonErrors || ""} autoFocus onChange={e => handleFieldChange(crit.name, 'commonErrors', e.target.value)} className="w-full bg-transparent outline-none text-[15px] font-bold text-slate-700 placeholder:text-rose-200/50 resize-none h-48 leading-relaxed custom-scrollbar" placeholder="Beskriv poengtrekk her..." />
                                  ) : (
                                    <LatexRenderer content={crit.commonErrors || "Ingen spesifikk retteveiledning."} className="text-slate-700 font-bold text-[15px]" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};
