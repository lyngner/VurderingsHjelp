
import React, { useState, useMemo } from 'react';
import { Project, Rubric, RubricCriterion } from '../types';
import { LatexRenderer, Spinner } from './SharedUI';
import { improveRubricWithStudentData } from '../services/geminiService';

interface RubricStepProps {
  activeProject: Project;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
  updateActiveProject?: (updates: Partial<Project>) => void;
  handleRegenerateCriterion: (name: string) => Promise<void>;
}

export const RubricStep: React.FC<RubricStepProps> = ({
  activeProject,
  handleGenerateRubric,
  rubricStatus,
  updateActiveProject,
  handleRegenerateCriterion
}) => {
  const [selectedTask, setSelectedTask] = useState<{ num: string, part: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [editingErrorsId, setEditingErrorsId] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState<string | null>(null);
  const [isImproving, setIsImproving] = useState(false);

  const criteria = activeProject.rubric?.criteria || [];

  const totals = useMemo(() => {
    const partSums: Record<string, number> = { "Del 1": 0, "Del 2": 0 };
    const taskSums: Record<string, number> = {};

    criteria.forEach(c => {
      const part = c.part || "Del 1";
      const groupKey = part.toLowerCase().includes("2") ? "Del 2" : "Del 1";
      const cleanNum = String(c.taskNumber || "").replace(/[^0-9]/g, '');
      const points = Number(c.maxPoints || 0);

      partSums[groupKey] += points;
      if (cleanNum) {
        const key = `${groupKey}-${cleanNum}`;
        taskSums[key] = (taskSums[key] || 0) + points;
      }
    });

    return { partSums, taskSums };
  }, [criteria]);

  const uniqueThemes = useMemo(() => {
    const themes = new Set<string>();
    criteria.forEach(c => {
      if (c.tema && c.tema.trim()) themes.add(c.tema.trim());
    });
    return Array.from(themes).sort();
  }, [criteria]);

  const groupedTaskNumbers = useMemo(() => {
    const groups: Record<string, Set<string>> = {
      "Del 1": new Set<string>(),
      "Del 2": new Set<string>()
    };
    
    criteria.forEach(c => {
      const part = c.part || "Del 1";
      const groupKey = part.toLowerCase().includes("2") ? "Del 2" : "Del 1";
      const cleanNum = String(c.taskNumber || "").replace(/[^0-9]/g, '');
      if (cleanNum) groups[groupKey].add(cleanNum);
    });
    
    return {
      del1: Array.from(groups["Del 1"]).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)),
      del2: Array.from(groups["Del 2"]).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))
    };
  }, [criteria]);

  const filteredCriteria = useMemo(() => {
    const sortCriteria = (list: RubricCriterion[]) => {
      return [...list].sort((a, b) => {
        const partA = (a.part || "Del 1").toLowerCase().includes("2") ? 2 : 1;
        const partB = (b.part || "Del 1").toLowerCase().includes("2") ? 2 : 1;
        if (partA !== partB) return partA - partB;
        const numA = parseInt(String(a.taskNumber).replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(String(b.taskNumber).replace(/[^0-9]/g, '')) || 0;
        if (numA !== numB) return numA - numB;
        return (a.subTask || "").localeCompare(b.subTask || "");
      });
    };

    if (!selectedTask) return sortCriteria(criteria);
    
    const filtered = criteria.filter(c => {
      const groupKey = (c.part || "Del 1").toLowerCase().includes("2") ? "Del 2" : "Del 1";
      const cleanNum = String(c.taskNumber || "").replace(/[^0-9]/g, '');
      return cleanNum === selectedTask.num && groupKey === selectedTask.part;
    });
    
    return sortCriteria(filtered);
  }, [selectedTask, criteria]);

  // Helper to generate a truly unique ID for editing state
  const getUniqueId = (c: RubricCriterion) => {
    return `${c.part || 'U'}-${c.taskNumber}-${c.subTask || ''}`;
  };

  const handleFieldChange = (crit: RubricCriterion, field: keyof RubricCriterion, value: any) => {
    if (!activeProject.rubric || !updateActiveProject) return;
    
    const newCriteria = activeProject.rubric.criteria.map(c => {
      // Robust matching based on content, as name might be undefined
      if (c.taskNumber === crit.taskNumber && 
          c.subTask === crit.subTask && 
          c.part === crit.part) {
        return { ...c, [field]: value };
      }
      return c;
    });

    const newRubric = { ...activeProject.rubric, criteria: newCriteria };
    const totalMaxPoints = newCriteria.reduce((acc, c) => acc + Number(c.maxPoints || 0), 0);
    updateActiveProject({ rubric: { ...newRubric, totalMaxPoints } });
  };

  const onRegenerate = async (name: string) => {
    setLocalLoading(name);
    await handleRegenerateCriterion(name);
    setLocalLoading(null);
  };

  const handleAnalyzeStudentErrors = async () => {
    if (!activeProject.rubric || !updateActiveProject) return;
    const completedCandidates = activeProject.candidates.filter(c => c.status === 'completed' || c.status === 'evaluated');
    
    if (completedCandidates.length === 0) {
      alert("Du må transkribere/godkjenne noen kandidater (Kontroll-steget) før du kan analysere feil.");
      return;
    }

    if (!confirm(`Vil du la KI analysere besvarelsene til ${completedCandidates.length} kandidater og oppdatere 'Vanlige feil' i rettemanualen? Dette kan ta litt tid.`)) return;

    setIsImproving(true);
    try {
      const improvedRubric = await improveRubricWithStudentData(activeProject.rubric, activeProject.candidates);
      updateActiveProject({ rubric: improvedRubric });
    } catch (e: any) {
      alert("Feil ved analyse: " + e.message);
    } finally {
      setIsImproving(false);
    }
  };

  if (rubricStatus.loading && !activeProject.rubric) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
        <Spinner size="w-12 h-12" />
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Genererer rettemanual</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">Analyserer oppgaver og løsninger...</p>
        </div>
      </div>
    );
  }

  if (!activeProject.rubric) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
        <div className="text-6xl grayscale opacity-30">📋</div>
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Ingen rettemanual</h2>
        <button onClick={handleGenerateRubric} className="bg-indigo-600 text-white px-10 py-4 rounded-full font-black text-xs uppercase shadow-lg hover:scale-105 transition-transform">Generer nå</button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F8FAFC]">
      <aside className="w-64 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full">
        <div className="p-4 border-b bg-white/80 shrink-0">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Navigasjon</h3>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar">
          <button 
            onClick={() => setSelectedTask(null)}
            className={`w-full text-left px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex justify-between items-center ${!selectedTask ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <span>Alle Oppgaver</span>
            <span className={`px-2 py-0.5 rounded-full text-[8px] ${!selectedTask ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {activeProject.rubric.totalMaxPoints.toFixed(1)} p
            </span>
          </button>
          
          {groupedTaskNumbers.del1.length > 0 && (
            <div className="space-y-2">
               <div className="flex justify-between items-center px-2">
                 <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">Del 1</h4>
                 <span className="text-[8px] font-black text-slate-300 uppercase">{totals.partSums["Del 1"].toFixed(1)} p</span>
               </div>
               <div className="space-y-1">
                 {groupedTaskNumbers.del1.map(num => {
                   const isActive = selectedTask?.num === num && selectedTask?.part === "Del 1";
                   const points = totals.taskSums[`Del 1-${num}`] || 0;
                   return (
                     <button 
                       key={`del1-${num}`}
                       onClick={() => setSelectedTask({ num, part: "Del 1" })}
                       className={`w-full text-left px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex justify-between items-center ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-indigo-50'}`}
                     >
                       <span>Oppgave {num}</span>
                       <span className={`text-[8px] opacity-60 ${isActive ? 'text-white' : 'text-slate-400'}`}>{points.toFixed(1)} p</span>
                     </button>
                   );
                 })}
               </div>
            </div>
          )}

          {groupedTaskNumbers.del2.length > 0 && (
            <div className="space-y-2">
               <div className="flex justify-between items-center px-2">
                 <h4 className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em]">Del 2</h4>
                 <span className="text-[8px] font-black text-slate-300 uppercase">{totals.partSums["Del 2"].toFixed(1)} p</span>
               </div>
               <div className="space-y-1">
                 {groupedTaskNumbers.del2.map(num => {
                   const isActive = selectedTask?.num === num && selectedTask?.part === "Del 2";
                   const points = totals.taskSums[`Del 2-${num}`] || 0;
                   return (
                     <button 
                       key={`del2-${num}`}
                       onClick={() => setSelectedTask({ num, part: "Del 2" })}
                       className={`w-full text-left px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex justify-between items-center ${isActive ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-emerald-50'}`}
                     >
                       <span>Oppgave {num}</span>
                       <span className={`text-[8px] opacity-60 ${isActive ? 'text-white' : 'text-slate-400'}`}>{points.toFixed(1)} p</span>
                     </button>
                   );
                 })}
               </div>
            </div>
          )}
        </nav>

        <div className="p-3 border-t bg-slate-50/50 shrink-0 space-y-2">
           <button 
             onClick={handleAnalyzeStudentErrors} 
             disabled={isImproving || rubricStatus.loading} 
             title="Lar KI analysere alle transkriberte elevsvar for å finne vanlige feil og oppdatere rettemanualen automatisk."
             className="w-full py-3 rounded-xl bg-purple-600 text-white font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
           >
             {isImproving ? <Spinner size="w-3 h-3" color="text-white" /> : '🧠 Analyser Elevfeil'}
           </button>
           
           <button 
             onClick={handleGenerateRubric} 
             disabled={rubricStatus.loading || isImproving} 
             title="Sletter alt og genererer en helt ny rettemanual fra oppgavefilene"
             className="w-full py-3 rounded-xl border border-dashed text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-white transition-all"
           >
             {rubricStatus.loading ? <Spinner size="w-3 h-3 mx-auto" /> : 'Lag helt ny manual ↻'}
           </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 h-full bg-[#F8FAFC]">
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
          
          <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600"></div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-slate-800 leading-tight tracking-tighter">
                   {activeProject.rubric.title}
                </h2>
                {uniqueThemes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {uniqueThemes.map(t => (
                      <span key={t} className="text-[9px] font-black text-indigo-500 uppercase tracking-wide bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100/50">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.1em]">
                      {selectedTask ? `Viser Oppgave ${selectedTask.num} (${selectedTask.part})` : 'Viser hele rettemanualen'}
                   </span>
                </div>
              </div>
              <div className="shrink-0 bg-slate-900 px-6 py-3 rounded-2xl shadow-lg text-center">
                <div className="text-2xl font-black text-white leading-none">{activeProject.rubric.totalMaxPoints.toFixed(1)}</div>
                <div className="text-[8px] font-black text-indigo-300 uppercase tracking-widest mt-1">Maks</div>
              </div>
            </div>
          </header>

          <div className="space-y-6">
            {filteredCriteria.map((crit, idx) => {
              const uniqueId = getUniqueId(crit);
              const isEditingHeader = editingHeaderId === uniqueId;
              const isEditingSolution = editingId === uniqueId;
              const isEditingErrors = editingErrorsId === uniqueId;
              const isLoading = localLoading === crit.name;
              const isDel2 = (crit.part || "").toLowerCase().includes('2');
              const cleanNum = String(crit.taskNumber || "").replace(/[^0-9]/g, '');
              const cleanSub = String(crit.subTask || "").toUpperCase().replace(/[^A-Z]/g, '');
              const badgeLabel = `${cleanNum}${cleanSub}`;

              return (
                <div key={uniqueId} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden relative">
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center gap-3 backdrop-blur-[2px] animate-in fade-in duration-300">
                      <Spinner size="w-10 h-10" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 animate-pulse">Oppdaterer oppgave...</p>
                    </div>
                  )}
                  <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/20 flex-wrap gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className={`w-12 h-12 rounded-xl text-white flex flex-col items-center justify-center shadow-lg shrink-0 ${isDel2 ? 'bg-emerald-600' : 'bg-slate-800'}`}>
                        <span className="text-[6px] font-black opacity-40 uppercase tracking-tighter mb-0.5">{isDel2 ? 'Del 2' : 'Del 1'}</span>
                        <div className="text-sm font-black leading-none">
                           {badgeLabel}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 group">
                        <div className="flex items-center justify-between mb-0.5">
                           <input 
                             value={crit.tema || ""} 
                             placeholder="TEMA..." 
                             onChange={e => handleFieldChange(crit, 'tema', e.target.value)} 
                             className={`text-[9px] font-black uppercase tracking-widest bg-transparent border-none outline-none w-full ${isDel2 ? 'text-emerald-600' : 'text-indigo-400'}`} 
                           />
                           <div className="flex gap-3 items-center">
                             <button 
                               onClick={() => onRegenerate(crit.name)} 
                               title="Be KI generere et nytt løsningsforslag for denne spesifikke oppgaven"
                               className="text-[8px] font-black uppercase text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-1"
                             >
                               ↻ Last inn på nytt
                             </button>
                             <button onClick={() => setEditingHeaderId(isEditingHeader ? null : uniqueId)} className="text-[8px] font-black uppercase text-slate-400 hover:underline transition-all">
                                {isEditingHeader ? 'LAGRE' : 'REDIGER'}
                             </button>
                           </div>
                        </div>
                        {isEditingHeader ? (
                          <input 
                            autoFocus
                            value={crit.description} 
                            onChange={e => handleFieldChange(crit, 'description', e.target.value)} 
                            className="text-lg font-bold text-slate-700 bg-white ring-2 ring-indigo-50 outline-none w-full rounded-lg p-2 transition-all border border-indigo-100" 
                          />
                        ) : (
                          <div className="text-lg font-bold text-slate-700 tracking-tight">
                            <LatexRenderer content={crit.description} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 items-center shrink-0">
                      <div className="text-center bg-white p-2 rounded-xl border shadow-sm">
                        <input 
                          type="number" 
                          step="0.5"
                          value={crit.maxPoints} 
                          onChange={e => handleFieldChange(crit, 'maxPoints', Number(e.target.value) || 0)} 
                          className={`text-xl font-black w-12 text-center bg-transparent outline-none ${isDel2 ? 'text-emerald-600' : 'text-indigo-600'}`} 
                        />
                        <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Poeng</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${isDel2 ? 'bg-emerald-400' : 'bg-indigo-400'}`}></div>
                            Løsningsforslag
                          </h4>
                          <button onClick={() => setEditingId(isEditingSolution ? null : uniqueId)} className="text-[9px] font-black uppercase text-indigo-500 hover:underline">
                            {isEditingSolution ? 'Fullfør' : 'Rediger'}
                          </button>
                        </div>
                        <div className={`rounded-xl p-6 border min-h-[150px] transition-all overflow-x-auto custom-scrollbar ${isEditingSolution ? 'bg-white border-indigo-200' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                          {isEditingSolution ? (
                            <textarea 
                              value={(crit.suggestedSolution || "").replace(/\\\\/g, '\\\\\n')} 
                              autoFocus 
                              onChange={e => handleFieldChange(crit, 'suggestedSolution', e.target.value)} 
                              className="w-full bg-transparent outline-none text-sm font-medium text-slate-600 resize-none h-48 leading-relaxed custom-scrollbar" 
                            />
                          ) : (
                            <LatexRenderer content={crit.suggestedSolution} className="text-slate-800 text-sm leading-relaxed" />
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-rose-400"></div>
                            Retteveiledning (Vanlige feil)
                          </h4>
                          <button onClick={() => setEditingErrorsId(isEditingErrors ? null : uniqueId)} className="text-[9px] font-black uppercase text-rose-500 hover:underline">
                            {isEditingErrors ? 'Fullfør' : 'Rediger'}
                          </button>
                        </div>
                        <div className={`rounded-xl p-6 border min-h-[150px] transition-all overflow-x-auto custom-scrollbar ${isEditingErrors ? 'bg-white border-rose-200' : 'bg-rose-50/5 border-rose-100/30 shadow-inner'}`}>
                          {isEditingErrors ? (
                            <textarea 
                              value={(crit.commonErrors || "").replace(/\\\\/g, '\\\\\n')} 
                              autoFocus 
                              onChange={e => handleFieldChange(crit, 'commonErrors', e.target.value)} 
                              className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 resize-none h-48 leading-relaxed custom-scrollbar" 
                            />
                          ) : (
                            <LatexRenderer content={crit.commonErrors || "Ingen spesifikke feil registrert ennå."} className="text-slate-700 font-bold text-sm leading-relaxed" />
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
      </main>
    </div>
  );
};
