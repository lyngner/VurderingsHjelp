
import React, { useState, useMemo } from 'react';
import { Project, Rubric, RubricCriterion } from '../types';
import { LatexRenderer, Spinner } from './SharedUI';

interface RubricStepProps {
  activeProject: Project;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
  updateActiveProject?: (updates: Partial<Project>) => void;
}

interface GroupedData {
  part: string;
  tasks: Record<string, RubricCriterion[]>;
}

export const RubricStep: React.FC<RubricStepProps> = ({
  activeProject,
  handleGenerateRubric,
  rubricStatus,
  updateActiveProject
}) => {
  const [selectedFilter, setSelectedFilter] = useState<{ part: string | null; taskNum: string | null }>({ part: null, taskNum: null });

  const criteria = activeProject.rubric?.criteria || [];

  // Grupperer alt etter Part -> Task Number
  const groupedByPartAndTask = useMemo(() => {
    const parts: Record<string, Record<string, RubricCriterion[]>> = {};
    
    criteria.forEach(c => {
      const partKey = c.part || "Uspesifisert";
      const match = c.name.match(/^(\d+)/);
      const taskKey = match ? match[1] : (c.name || "Annet");
      
      if (!parts[partKey]) parts[partKey] = {};
      if (!parts[partKey][taskKey]) parts[partKey][taskKey] = [];
      parts[partKey][taskKey].push(c);
    });
    
    return parts;
  }, [criteria]);

  const sortedPartKeys = Object.keys(groupedByPartAndTask).sort();

  const filteredCriteria = useMemo(() => {
    if (!selectedFilter.part && !selectedFilter.taskNum) return criteria;
    
    let result = criteria;
    if (selectedFilter.part) {
      result = result.filter(c => (c.part || "Uspesifisert") === selectedFilter.part);
    }
    if (selectedFilter.taskNum) {
      result = result.filter(c => {
        const match = c.name.match(/^(\d+)/);
        const num = match ? match[1] : (c.name || "Annet");
        return num === selectedFilter.taskNum;
      });
    }
    return result;
  }, [selectedFilter, criteria]);

  const updateRubric = (newRubric: Rubric) => {
    if (updateActiveProject) {
      const totalMaxPoints = newRubric.criteria.reduce((acc, c) => acc + Number(c.maxPoints || 0), 0);
      updateActiveProject({ rubric: { ...newRubric, totalMaxPoints } });
    }
  };

  const handleFieldChange = (criterionName: string, field: keyof RubricCriterion, value: any) => {
    if (!activeProject.rubric) return;
    const newCriteria = activeProject.rubric.criteria.map(c => 
      c.name === criterionName ? { ...c, [field]: value } : c
    );
    updateRubric({ ...activeProject.rubric, criteria: newCriteria });
  };

  if (rubricStatus.loading && !activeProject.rubric) {
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
    <div className="flex h-full overflow-hidden bg-slate-50/50">
      {/* Sidebar for filtrering */}
      <aside className="w-72 bg-white border-r flex flex-col shrink-0 no-print">
        <div className="p-6 border-b bg-slate-50/30">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Oppgaveoversikt</h3>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <button 
            onClick={() => setSelectedFilter({ part: null, taskNum: null })}
            className={`w-full text-left p-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${!selectedFilter.part && !selectedFilter.taskNum ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-50 text-slate-500'}`}
          >
            Vis alle oppgaver
          </button>

          {sortedPartKeys.map(partKey => (
            <div key={partKey} className="space-y-1">
              <button 
                onClick={() => setSelectedFilter({ part: partKey, taskNum: null })}
                className={`w-full text-left px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedFilter.part === partKey && !selectedFilter.taskNum ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-400'}`}
              >
                {partKey}
              </button>
              <div className="grid grid-cols-2 gap-2 pl-2">
                {Object.keys(groupedByPartAndTask[partKey]).sort((a,b) => parseInt(a)-parseInt(b)).map(taskNum => (
                  <button 
                    key={taskNum}
                    onClick={() => setSelectedFilter({ part: partKey, taskNum: taskNum })}
                    className={`text-left p-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${selectedFilter.part === partKey && selectedFilter.taskNum === taskNum ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-500 border-slate-100 hover:border-indigo-200'}`}
                  >
                    Oppg. {taskNum}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-6 border-t">
           <button 
             onClick={handleGenerateRubric}
             disabled={rubricStatus.loading}
             className="w-full py-3 rounded-xl border border-dashed border-slate-200 text-[9px] font-black uppercase text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-all"
           >
             {rubricStatus.loading ? <Spinner size="w-3 h-3 mx-auto" /> : 'Oppdater fra KI'}
           </button>
        </div>
      </aside>

      {/* Hovedinnhold */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-5xl mx-auto space-y-8 pb-32">
          
          <header className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-100 flex justify-between items-end relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 leading-tight">{activeProject.rubric.title}</h2>
              <p className="text-slate-400 font-bold uppercase text-[10px] mt-2 tracking-widest">
                {selectedFilter.taskNum ? `Viser Oppgave ${selectedFilter.taskNum}` : selectedFilter.part ? `Viser ${selectedFilter.part}` : 'Fullstendig Rettemanual'}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Totalt</span>
              <div className="text-3xl font-black text-indigo-600">{activeProject.rubric.totalMaxPoints} <span className="text-sm text-slate-300">POENG</span></div>
            </div>
          </header>

          <div className="space-y-12">
            {/* Vi kan vise overskrifter for delene hvis vi viser alt */}
            {sortedPartKeys.filter(pk => !selectedFilter.part || pk === selectedFilter.part).map(partKey => {
              const partCriteria = filteredCriteria.filter(c => (c.part || "Uspesifisert") === partKey);
              if (partCriteria.length === 0) return null;
              
              return (
                <div key={partKey} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-[12px] font-black uppercase text-indigo-400 tracking-[0.3em] shrink-0">{partKey}</h3>
                    <div className="h-px bg-slate-200 w-full"></div>
                  </div>
                  
                  <div className="space-y-6">
                    {partCriteria.map((crit, idx) => (
                      <div key={crit.name} className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                        
                        {/* Kort Header */}
                        <div className="px-10 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                          <div className="flex items-center gap-6">
                            <div className="w-14 h-14 rounded-2xl bg-slate-800 text-white flex items-center justify-center text-xl font-black shadow-lg">
                              {crit.name}
                            </div>
                            <div>
                              <input 
                                value={crit.tema || ""} 
                                placeholder="Legg til tema..."
                                onChange={e => handleFieldChange(crit.name, 'tema', e.target.value)}
                                className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-transparent outline-none focus:text-indigo-700 w-full"
                              />
                              <input 
                                value={crit.description} 
                                onChange={e => handleFieldChange(crit.name, 'description', e.target.value)}
                                placeholder="Oppgavebeskrivelse..."
                                className="text-lg font-bold text-slate-700 bg-transparent outline-none w-full"
                              />
                            </div>
                          </div>
                          <div className="flex flex-col items-center bg-white px-6 py-3 rounded-2xl shadow-inner border border-slate-100">
                            <input 
                              type="number" 
                              value={crit.maxPoints} 
                              onChange={e => handleFieldChange(crit.name, 'maxPoints', parseInt(e.target.value) || 0)}
                              className="text-2xl font-black text-indigo-600 w-16 text-center bg-transparent outline-none"
                            />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Maks Poeng</span>
                          </div>
                        </div>

                        {/* Kort Innhold */}
                        <div className="p-10">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            
                            {/* Venstre: Løsning */}
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Løsningsforslag (Fasit)</h4>
                              </div>
                              <div className="bg-slate-50 rounded-[30px] p-8 border border-slate-100 min-h-[150px] relative group">
                                <textarea 
                                  value={crit.suggestedSolution} 
                                  onChange={e => handleFieldChange(crit.name, 'suggestedSolution', e.target.value)}
                                  className="w-full bg-transparent outline-none text-[13px] font-medium text-slate-600 mb-6 resize-none border-b border-slate-200 focus:border-indigo-300 pb-2"
                                  rows={3}
                                />
                                <div className="pt-2">
                                  <LatexRenderer content={crit.suggestedSolution} className="text-slate-800 text-[15px]" />
                                </div>
                              </div>
                            </div>

                            {/* Høyre: Veiledning */}
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Vurderingsnotater & Vanlige Feil</h4>
                              </div>
                              <div className="bg-rose-50/20 rounded-[30px] p-8 border border-rose-100/30 min-h-[150px]">
                                <textarea 
                                  value={crit.commonErrors || ""} 
                                  placeholder="Beskriv typiske feilkilder og hvordan de påvirker poengsummen her..."
                                  onChange={e => handleFieldChange(crit.name, 'commonErrors', e.target.value)}
                                  className="w-full bg-transparent outline-none text-[13px] font-bold text-slate-700 placeholder:text-rose-200 resize-none h-full leading-relaxed"
                                  rows={8}
                                />
                              </div>
                            </div>

                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredCriteria.length === 0 && (
            <div className="py-20 text-center space-y-4 opacity-30">
              <div className="text-5xl">🔎</div>
              <p className="text-[10px] font-black uppercase tracking-widest">Ingen kriterier funnet for denne gruppen</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};
