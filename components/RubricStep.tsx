
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
  const [selectedTask, setSelectedTask] = useState<{ num: string, part: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [editingErrorsId, setEditingErrorsId] = useState<string | null>(null);

  const criteria = activeProject.rubric?.criteria || [];

  // Grupper hovedoppgaver (KUN tallet) etter Del 1 og Del 2
  const groupedTaskNumbers = useMemo(() => {
    const groups: Record<string, Set<string>> = {
      "Del 1": new Set<string>(),
      "Del 2": new Set<string>()
    };
    
    criteria.forEach(c => {
      const part = c.part || "Del 1";
      const groupKey = part.toLowerCase().includes("2") ? "Del 2" : "Del 1";
      groups[groupKey].add(c.taskNumber || c.name);
    });
    
    return {
      del1: Array.from(groups["Del 1"]).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)),
      del2: Array.from(groups["Del 2"]).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))
    };
  }, [criteria]);

  // Filtrer kriterier basert på valgt hovedoppgave
  const filteredCriteria = useMemo(() => {
    if (!selectedTask) return criteria;
    return criteria.filter(c => {
      const groupKey = (c.part || "Del 1").toLowerCase().includes("2") ? "Del 2" : "Del 1";
      return (c.taskNumber || c.name) === selectedTask.num && groupKey === selectedTask.part;
    });
  }, [selectedTask, criteria]);

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
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">Analyserer oppgaver og løsninger med Gemini 3 Pro...</p>
        </div>
      </div>
    );
  }

  if (!activeProject.rubric) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
        <div className="text-6xl grayscale opacity-30">📋</div>
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Ingen rettemanual</h2>
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest max-w-xs">Last opp oppgaveark i Innlasting-steget for å generere manual automatisk.</p>
        <button onClick={handleGenerateRubric} className="bg-indigo-600 text-white px-10 py-4 rounded-full font-black text-xs uppercase shadow-lg hover:scale-105 transition-transform">Generer nå</button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F8FAFC]">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full">
        <div className="p-6 border-b bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Rettemanual</h3>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
          <button 
            onClick={() => setSelectedTask(null)}
            className={`w-full text-left px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${!selectedTask ? 'bg-slate-800 text-white shadow-lg scale-[1.02]' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Alle Oppgaver
          </button>
          
          {groupedTaskNumbers.del1.length > 0 && (
            <div className="space-y-3">
               <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] px-2">Del 1</h4>
               <div className="space-y-1">
                 {groupedTaskNumbers.del1.map(num => {
                   const isActive = selectedTask?.num === num && selectedTask?.part === "Del 1";
                   return (
                     <button 
                       key={`del1-${num}`}
                       onClick={() => setSelectedTask({ num, part: "Del 1" })}
                       className={`w-full text-left px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}
                     >
                       Oppgave {num}
                     </button>
                   );
                 })}
               </div>
            </div>
          )}

          {groupedTaskNumbers.del2.length > 0 && (
            <div className="space-y-3">
               <h4 className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] px-2">Del 2</h4>
               <div className="space-y-1">
                 {groupedTaskNumbers.del2.map(num => {
                   const isActive = selectedTask?.num === num && selectedTask?.part === "Del 2";
                   return (
                     <button 
                       key={`del2-${num}`}
                       onClick={() => setSelectedTask({ num, part: "Del 2" })}
                       className={`w-full text-left px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isActive ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`}
                     >
                       Oppgave {num}
                     </button>
                   );
                 })}
               </div>
            </div>
          )}
        </nav>

        <div className="p-4 border-t bg-slate-50/50 shrink-0">
           <button onClick={handleGenerateRubric} disabled={rubricStatus.loading} className="w-full py-4 rounded-2xl border border-dashed text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-white transition-all">
             {rubricStatus.loading ? <Spinner size="w-3 h-3 mx-auto" /> : 'Regenerer Manual ↻'}
           </button>
        </div>
      </aside>

      {/* HOVEDINNHOLD */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-8 h-full bg-[#F8FAFC]">
        <div className="max-w-5xl mx-auto space-y-8 pb-32">
          
          <header className="bg-white p-10 rounded-[45px] shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-black text-slate-800 leading-tight tracking-tighter">
                  <LatexRenderer content={activeProject.rubric.title} />
                </h2>
                <div className="flex gap-2 mt-4">
                   <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100">
                      {selectedTask ? `Viser Oppgave ${selectedTask.num} (${selectedTask.part})` : 'Full oversikt'}
                   </span>
                </div>
              </div>
              <div className="shrink-0 bg-slate-900 px-8 py-5 rounded-[30px] shadow-xl text-center">
                <div className="text-4xl font-black text-white leading-none">{activeProject.rubric.totalMaxPoints.toFixed(1)}</div>
                <div className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mt-2">Maks Poeng</div>
              </div>
            </div>
          </header>

          <div className="space-y-12">
            {filteredCriteria.length === 0 ? (
              <div className="p-20 text-center border-2 border-dashed rounded-[45px] opacity-30">
                <p className="font-black uppercase tracking-widest text-xs">Ingen kriterier funnet for dette valget</p>
                <button onClick={handleGenerateRubric} className="mt-4 text-[9px] font-black uppercase text-indigo-600 hover:underline">Prøv å regenerere manualen</button>
              </div>
            ) : (
              filteredCriteria.map((crit) => {
                const isEditingHeader = editingHeaderId === crit.name;
                const isEditingSolution = editingId === crit.name;
                const isEditingErrors = editingErrorsId === crit.name;
                const isDel2 = crit.part?.toLowerCase().includes('2');
                
                // Sikker identifisering av oppgavenavn for ID-merket
                const badgeLabel = `${crit.taskNumber}${crit.subTask || ''}`.toUpperCase();

                return (
                  <div key={crit.name} className="bg-white rounded-[50px] shadow-sm border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-500">
                    
                    <div className="px-10 py-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/20 flex-wrap gap-8">
                      <div className="flex items-center gap-8 min-w-0 flex-1">
                        <div className={`w-20 h-20 rounded-[30px] text-white flex flex-col items-center justify-center shadow-2xl shrink-0 ${isDel2 ? 'bg-emerald-600' : 'bg-slate-800'}`}>
                          <span className="text-[9px] font-black opacity-40 uppercase tracking-tighter mb-1">{crit.part}</span>
                          <div className="text-xl font-black leading-none">
                            <LatexRenderer content={badgeLabel} />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 group">
                          <div className="flex items-center justify-between mb-2">
                             <input 
                               value={crit.tema || ""} 
                               placeholder="Skriv tema her..." 
                               onChange={e => handleFieldChange(crit.name, 'tema', e.target.value)} 
                               className={`text-[11px] font-black uppercase tracking-widest bg-transparent border-none outline-none w-full ${isDel2 ? 'text-emerald-600' : 'text-indigo-500'}`} 
                             />
                             <button onClick={() => setEditingHeaderId(isEditingHeader ? null : crit.name)} className="opacity-0 group-hover:opacity-100 text-[10px] font-black uppercase text-indigo-400 bg-white px-4 py-2 rounded-full shadow-sm border transition-all">
                                {isEditingHeader ? 'Lagre ✓' : 'Endre Tittel ✎'}
                             </button>
                          </div>
                          {isEditingHeader ? (
                            <input 
                              autoFocus
                              value={crit.description} 
                              onChange={e => handleFieldChange(crit.name, 'description', e.target.value)} 
                              className="text-2xl font-bold text-slate-700 bg-white ring-8 ring-indigo-50 outline-none w-full rounded-2xl p-4 transition-all border border-indigo-100" 
                            />
                          ) : (
                            <div className="text-2xl font-bold text-slate-700 tracking-tight">
                              <LatexRenderer content={crit.description} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-4 items-center shrink-0">
                        <div className="text-center bg-white p-4 rounded-3xl border shadow-sm">
                          <input 
                            type="number" 
                            step="0.5"
                            value={crit.maxPoints} 
                            onChange={e => handleFieldChange(crit.name, 'maxPoints', Number(e.target.value) || 0)} 
                            className={`text-3xl font-black w-20 text-center bg-transparent outline-none ${isDel2 ? 'text-emerald-600' : 'text-indigo-600'}`} 
                          />
                          <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Maks</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-10 md:p-12">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <h4 className="text-[12px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                              Løsningsforslag
                            </h4>
                            <button onClick={() => setEditingId(isEditingSolution ? null : crit.name)} className={`text-[11px] font-black uppercase px-6 py-2.5 rounded-full border transition-all ${isEditingSolution ? 'bg-indigo-600 text-white shadow-xl' : 'text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`}>
                              {isEditingSolution ? 'Lagre ✓' : 'Rediger ✎'}
                            </button>
                          </div>
                          <div className={`rounded-[40px] p-10 border min-h-[220px] transition-all overflow-x-auto custom-scrollbar ${isEditingSolution ? 'bg-white border-indigo-200 ring-8 ring-indigo-50/30' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                            {isEditingSolution ? (
                              <textarea value={crit.suggestedSolution} autoFocus onChange={e => handleFieldChange(crit.name, 'suggestedSolution', e.target.value)} className="w-full bg-transparent outline-none text-[16px] font-medium text-slate-600 resize-none h-64 leading-relaxed custom-scrollbar" placeholder="Skriv LaTeX her..." />
                            ) : (
                              <LatexRenderer content={crit.suggestedSolution} className="text-slate-800 text-[16px] leading-relaxed" />
                            )}
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <h4 className="text-[12px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                              Retteveiledning
                            </h4>
                            <button onClick={() => setEditingErrorsId(isEditingErrors ? null : crit.name)} className={`text-[11px] font-black uppercase px-6 py-2.5 rounded-full border transition-all ${isEditingErrors ? 'bg-rose-600 text-white shadow-xl' : 'text-rose-600 border-rose-100 hover:bg-rose-50'}`}>
                              {isEditingErrors ? 'Lagre ✓' : 'Rediger ✎'}
                            </button>
                          </div>
                          <div className={`rounded-[40px] p-10 border min-h-[220px] transition-all overflow-x-auto custom-scrollbar ${isEditingErrors ? 'bg-white border-rose-200 ring-8 ring-rose-50/30' : 'bg-rose-50/5 border-rose-100/30 shadow-inner'}`}>
                            {isEditingErrors ? (
                              <textarea value={crit.commonErrors || ""} autoFocus onChange={e => handleFieldChange(crit.name, 'commonErrors', e.target.value)} className="w-full bg-transparent outline-none text-[16px] font-bold text-slate-700 placeholder:text-rose-200/50 resize-none h-64 leading-relaxed custom-scrollbar" placeholder="Beskriv poengtrekk her..." />
                            ) : (
                              <LatexRenderer content={crit.commonErrors || "Ingen spesifikk retteveiledning generert."} className="text-slate-700 font-bold text-[16px] leading-relaxed" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
