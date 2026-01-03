
import React, { useMemo, useState } from 'react';
import { Project, Candidate, RubricCriterion, TaskEvaluation } from '../types';
import { Spinner, LatexRenderer } from './SharedUI';
import { saveCandidate } from '../services/storageService';

/**
 * Oppgaveanalyse Bar Chart (v6.2.2)
 * Viser gjennomsnittlig mestring per oppgave for gruppen, sortert etter Del 1 -> Del 2.
 */
const TaskAnalysisChart: React.FC<{ data: { label: string, percent: number, isDel2: boolean }[] }> = ({ data }) => {
  const height = 180;
  const width = Math.max(data.length * 45, 600); 
  const maxBarHeight = 140;

  return (
    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm overflow-x-auto custom-scrollbar h-full">
      <h3 className="text-xl font-black text-slate-800 mb-8 tracking-tighter">Oppgaveanalyse</h3>
      <div className="relative" style={{ height: `${height}px`, minWidth: `${width}px` }}>
        {[0, 25, 50, 75, 100].map(val => (
          <div key={val} className="absolute w-full border-t border-slate-100 flex items-center" style={{ bottom: `${(val / 100) * maxBarHeight + 25}px` }}>
            <span className="text-[8px] font-black text-slate-300 -ml-8 w-6 text-right">{val}</span>
          </div>
        ))}
        
        <div className="absolute inset-0 flex items-end justify-around pl-4">
          {data.map((item, i) => {
            const barHeight = (item.percent / 100) * maxBarHeight;
            const color = item.percent > 70 ? 'bg-emerald-400' : item.percent > 40 ? 'bg-amber-400' : 'bg-rose-400';
            const textColor = item.isDel2 ? 'text-emerald-600' : 'text-indigo-600';
            
            return (
              <div key={i} className="flex flex-col items-center group relative" style={{ width: '30px' }}>
                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[8px] font-black py-1 px-2 rounded-md pointer-events-none z-10">
                  {item.percent}%
                </div>
                <div className={`${color} w-6 rounded-t-lg transition-all duration-1000 ease-out shadow-sm group-hover:brightness-110`} style={{ height: `${barHeight}px` }}></div>
                <div className={`mt-2 text-[10px] font-black ${textColor} rotate-45 origin-left whitespace-nowrap`}>
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const SkillRadarChart: React.FC<{ 
  skills: { tema: string, value: number, avg: number }[],
  isGroupView?: boolean 
}> = ({ skills, isGroupView = false }) => {
  if (skills.length < 3) return <div className="p-10 text-center text-[10px] font-bold text-slate-400 uppercase">Minst 3 temaer kreves for diagram</div>;

  const size = 300;
  const center = size / 2;
  const radius = 100;
  const angleStep = (Math.PI * 2) / skills.length;

  const getPoints = (isAvg: boolean) => {
    return skills.map((s, i) => {
      const val = isAvg ? s.avg : s.value;
      const r = (val / 100) * radius;
      const x = center + r * Math.cos(i * angleStep - Math.PI / 2);
      const y = center + r * Math.sin(i * angleStep - Math.PI / 2);
      return `${x},${y}`;
    }).join(' ');
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-4 mb-4">
         {!isGroupView && (
           <div className="flex items-center gap-2">
              <div className="w-8 h-3 bg-indigo-500 rounded-sm border-2 border-indigo-200 print:border-slate-800 print:bg-slate-200"></div>
              <span className="text-[10px] font-black text-slate-500 uppercase">Deg</span>
           </div>
         )}
         <div className="flex items-center gap-2">
            <div className={`w-8 h-3 ${isGroupView ? 'bg-indigo-500 border-2 border-indigo-200' : 'border-t-2 border-dashed border-slate-300'} print:border-slate-800`}></div>
            <span className="text-[10px] font-black text-slate-400 uppercase">{isGroupView ? 'Snitt' : 'Snitt'}</span>
         </div>
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible print:scale-90">
        {[0.2, 0.4, 0.6, 0.8, 1].map((p, i) => {
          const points = skills.map((_, idx) => {
            const r = p * radius;
            const x = center + r * Math.cos(idx * angleStep - Math.PI / 2);
            const y = center + r * Math.sin(idx * angleStep - Math.PI / 2);
            return `${x},${y}`;
          }).join(' ');
          return <polygon key={i} points={points} fill="none" stroke="#e2e8f0" strokeWidth="1" className="print:stroke-slate-300" />;
        })}
        
        {skills.map((s, i) => {
          const x2 = center + radius * Math.cos(i * angleStep - Math.PI / 2);
          const y2 = center + radius * Math.sin(i * angleStep - Math.PI / 2);
          const lx = center + (radius + 35) * Math.cos(i * angleStep - Math.PI / 2);
          const ly = center + (radius + 20) * Math.sin(i * angleStep - Math.PI / 2);
          return (
            <g key={i}>
              <line x1={center} y1={center} x2={x2} y2={y2} stroke="#e2e8f0" strokeWidth="1" className="print:stroke-slate-300" />
              <text x={lx} y={ly} textAnchor="middle" className="text-[9px] font-black fill-slate-500 uppercase print:fill-slate-800">{s.tema}</text>
            </g>
          );
        })}

        {!isGroupView && <polygon points={getPoints(true)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4,2" className="print:stroke-slate-400" />}
        <polygon 
          points={getPoints(false)} 
          fill={isGroupView ? "rgba(99, 102, 241, 0.2)" : "rgba(99, 102, 241, 0.2)"} 
          stroke={isGroupView ? "#6366f1" : "#6366f1"} 
          strokeWidth="3" 
          className="print:stroke-slate-800 print:fill-slate-200" 
        />
      </svg>
    </div>
  );
};

interface PrintConfig {
  showGrade: boolean;
  showScore: boolean;
  showRadar: boolean;
  showGrowth: boolean;
  showFeedback: boolean;
  showTable: boolean;
}

interface ResultsStepProps {
  activeProject: Project;
  selectedResultCandidateId: string | null;
  setSelectedResultCandidateId: (id: string | null) => void;
  handleEvaluateAll: (force?: boolean) => void;
  handleEvaluateCandidate: (id: string) => void;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
}

export const ResultsStep: React.FC<ResultsStepProps> = ({
  activeProject,
  selectedResultCandidateId,
  setSelectedResultCandidateId,
  handleEvaluateAll,
  handleEvaluateCandidate,
  handleGenerateRubric,
  rubricStatus
}) => {
  const [candidateFilter, setCandidateFilter] = useState('');
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [showUnknowns, setShowUnknowns] = useState(false);
  const [isEditingFeedback, setIsEditingFeedback] = useState(false);
  const [tempFeedback, setTempFeedback] = useState('');
  
  const [printConfig, setPrintConfig] = useState<PrintConfig>({
    showGrade: true,
    showScore: true,
    showRadar: true,
    showGrowth: true,
    showFeedback: true,
    showTable: true
  });

  const candidates = activeProject?.candidates || [];
  
  const filteredCandidates = useMemo(() => {
    let filtered = candidates.filter(c => 
      !candidateFilter || c.name.toLowerCase().includes(candidateFilter.toLowerCase())
    );

    if (!showUnknowns) {
      filtered = filtered.filter(c => {
        const isUnknown = c.name.toLowerCase().includes("ukjent");
        const hasPoints = (c.evaluation?.score || 0) > 0;
        return !isUnknown || hasPoints;
      });
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [candidates, candidateFilter, showUnknowns]);

  const currentCandidate = useMemo(() => 
    candidates.find(c => c.id === selectedResultCandidateId), 
    [candidates, selectedResultCandidateId]
  );

  // Helper to check for missing tasks and completeness
  const getCandidateStatus = (candidate: Candidate) => {
    if (!activeProject.rubric) return { missing: [], isComplete: false, foundTasks: [] };

    const rubricTasks = activeProject.rubric.criteria.map(c => `${c.taskNumber}${c.subTask || ''}`);
    const foundTasks = new Set<string>();
    const foundTasksDetails: { label: string, isDel2: boolean }[] = [];

    candidate.pages.forEach(p => {
      const isDel2 = (p.part || "Del 1").toLowerCase().includes("2");
      p.identifiedTasks?.forEach(t => {
        const label = `${t.taskNumber}${t.subTask || ''}`;
        if (rubricTasks.includes(label)) {
          if (!foundTasks.has(label)) {
            foundTasks.add(label);
            foundTasksDetails.push({ label, isDel2 });
          }
        }
      });
    });

    const missing = rubricTasks.filter(t => !foundTasks.has(t));
    
    // Sort found tasks for display
    const sortedFound = foundTasksDetails.sort((a,b) => {
      const numA = parseInt(a.label.replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(b.label.replace(/[^0-9]/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return a.label.localeCompare(b.label);
    });

    return { 
      missing, 
      isComplete: missing.length === 0 && rubricTasks.length > 0, 
      foundTasks: sortedFound 
    };
  };

  const handleSafeEvaluation = (candidateId: string) => {
    const cand = candidates.find(c => c.id === candidateId);
    if (!cand) return;

    const { missing } = getCandidateStatus(cand);
    
    if (missing.length > 0) {
      if (!confirm(`ADVARSEL: Kandidaten mangler ${missing.length} oppgaver i forhold til rettemanualen (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}).\n\nDette kan gi lavere score enn fortjent. Vil du fortsette vurderingen likevel?`)) {
        return;
      }
    }
    handleEvaluateCandidate(candidateId);
  };

  const stats = useMemo(() => {
    const evaluated = candidates.filter(c => c.status === 'evaluated' && c.evaluation);
    if (evaluated.length === 0) return null;
    const totalScore = evaluated.reduce((acc, c) => acc + (c.evaluation?.score || 0), 0);
    const grades = evaluated.reduce((acc: Record<string, number>, c) => {
      const g = c.evaluation?.grade || '?';
      acc[g] = (acc[g] || 0) + 1;
      return acc;
    }, {});
    return {
      count: evaluated.length,
      avgScore: (totalScore / evaluated.length).toFixed(1),
      maxPoints: activeProject.rubric?.totalMaxPoints || 0,
      gradeDist: grades
    };
  }, [candidates, activeProject.rubric]);

  const taskAnalysisData = useMemo(() => {
    if (!activeProject.rubric) return [];
    const evaluated = candidates.filter(c => c.status === 'evaluated' && c.evaluation);
    if (evaluated.length === 0) return [];

    const sortedCriteria = [...activeProject.rubric.criteria].sort((a, b) => {
      const isDel2A = (a.part || "").toLowerCase().includes("2");
      const isDel2B = (b.part || "").toLowerCase().includes("2");
      if (isDel2A !== isDel2B) return isDel2A ? 1 : -1;
      const numA = parseInt(String(a.taskNumber).replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(String(b.taskNumber).replace(/[^0-9]/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return (a.subTask || "").localeCompare(b.subTask || "");
    });

    return sortedCriteria.map(crit => {
      const taskLabel = `${crit.taskNumber}${crit.subTask}`;
      let totalPoints = 0;
      let count = 0;
      evaluated.forEach(c => {
        const match = c.evaluation?.taskBreakdown.find(t => `${t.taskNumber}${t.subTask}` === taskLabel);
        if (match) {
          totalPoints += match.score;
          count++;
        }
      });
      const avgPercent = crit.maxPoints > 0 ? Math.round(((totalPoints / (count || 1)) / crit.maxPoints) * 100) : 0;
      return { 
        label: taskLabel, 
        percent: avgPercent,
        isDel2: (crit.part || "").toLowerCase().includes("2")
      };
    });
  }, [activeProject.rubric, candidates]);

  const uniqueThemes = useMemo(() => {
    if (!activeProject.rubric) return [];
    const themes = new Set<string>();
    activeProject.rubric.criteria.forEach(c => {
      if (c.tema && c.tema.trim() !== "") {
        themes.add(c.tema.trim());
      }
    });
    return Array.from(themes).sort();
  }, [activeProject.rubric]);

  const averageSkills = useMemo(() => {
    if (uniqueThemes.length === 0) return {};
    const evaluated = candidates.filter(c => c.status === 'evaluated' && c.evaluation);
    const themeMap: Record<string, { total: number, max: number }> = {};
    uniqueThemes.forEach(t => themeMap[t] = { total: 0, max: 0 });
    evaluated.forEach(c => {
      c.evaluation?.taskBreakdown.forEach(t => {
        const tema = t.tema?.trim();
        if (tema && themeMap[tema]) {
          themeMap[tema].total += t.score;
          themeMap[tema].max += t.max;
        }
      });
    });
    const results: Record<string, number> = {};
    Object.entries(themeMap).forEach(([tema, val]) => {
      if (val.max > 0) results[tema] = Math.round((val.total / val.max) * 100);
    });
    return results;
  }, [candidates, uniqueThemes]);

  const groupRadarData = useMemo(() => {
    return uniqueThemes.map(t => ({
      tema: t,
      value: averageSkills[t] || 0,
      avg: averageSkills[t] || 0 // For group chart, we just use the average as the main value
    }));
  }, [uniqueThemes, averageSkills]);

  const candidateSkills = useMemo(() => {
    if (!currentCandidate?.evaluation || uniqueThemes.length === 0) return [];
    const breakdown = currentCandidate.evaluation.taskBreakdown;
    const themeMap: Record<string, { total: number, max: number }> = {};
    uniqueThemes.forEach(t => themeMap[t] = { total: 0, max: 0 });
    breakdown.forEach(t => {
      const tema = t.tema?.trim();
      if (tema && themeMap[tema]) {
        themeMap[tema].total += t.score;
        themeMap[tema].max += t.max;
      }
    });
    return Object.entries(themeMap)
      .filter(([_, val]) => val.max > 0)
      .map(([tema, val]) => ({
        tema,
        value: Math.round((val.total / val.max) * 100),
        avg: averageSkills[tema] || 0
      }));
  }, [currentCandidate, averageSkills, uniqueThemes]);

  const handleUpdateFeedback = async () => {
    if (currentCandidate && currentCandidate.evaluation) {
      const updatedCandidate = {
        ...currentCandidate,
        evaluation: {
          ...currentCandidate.evaluation,
          feedback: tempFeedback
        }
      };
      await saveCandidate(updatedCandidate);
      activeProject.candidates = activeProject.candidates.map(c => c.id === updatedCandidate.id ? updatedCandidate : c);
      setIsEditingFeedback(false);
    }
  };

  const { del1Criteria, del2Criteria } = useMemo(() => {
    if (!activeProject.rubric) return { del1Criteria: [], del2Criteria: [] };
    const list = [...activeProject.rubric.criteria].sort((a, b) => {
      const numA = parseInt(String(a.taskNumber).replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(String(b.taskNumber).replace(/[^0-9]/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return (a.subTask || "").localeCompare(b.subTask || "");
    });
    return {
      del1Criteria: list.filter(c => !(c.part || "").includes("2")),
      del2Criteria: list.filter(c => (c.part || "").includes("2"))
    };
  }, [activeProject.rubric]);

  const renderUnifiedMatrix = () => {
    const allCriteria = [...del1Criteria, ...del2Criteria];
    if (allCriteria.length === 0) return null;

    return (
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-lg overflow-hidden mb-12 print:hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-full">
            <thead>
              {/* NEW HEADER ROW FOR SECTIONS */}
              <tr>
                <th className="bg-white border-r border-slate-100 sticky left-0 z-20"></th>
                {del1Criteria.length > 0 && (
                  <th colSpan={del1Criteria.length} className="bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em] text-center py-2 border-r border-indigo-700">Del 1</th>
                )}
                {del2Criteria.length > 0 && (
                  <th colSpan={del2Criteria.length} className="bg-emerald-600 text-white text-[9px] font-black uppercase tracking-[0.2em] text-center py-2">Del 2</th>
                )}
                <th className="bg-slate-100"></th>
              </tr>
              {/* EXISTING COLUMN HEADERS */}
              <tr className="bg-slate-50 text-slate-400">
                <th className="px-4 py-4 text-[8px] font-black uppercase tracking-widest border-r border-slate-100 sticky left-0 bg-slate-50 z-10 w-20">KAND</th>
                {allCriteria.map(crit => {
                  const isDel2 = (crit.part || "").includes("2");
                  return (
                    <th key={crit.name} className={`px-1 py-4 text-center border-r border-slate-100 min-w-[38px] ${isDel2 ? 'bg-emerald-50/50' : 'bg-indigo-50/50'}`}>
                      <div className={`text-[9px] font-black leading-none ${isDel2 ? 'text-emerald-700' : 'text-indigo-700'}`}>
                        {crit.taskNumber}{crit.subTask}
                      </div>
                    </th>
                  );
                })}
                <th className="px-4 py-4 text-center text-[8px] font-black uppercase tracking-widest text-indigo-600 bg-slate-100/50">SUM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCandidates.map((c, idx) => {
                const isEvaluated = c.status === 'evaluated' && c.evaluation;
                const totalScore = isEvaluated ? c.evaluation?.score : 0;

                return (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors group ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}>
                    <td className="px-4 py-2 border-r border-slate-50 sticky left-0 bg-inherit group-hover:bg-slate-50 z-10">
                      <div className="text-[11px] font-black text-slate-800">{c.name}</div>
                    </td>
                    {allCriteria.map(crit => {
                      const taskLabel = `${crit.taskNumber}${crit.subTask}`;
                      const evalMatch = c.evaluation?.taskBreakdown.find(tb => `${tb.taskNumber}${tb.subTask}` === taskLabel);
                      const isIdentified = c.pages.some(p => p.identifiedTasks?.some(it => `${it.taskNumber}${it.subTask}` === taskLabel));
                      
                      // v6.6.6: FORCE MAX POINTS FROM RUBRIC AS TRUTH
                      const score = evalMatch ? evalMatch.score : null;
                      const displayScore = (!isIdentified && score === null) ? '-' : (score !== null ? score.toString().replace('.', ',') : '-');
                      const isZeroValue = score === 0 && isIdentified;
                      const isOverLimit = score !== null && score > crit.maxPoints;

                      return (
                        <td key={crit.name} className="px-1 py-2 text-center border-r border-slate-50 font-bold text-[10px]">
                          <span className={isZeroValue ? 'text-rose-500 font-black' : isOverLimit ? 'text-amber-500 font-black' : 'text-slate-600'} title={isOverLimit ? `Overstiger maks (${crit.maxPoints})` : ''}>
                            {displayScore}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-center bg-indigo-50/20 group-hover:bg-indigo-50 transition-colors">
                      <div className="text-[11px] font-black text-indigo-700">
                        {isEvaluated ? totalScore?.toString().replace('.', ',') : '-'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#F8FAFC]">
      <aside className="w-64 bg-white border-r overflow-y-auto p-4 shrink-0 no-print flex flex-col shadow-sm">
        <div className="space-y-3 mb-8">
           <button 
             onClick={() => handleEvaluateAll(false)} 
             className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-3 ${rubricStatus.loading ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
           >
             {rubricStatus.loading ? '🛑 Stopp' : '🚀 Kjør Alle'}
           </button>
           <button 
             onClick={() => setSelectedResultCandidateId(null)}
             className={`w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${!selectedResultCandidateId ? 'bg-slate-800 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}
           >
             📊 Gruppeoversikt
           </button>
        </div>

        <div className="px-2 mb-3">
          <input 
            type="text" 
            placeholder="Søk..." 
            className="w-full bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 mb-2"
            value={candidateFilter}
            onChange={e => setCandidateFilter(e.target.value)}
          />
          <button 
            onClick={() => setShowUnknowns(!showUnknowns)} 
            className={`w-full text-[9px] font-black uppercase py-1.5 rounded-lg border transition-all ${showUnknowns ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'}`}
          >
            {showUnknowns ? 'Skjul tomme/ukjente' : 'Vis tomme/ukjente'}
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
          {filteredCandidates.map(c => {
            const isSelected = selectedResultCandidateId === c.id;
            const isEvaluated = c.status === 'evaluated' && c.evaluation;
            const { isComplete, foundTasks } = getCandidateStatus(c);

            return (
              <button 
                key={c.id} 
                onClick={() => setSelectedResultCandidateId(c.id)} 
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all relative group flex flex-col gap-1.5 ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white border-slate-100 hover:border-indigo-100'}`}
              >
                <div className="flex justify-between items-center w-full">
                  <div className="font-bold text-[10px] truncate max-w-[120px]">{c.name}</div>
                  <div className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${isEvaluated ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 text-slate-400'}`}>
                    {c.evaluation?.grade || (isEvaluated ? 'OK' : '-')}
                  </div>
                </div>
                
                {/* Badges & Complete Indicator */}
                {foundTasks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {foundTasks.slice(0, 5).map((t, i) => (
                      <span key={i} className={`text-[7px] font-black uppercase px-1 py-0.5 rounded leading-none ${t.isDel2 ? (isSelected ? 'bg-emerald-500/30' : 'bg-emerald-50 text-emerald-600') : (isSelected ? 'bg-indigo-500/30' : 'bg-indigo-50 text-indigo-500')}`}>
                        {t.label}
                      </span>
                    ))}
                    {foundTasks.length > 5 && <span className="text-[7px] opacity-50">...</span>}
                    {isComplete && (
                      <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                        KOMPLETT 🏆
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50/30 p-8 custom-scrollbar relative print:p-0 print:bg-white print:overflow-visible print:w-full">
        {!selectedResultCandidateId ? (
          <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex justify-between items-center">
              <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Resultater</h2>
                <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mt-2">Visuell Analyse v6.2.4</p>
              </div>
              <button onClick={() => window.print()} className="bg-indigo-600 px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:bg-indigo-700 no-print transition-all hover:scale-105">
                📄 Eksporter Rapport
              </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 h-full">
                <TaskAnalysisChart data={taskAnalysisData} />
              </div>
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-slate-900 p-8 rounded-[35px] text-white shadow-2xl flex flex-col justify-center">
                   <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Gruppesnitt</div>
                   <div className="text-6xl font-black">{stats?.avgScore || 0}</div>
                   <div className="text-lg font-bold text-slate-400 mt-2">av {stats?.maxPoints} mulige poeng</div>
                   <div className="mt-8 flex gap-4 border-t border-slate-800 pt-8">
                      {['1', '2', '3', '4', '5', '6'].map(g => (
                        <div key={g} className="text-center">
                           <div className="text-[10px] font-black text-indigo-300">{g}</div>
                           <div className="text-xl font-black">{stats?.gradeDist[g] || 0}</div>
                        </div>
                      ))}
                   </div>
                </div>
                
                {/* NYTT: Ferdighetsanalyse for hele gruppen */}
                <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-sm flex flex-col items-center">
                   <h3 className="text-[10px] font-black uppercase text-slate-800 tracking-[0.2em] mb-4">Ferdighetsanalyse (Gruppe)</h3>
                   <SkillRadarChart skills={groupRadarData} isGroupView={true} />
                </div>
              </div>
            </div>

            {renderUnifiedMatrix()}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-8 pb-32 animate-in slide-in-from-right-8 duration-500 print:max-w-none print:space-y-4 print:pb-0">
            {/* Header */}
            <header className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 flex justify-between items-center relative overflow-hidden print:shadow-none print:border-b print:border-t-0 print:border-x-0 print:rounded-none print:p-0 print:mb-4">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600 print:hidden"></div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter print:text-2xl">{currentCandidate?.name}</h2>
                <div className="flex items-center gap-4 mt-2 print:hidden">
                  <p className="text-slate-400 font-black uppercase text-[9px] tracking-[0.2em] flex items-center gap-2">
                    Til kandidaten
                  </p>
                  <button 
                    onClick={() => setShowPrintSettings(!showPrintSettings)}
                    className="text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-all no-print flex items-center gap-1 border px-2 py-1 rounded-lg"
                  >
                    ⚙️ Utskrift
                  </button>
                  <button 
                    onClick={() => currentCandidate && handleSafeEvaluation(currentCandidate.id)} 
                    disabled={rubricStatus.loading}
                    className="text-[9px] font-black uppercase text-indigo-600 hover:underline transition-all disabled:opacity-50 no-print"
                  >
                    🔄 Re-evaluér
                  </button>
                </div>
              </div>
              <div className="flex gap-6 items-center">
                {printConfig.showGrade && (
                  <div className="text-center bg-slate-900 text-white px-8 py-5 rounded-[28px] shadow-2xl print:bg-white print:text-black print:shadow-none print:border print:px-4 print:py-2 print:rounded-xl">
                    <div className="text-4xl font-black leading-none print:text-2xl">{currentCandidate?.evaluation?.grade || '-'}</div>
                    <div className="text-[8px] font-black uppercase mt-2 tracking-widest text-slate-500">Karakter</div>
                  </div>
                )}
                {printConfig.showScore && (
                  <div className="text-center bg-white border px-6 py-4 rounded-[24px] shadow-sm print:shadow-none print:px-4 print:py-2 print:rounded-xl">
                    <div className="text-2xl font-black leading-none text-indigo-600 print:text-xl print:text-black">{currentCandidate?.evaluation?.score || 0}</div>
                    <div className="text-[8px] font-black uppercase mt-2 tracking-widest text-slate-400">Poeng</div>
                  </div>
                )}
              </div>
            </header>

            {/* Print Settings Modal */}
            {showPrintSettings && (
              <div className="absolute top-24 left-8 z-50 bg-white p-6 rounded-2xl shadow-2xl border border-slate-100 no-print w-64 animate-in fade-in">
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 text-slate-400">Velg innhold</h4>
                <div className="space-y-3">
                  {Object.keys(printConfig).map(key => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-all">
                      <input 
                        type="checkbox" 
                        checked={printConfig[key as keyof PrintConfig]} 
                        onChange={() => setPrintConfig(prev => ({...prev, [key]: !prev[key as keyof PrintConfig]}))}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                      />
                      <span className="text-xs font-bold text-slate-700 capitalize">{key.replace('show', '')}</span>
                    </label>
                  ))}
                </div>
                <button onClick={() => setShowPrintSettings(false)} className="mt-4 w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded-xl text-[10px] font-black uppercase">Lukk</button>
              </div>
            )}

            {(rubricStatus.loading && rubricStatus.text.includes(currentCandidate?.name || '')) ? (
              <div className="bg-white p-24 rounded-[45px] text-center space-y-8 border-2 border-dashed border-slate-100">
                <Spinner size="w-12 h-12 mx-auto" color="text-indigo-400" />
                <p className="font-black uppercase text-[11px] text-slate-400 tracking-[0.3em] animate-pulse">Genererer individuell analyse...</p>
              </div>
            ) : currentCandidate?.status === 'evaluated' ? (
              <>
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 print:grid-cols-2 print:gap-4 ${(!printConfig.showRadar && !printConfig.showGrowth) ? 'hidden' : ''}`}>
                  {printConfig.showRadar && (
                    <section className="bg-white p-10 rounded-[45px] border border-slate-100 shadow-sm flex flex-col items-center print:shadow-none print:border print:rounded-xl print:p-4 print:bg-transparent">
                      <h3 className="font-black text-[13px] uppercase text-slate-800 tracking-[0.2em] mb-8 self-start print:mb-2 print:text-[10px]">Ferdighetsprofil</h3>
                      <SkillRadarChart skills={candidateSkills} />
                    </section>
                  )}

                  {printConfig.showGrowth && (
                    <section className="bg-emerald-50/50 p-10 rounded-[45px] border border-emerald-100 relative group overflow-hidden print:bg-transparent print:border print:border-slate-200 print:rounded-xl print:p-4 print:shadow-none">
                      <div className="absolute top-6 right-6 opacity-10 text-4xl group-hover:scale-110 transition-transform no-print">🌱</div>
                      <h3 className="font-black text-[13px] uppercase text-emerald-700 tracking-[0.2em] mb-8 print:text-black print:mb-4 print:text-[10px]">Vekstpunkter</h3>
                      <ul className="space-y-6 print:space-y-2">
                        {currentCandidate.evaluation?.vekstpunkter?.map((v, i) => (
                          <li key={i} className="flex gap-4 text-[16px] font-bold text-emerald-900 items-start print:text-[10px] print:text-black print:gap-2">
                            <span className="shrink-0 w-6 h-6 rounded-lg bg-emerald-200 flex items-center justify-center text-[10px] text-emerald-700 shadow-sm mt-1 print:hidden">✓</span> 
                            <span className="print:block hidden text-slate-800 mr-1">•</span>
                            <LatexRenderer content={v} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>

                {printConfig.showFeedback && (
                  <section className="bg-slate-900 p-12 rounded-[50px] text-white shadow-2xl relative overflow-hidden group print:bg-transparent print:text-black print:shadow-none print:p-0 print:rounded-none print:mb-4 print:border-t print:border-b print:py-4">
                     <div className="flex justify-between items-center mb-8 print:mb-2">
                       <h3 className="font-black text-[11px] uppercase text-indigo-400 tracking-[0.3em] print:text-black print:tracking-widest">Tilbakemelding</h3>
                       <button 
                         onClick={() => {
                           if (isEditingFeedback) handleUpdateFeedback();
                           else {
                             setTempFeedback(currentCandidate.evaluation?.feedback || "");
                             setIsEditingFeedback(true);
                           }
                         }} 
                         className="text-[9px] font-black uppercase text-indigo-300 hover:text-white transition-all border border-indigo-700 px-3 py-1 rounded-full no-print"
                       >
                         {isEditingFeedback ? 'Lagre' : 'Rediger'}
                       </button>
                     </div>
                     
                     {isEditingFeedback ? (
                       <textarea 
                         value={tempFeedback}
                         onChange={(e) => setTempFeedback(e.target.value)}
                         className="w-full h-64 bg-slate-800 text-white p-4 rounded-xl text-sm font-medium outline-none border border-slate-700"
                       />
                     ) : (
                       <div className="text-indigo-50 text-lg leading-relaxed font-medium print:text-black print:text-xs print:leading-normal">
                          <LatexRenderer content={currentCandidate.evaluation?.feedback || ""} />
                       </div>
                     )}
                  </section>
                )}

                {printConfig.showTable && (
                  <section className="bg-white rounded-[50px] border border-slate-100 shadow-xl overflow-hidden print:shadow-none print:rounded-none print:border-none">
                    <table className="w-full text-left print:text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest print:bg-white print:border-b print:text-black">
                          <th className="px-10 py-5 w-24 print:px-2 print:py-2">Oppgave</th>
                          <th className="px-10 py-5 print:px-2 print:py-2">Vurdering</th>
                          <th className="px-10 py-5 text-right w-32 print:px-2 print:py-2 print:w-16">Poeng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 print:divide-slate-200">
                        {currentCandidate.evaluation?.taskBreakdown.map((t, i) => {
                          // v6.6.6: LOOK UP REAL MAX POINTS FROM PROJECT RUBRIC
                          const rubricTask = activeProject.rubric?.criteria.find(c => `${c.taskNumber}${c.subTask}` === `${t.taskNumber}${t.subTask}`);
                          const realMax = rubricTask ? rubricTask.maxPoints : t.max;
                          
                          const isPerfect = t.score >= realMax;
                          const isOver = t.score > realMax;

                          return (
                            <tr key={i} className={`group transition-colors ${isPerfect ? 'opacity-60 hover:opacity-100 print:opacity-100' : 'bg-rose-50/10 print:bg-transparent'} print:break-inside-avoid`}>
                              <td className="px-10 py-8 print:px-2 print:py-1">
                                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[12px] shadow-sm ${isPerfect ? 'bg-slate-100 text-slate-500 print:bg-transparent print:text-black print:shadow-none print:border' : 'bg-indigo-600 text-white print:bg-transparent print:text-black print:border print:shadow-none'}`}>
                                   {t.taskNumber}{t.subTask}
                                 </div>
                              </td>
                              <td className="px-10 py-8 print:px-2 print:py-1">
                                <div className={`text-base leading-relaxed print:text-xs ${!isPerfect ? 'font-bold text-slate-800' : 'font-medium text-slate-500'}`}>
                                   <LatexRenderer content={t.comment} />
                                </div>
                              </td>
                              <td className={`px-10 py-8 text-right font-black text-lg tabular-nums print:px-2 print:py-1 print:text-xs ${isPerfect ? 'text-slate-400' : isOver ? 'text-amber-500' : 'text-indigo-600 print:text-black'}`}>
                                 {t.score.toString().replace('.', ',')} <span className="text-[10px] opacity-30 font-medium">/ {realMax}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                )}
              </>
            ) : (
              <div className="bg-white p-24 rounded-[50px] text-center space-y-8 border-2 border-dashed border-slate-100 shadow-sm">
                <div className="text-6xl grayscale opacity-20">📊</div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Kandidaten er ikke vurdert</h3>
                <button 
                  onClick={() => currentCandidate && handleSafeEvaluation(currentCandidate.id)} 
                  className="bg-indigo-600 text-white px-10 py-4 rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-xl no-print"
                >
                  🚀 Start Vurdering
                </button>
              </div>
            )}

            <div className="flex justify-center pt-12 no-print pb-20">
              <button onClick={() => setSelectedResultCandidateId(null)} className="group flex items-center gap-4 text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-all tracking-[0.2em]">
                ← Tilbake til gruppeoversikt
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
