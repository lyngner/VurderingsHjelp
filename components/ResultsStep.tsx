
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Project, Candidate, RubricCriterion, TaskEvaluation } from '../types';
import { Spinner, LatexRenderer } from './SharedUI';
import { saveCandidate, deleteCandidate } from '../services/storageService';
import { sanitizeTaskId, cleanTaskPair, calculateGrade } from '../services/geminiService';

interface PrintConfig {
  showGrade: boolean;
  showScore: boolean;
  showPercent: boolean;
  showFeedback: boolean;
  showRadar: boolean;
  showGrowth: boolean;
  showTable: boolean;
  showCommentsInTable: boolean;
}

const DEFAULT_PRINT_CONFIG: PrintConfig = {
  showGrade: true,
  showScore: true,
  showPercent: true,
  showFeedback: true,
  showRadar: true,
  showGrowth: true,
  showTable: true,
  showCommentsInTable: true
};

// v8.6.4: Print Settings Menu Component
const PrintSettingsMenu: React.FC<{ config: PrintConfig, onChange: (key: keyof PrintConfig) => void, onClose: () => void }> = ({ config, onChange, onClose }) => {
    return (
        <div className="absolute top-12 right-0 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50 w-64 animate-in fade-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 border-b border-slate-50 pb-2">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Utskriftinnhold</h4>
                <button onClick={onClose} className="text-slate-300 hover:text-slate-500">✕</button>
            </div>
            <div className="space-y-2">
                {[
                    { key: 'showGrade', label: 'Karakter' },
                    { key: 'showScore', label: 'Poengsum' },
                    { key: 'showPercent', label: 'Prosent' },
                    { key: 'showFeedback', label: 'Hovedkommentar' },
                    { key: 'showGrowth', label: 'Vekstpunkter' },
                    { key: 'showRadar', label: 'Ferdighetsprofil' },
                    { key: 'showTable', label: 'Oppgavetabell' }
                ].map(item => (
                    <label key={item.key} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-slate-50 rounded-lg transition-colors" onClick={(e) => { e.stopPropagation(); onChange(item.key as keyof PrintConfig); }}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${config[item.key as keyof PrintConfig] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                            {config[item.key as keyof PrintConfig] && <span className="text-white text-[10px] font-black">✓</span>}
                        </div>
                        <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">{item.label}</span>
                    </label>
                ))}
            </div>
        </div>
    );
};

const renderTaskLabel = (num: unknown, sub: unknown): string => {
    const pair = cleanTaskPair(String(num || ""), String(sub || ""));
    return `${pair.taskNumber}${pair.subTask}`;
};

const formatScore = (num: number): string => {
    return String(num).replace('.', ',');
};

const matchEvaluationToCriterion = (evalTask: TaskEvaluation, criterion: RubricCriterion): boolean => {
    const evalLabel = renderTaskLabel(evalTask.taskNumber, evalTask.subTask);
    const critLabel = renderTaskLabel(criterion.taskNumber, criterion.subTask);
    
    if (evalLabel !== critLabel) return false;

    if (evalTask.part) {
        const evalPart2 = String(evalTask.part).toLowerCase().includes("2");
        const critPart2 = String(criterion.part || "1").toLowerCase().includes("2");
        return evalPart2 === critPart2;
    }
    return true;
};

const getCandidatePartStatus = (candidate: Candidate, project: Project) => {
    if (!project.rubric) return { 
        d1: { status: 'missing', max: 0 }, 
        d2: { status: 'missing', max: 0 }, 
        totalMax: 0, 
        adjustedMax: 0, 
        isTotalComplete: false 
    };

    const rubricTasksD1 = new Set<string>();
    const rubricTasksD2 = new Set<string>();
    let maxD1 = 0;
    let maxD2 = 0;

    project.rubric.criteria.forEach(c => {
        const isD2 = (c.part || "Del 1").toLowerCase().includes("2");
        const label = renderTaskLabel(c.taskNumber, c.subTask);
        if (isD2) {
            rubricTasksD2.add(label);
            maxD2 += c.maxPoints || 0;
        } else {
            rubricTasksD1.add(label);
            maxD1 += c.maxPoints || 0;
        }
    });

    const foundD1 = new Set<string>();
    const foundD2 = new Set<string>();

    const hasPagesD1 = candidate.pages.some(p => !(p.part || "Del 1").toLowerCase().includes("2"));
    const hasPagesD2 = candidate.pages.some(p => (p.part || "").toLowerCase().includes("2"));

    candidate.pages.forEach(p => {
        const pPart = (p.part || "Del 1").toLowerCase().includes("2") ? "Del 2" : "Del 1";
        p.identifiedTasks?.forEach(t => {
             const label = renderTaskLabel(t.taskNumber, t.subTask);
             if (pPart === "Del 2") foundD2.add(label);
             else foundD1.add(label);
        });
    });

    if (candidate.evaluation?.taskBreakdown) {
        candidate.evaluation.taskBreakdown.forEach(t => {
            if (t.score > 0) {
                const label = renderTaskLabel(t.taskNumber, t.subTask);
                const inD1 = rubricTasksD1.has(label);
                const inD2 = rubricTasksD2.has(label);
                
                let isD2 = false;
                if (inD2 && !inD1) isD2 = true;
                else if (inD1 && !inD2) isD2 = false;
                else isD2 = String(t.part || "Del 1").toLowerCase().includes("2");
                
                if (isD2) foundD2.add(label);
                else foundD1.add(label);
            }
        });
    }

    const getStatus = (found: Set<string>, rubric: Set<string>, hasPages: boolean) => {
        if (rubric.size === 0) return 'none';
        if (found.size === 0) return hasPages ? 'partial' : 'missing';
        const allFound = Array.from(rubric).every(t => found.has(t));
        return allFound ? 'complete' : 'partial';
    };

    const d1Status = getStatus(foundD1, rubricTasksD1, hasPagesD1);
    const d2Status = getStatus(foundD2, rubricTasksD2, hasPagesD2);

    let adjustedMax = 0;
    if (d1Status !== 'missing') adjustedMax += maxD1;
    if (d2Status !== 'missing') adjustedMax += maxD2;
    if (adjustedMax === 0) adjustedMax = maxD1 + maxD2;

    return {
        d1: { status: d1Status, max: maxD1 },
        d2: { status: d2Status, max: maxD2 },
        totalMax: maxD1 + maxD2,
        adjustedMax,
        isTotalComplete: (d1Status === 'complete' || d1Status === 'none') && (d2Status === 'complete' || d2Status === 'none')
    };
};

const GroupStats: React.FC<{ candidates: Candidate[], project: Project }> = ({ candidates, project }) => {
  const evaluated = candidates.filter(c => c.status === 'evaluated' && c.evaluation);
  if (evaluated.length === 0) return null;

  const totalScore = evaluated.reduce((acc, c) => acc + (c.evaluation?.score || 0), 0);
  const avgScore = totalScore / evaluated.length;
  const grades = evaluated.map(c => parseInt(c.evaluation?.grade || "0") || 0).filter(g => g > 0);
  const avgGrade = grades.length > 0 ? grades.reduce((a,b) => a+b, 0) / grades.length : 0;

  const totalPercent = evaluated.reduce((acc, c) => {
      const { adjustedMax } = getCandidatePartStatus(c, project);
      const score = c.evaluation?.score || 0;
      const pct = adjustedMax > 0 ? (score / adjustedMax) * 100 : 0;
      return acc + pct;
  }, 0);
  const avgPercent = totalPercent / evaluated.length;

  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
  grades.forEach(g => {
    if (distribution[g] !== undefined) distribution[g]++;
  });

  return (
    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm mb-8 print:hidden flex justify-between items-center gap-8 flex-wrap">
       <div className="flex gap-8">
          <div>
             <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Snittkarakter</div>
             <div className="text-3xl font-black text-indigo-600">{avgGrade > 0 ? formatScore(Number(avgGrade.toFixed(1))) : '-'}</div>
          </div>
          <div>
             <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Snittpoeng</div>
             <div className="text-3xl font-black text-slate-800">{formatScore(Number(avgScore.toFixed(1)))}</div>
          </div>
          <div>
             <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Snitt Måloppnåelse</div>
             <div className="text-3xl font-black text-emerald-600">{Math.round(avgPercent)}%</div>
          </div>
       </div>
       <div className="flex-1 min-w-[200px] h-16 flex items-end justify-between gap-1 border-b border-slate-100 pb-1">
          {[1,2,3,4,5,6].map(g => {
             const count = distribution[g];
             const max = Math.max(...Object.values(distribution), 1);
             const height = (count / max) * 100;
             return (
               <div key={g} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  <div className="w-full bg-slate-100 rounded-t-sm hover:bg-indigo-100 transition-colors relative" style={{ height: `${height}%` }}>
                     <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">{count}</span>
                  </div>
                  <span className="text-[8px] font-black text-slate-400 mt-1">{g}</span>
               </div>
             );
          })}
       </div>
    </div>
  );
};

const TaskAnalysisChart: React.FC<{ data: { label: string, percent: number, isDel2: boolean }[] }> = ({ data }) => {
  const height = 180;
  const maxBarHeight = 140;

  if (data.length === 0) return null;

  return (
    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm h-full print:hidden flex flex-col">
      <h3 className="text-xl font-black text-slate-800 mb-8 tracking-tighter">Oppgaveanalyse</h3>
      <div className="relative flex-1 w-full" style={{ minHeight: `${height}px` }}>
        {[0, 25, 50, 75, 100].map(val => (
          <div key={val} className="absolute w-full border-t border-slate-100 flex items-center" style={{ bottom: `${(val / 100) * maxBarHeight + 25}px` }}>
            <span className="text-[8px] font-black text-slate-300 -ml-8 w-6 text-right">{val}</span>
          </div>
        ))}
        
        <div className="absolute inset-0 flex items-end justify-between pl-4 gap-1">
          {data.map((item, i) => {
            const barHeight = (item.percent / 100) * maxBarHeight;
            const color = item.percent > 70 ? 'bg-emerald-400' : item.percent > 40 ? 'bg-amber-400' : 'bg-rose-400';
            const textColor = item.isDel2 ? 'text-emerald-600' : 'text-indigo-600';
            
            return (
              <div key={i} className="flex flex-col items-center group relative flex-1">
                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[8px] font-black py-1 px-2 rounded-md pointer-events-none z-10 whitespace-nowrap">
                  {item.label}: {item.percent}%
                </div>
                <div className={`${color} w-full max-w-[24px] min-w-[8px] rounded-t-lg transition-all duration-1000 ease-out shadow-sm group-hover:brightness-110`} style={{ height: `${barHeight}px` }}></div>
                <div className={`mt-2 text-[9px] font-black ${textColor} rotate-45 origin-left whitespace-nowrap overflow-hidden text-ellipsis`} style={{maxWidth: '30px'}}>
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
  if (skills.length === 0) return <div className="p-10 text-center text-[10px] font-bold text-slate-400 uppercase print:hidden">Ingen data for diagram</div>;

  const size = 300;
  const center = size / 2;
  const radius = 100;
  const angleStep = (Math.PI * 2) / (skills.length < 3 ? 3 : skills.length); 

  const getPoints = (useAvg: boolean) => {
    return skills.map((s, i) => {
      const val = useAvg ? s.avg : s.value;
      const r = (val / 100) * radius;
      const x = center + r * Math.cos(i * angleStep - Math.PI / 2);
      const y = center + r * Math.sin(i * angleStep - Math.PI / 2);
      return `${x},${y}`;
    }).join(' ');
  };

  return (
    <div className="flex flex-col items-center print:scale-100 print:mt-4" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      <div className="flex gap-4 mb-4 print:hidden">
         {!isGroupView && (
           <div className="flex items-center gap-2">
              <div className="w-8 h-3 bg-indigo-500 rounded-sm border-2 border-indigo-200 print:bg-indigo-500 print:border-indigo-600"></div>
              <span className="text-[10px] font-black text-slate-500 uppercase print:text-black">Deg</span>
           </div>
         )}
         <div className="flex items-center gap-2">
            <div className={`w-8 h-3 ${isGroupView ? 'bg-indigo-500 border-2 border-indigo-200' : 'border-t-2 border-dashed border-slate-300'}`}></div>
            <span className="text-[10px] font-black text-slate-400 uppercase print:text-black">{isGroupView ? 'Snitt' : 'Snitt'}</span>
         </div>
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {[0.2, 0.4, 0.6, 0.8, 1].map((p, i) => {
          const points = Array.from({length: Math.max(3, skills.length)}).map((_, idx) => {
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
              <text x={lx} y={ly} textAnchor="middle" className="text-[9px] font-black fill-slate-500 uppercase print:fill-black print:text-[10px] print:font-bold">{s.tema}</text>
            </g>
          );
        })}

        {!isGroupView ? (
          <>
            {/* v8.9.13: Show average line in print too (removed print:hidden) */}
            <polygon points={getPoints(true)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4,2" />
            <polygon 
              points={getPoints(false)} 
              fill="rgba(99, 102, 241, 0.2)" 
              stroke="#6366f1" 
              strokeWidth="3" 
              className="print:fill-indigo-100 print:stroke-indigo-600 print:stroke-[3px] print:opacity-80" 
              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            />
          </>
        ) : (
          <polygon 
            points={getPoints(true)} 
            fill="rgba(99, 102, 241, 0.2)" 
            stroke="#6366f1" 
            strokeWidth="3" 
            className="print:fill-indigo-100 print:stroke-indigo-600"
            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          />
        )}
      </svg>
    </div>
  );
};

const CandidateReport: React.FC<{ 
  candidate: Candidate, 
  project: Project, 
  config: PrintConfig,
  onNavigateToTask?: (cId: string, tId: string, part: 1 | 2) => void,
  groupSkillStats?: Record<string, { total: number, max: number }>,
  onUpdateCandidate?: (updatedCandidate: Candidate) => void 
}> = ({ candidate, project, config, onNavigateToTask, groupSkillStats, onUpdateCandidate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localGrade, setLocalGrade] = useState(candidate.evaluation?.grade || "");
  
  if (!candidate.evaluation) return <div className="p-8 text-center text-slate-400">Ingen vurdering tilgjengelig</div>;

  const { score, grade, feedback, vekstpunkter, taskBreakdown } = candidate.evaluation;
  const { d1, d2, totalMax, adjustedMax } = getCandidatePartStatus(candidate, project);
  
  const skillsMap: Record<string, { total: number, max: number }> = {};
  project.rubric?.criteria.forEach(c => {
      const tema = c.tema || "Generelt";
      if (!skillsMap[tema]) skillsMap[tema] = { total: 0, max: 0 };
      const ev = taskBreakdown?.find(t => matchEvaluationToCriterion(t, c));
      if (ev) {
          skillsMap[tema].total += ev.score;
          skillsMap[tema].max += c.maxPoints || 0;
      } else {
           const isD2 = (c.part || "").toLowerCase().includes('2');
           const isMissing = isD2 ? d2.status === 'missing' : d1.status === 'missing';
           if (!isMissing) skillsMap[tema].max += c.maxPoints || 0;
      }
  });
  
  const skills = Object.entries(skillsMap)
    .filter(([_, data]) => data.max > 0)
    .map(([tema, data]) => {
      const groupData = groupSkillStats ? groupSkillStats[tema] : null;
      const avg = groupData && groupData.max > 0 ? Math.round((groupData.total / groupData.max) * 100) : 0;
      return { tema, value: Math.round((data.total / data.max) * 100), avg };
    });

  const percent = adjustedMax > 0 ? Math.round((score / adjustedMax) * 100) : 0;
  const displayGrade = isEditing ? localGrade : (candidate.evaluation?.grade || calculateGrade(score, adjustedMax));

  const handleTaskScoreChange = (taskId: string, newScore: number) => {
      if (!onUpdateCandidate || !candidate.evaluation) return;
      const updatedBreakdown = (candidate.evaluation.taskBreakdown || []).map(t => {
          const tLabel = renderTaskLabel(t.taskNumber, t.subTask);
          if (tLabel === taskId) return { ...t, score: newScore };
          return t;
      });
      const newTotal = updatedBreakdown.reduce((acc, t) => acc + t.score, 0);
      const newGrade = calculateGrade(newTotal, adjustedMax);
      setLocalGrade(newGrade);

      onUpdateCandidate({
          ...candidate,
          evaluation: { ...candidate.evaluation, taskBreakdown: updatedBreakdown, score: newTotal, grade: newGrade }
      });
  };

  const handleGradeChange = (newGrade: string) => {
      setLocalGrade(newGrade);
      if (onUpdateCandidate && candidate.evaluation) {
          onUpdateCandidate({ ...candidate, evaluation: { ...candidate.evaluation, grade: newGrade } });
      }
  };

  useEffect(() => {
      if (candidate.evaluation?.grade) {
          setLocalGrade(candidate.evaluation.grade);
      }
  }, [candidate.evaluation?.grade]);

  return (
    <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-8 md:p-12 print:shadow-none print:border-none print:p-0 print:rounded-none print:break-after-page min-h-[90vh]">
      <div className="flex flex-col md:flex-row justify-between gap-8 border-b border-slate-100 pb-8 mb-8 print:pb-2 print:mb-4 print:flex-row print:gap-4 print:items-center">
         <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tighter mb-2 print:text-xl print:mb-0">{candidate.name}</h2>
         </div>
         <div className="flex gap-6 items-center print:gap-4">
            {onUpdateCandidate && (
                <button 
                    onClick={() => setIsEditing(!isEditing)} 
                    className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all print:hidden ${isEditing ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                    {isEditing ? 'Lagre Endringer ✓' : '✎ Rediger'}
                </button>
            )}
            
            {config.showGrade && (
                <div className="text-center print:flex print:items-center print:gap-2">
                   {isEditing ? (
                       <input 
                           type="text" 
                           value={localGrade} 
                           onChange={e => handleGradeChange(e.target.value)}
                           className="text-5xl font-black text-indigo-600 w-24 text-center bg-indigo-50 rounded-xl outline-none"
                       />
                   ) : (
                       <div className="text-5xl font-black text-indigo-600 print:text-2xl">{displayGrade}</div>
                   )}
                   <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1 print:mt-0">Karakter</div>
                </div>
            )}
            {config.showScore && (
                <div className="text-center px-6 border-l border-slate-100 print:flex print:items-center print:gap-2 print:px-4">
                   <div className="text-3xl font-black text-slate-800 print:text-xl">{formatScore(score)} <span className="text-lg text-slate-300 print:text-sm">/ {adjustedMax}</span></div>
                   <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1 print:mt-0">
                       {config.showPercent ? `(${percent}%)` : 'Poeng'}
                   </div>
                </div>
            )}
         </div>
      </div>

      <div className="flex flex-col gap-10 print:block">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:block">
              <div className="flex flex-col gap-6 print:gap-4 print:mb-8">
                  {config.showFeedback && (
                      <div className="">
                         <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 print:mb-1">Kommentar</h3>
                         <LatexRenderer content={feedback} className="text-sm text-slate-700 leading-relaxed font-medium print:text-xs print:leading-snug" />
                      </div>
                  )}
                  {config.showGrowth && vekstpunkter && vekstpunkter.length > 0 && (
                      <div className="print:mt-2">
                         <h3 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-3 print:mb-1">Ting å jobbe med</h3>
                         <ul className="space-y-2 print:hidden">
                            {vekstpunkter.map((vp, i) => (
                               <li key={i} className="flex gap-3 items-start p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 text-emerald-800 text-xs font-medium leading-relaxed">
                                  <span className="text-emerald-400 font-bold mt-0.5">↗</span>
                                  <div className="flex-1"><LatexRenderer content={vp} /></div>
                               </li>
                            ))}
                         </ul>
                         <ul className="hidden print:block list-disc pl-4 space-y-1 text-xs text-slate-700">
                            {vekstpunkter.map((vp, i) => (
                               <li key={i} className="leading-snug"><LatexRenderer content={vp} /></li>
                            ))}
                         </ul>
                      </div>
                  )}
              </div>

              {config.showRadar && skills.length > 0 && (
                  <div className="flex flex-col items-center pt-8 border-t border-slate-100 md:border-none md:pt-0 print:border-none print:pt-0 print:w-full print:items-center print:mb-8 print:break-inside-avoid">
                     <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6 print:mb-0 print:hidden">Ferdighetsprofil</h3>
                     <SkillRadarChart skills={skills} />
                  </div>
              )}
          </div>
      </div>

      {config.showTable && project.rubric && (
          <div className="mt-12 print:mt-4 print:break-inside-avoid print:break-before-page">
             <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6 print:mb-2 print:hidden">Oppgavedetaljer</h3>
             <div className="overflow-hidden rounded-2xl border border-slate-200 print:hidden">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="bg-slate-50 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                         <th className="p-3 border-b border-slate-200">Oppgave</th>
                         <th className="p-3 border-b border-slate-200">Tema</th>
                         <th className="p-3 border-b border-slate-200 w-1/2">Kommentar</th>
                         <th className="p-3 border-b border-slate-200 text-right">Poeng</th>
                      </tr>
                   </thead>
                   <tbody className="text-xs">
                      {project.rubric.criteria.map((crit, idx) => {
                          const ev = taskBreakdown?.find(t => matchEvaluationToCriterion(t, crit));
                          const isDel2 = (crit.part || "").toLowerCase().includes("2");
                          const isMissingPart = isDel2 ? d2.status === 'missing' : d1.status === 'missing';
                          if (isMissingPart) return null;
                          const cleanTask = cleanTaskPair(crit.taskNumber, crit.subTask);
                          const taskLabel = `${cleanTask.taskNumber}${cleanTask.subTask}`;
                          return (
                              <tr 
                                key={idx} 
                                onClick={() => !isEditing && onNavigateToTask && onNavigateToTask(candidate.id, taskLabel, isDel2 ? 2 : 1)}
                                className={`border-b border-slate-100 last:border-0 transition-colors ${!ev ? 'opacity-50' : ''} ${!isEditing ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                              >
                                  <td className="p-3 font-bold text-slate-700">
                                     <div className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${isDel2 ? 'bg-emerald-400' : 'bg-indigo-400'}`}></span>
                                        {taskLabel}
                                     </div>
                                  </td>
                                  <td className="p-3 text-slate-500">{crit.tema}</td>
                                  <td className="p-3 text-slate-600">
                                      {ev ? (
                                        <div className="space-y-1">
                                            {config.showCommentsInTable && (
                                                <div className="text-xs leading-relaxed">
                                                    <LatexRenderer content={ev.comment} />
                                                </div>
                                            )}
                                        </div>
                                      ) : <span className="italic text-slate-400">-</span>}
                                  </td>
                                  <td className="p-3 text-right font-bold text-slate-800">
                                      {isEditing && ev ? (
                                          <input 
                                              type="number" 
                                              step="0.5"
                                              value={ev.score}
                                              onChange={(e) => handleTaskScoreChange(taskLabel, parseFloat(e.target.value) || 0)}
                                              onClick={(e) => e.stopPropagation()} 
                                              className="w-12 text-right bg-slate-100 border border-slate-300 rounded px-1 outline-none focus:border-indigo-500"
                                          />
                                      ) : (
                                          ev ? formatScore(ev.score) : '-'
                                      )} 
                                      <span className="text-slate-300 font-normal"> / {formatScore(crit.maxPoints)}</span>
                                  </td>
                              </tr>
                          );
                      })}
                   </tbody>
                </table>
             </div>
             {/* v8.9.24: Compact Print Table */}
             <div className="hidden print:block text-[9px] leading-tight print:columns-2 print:gap-6">
                <ul className="border-t border-slate-200">
                    {project.rubric.criteria.map((crit, idx) => {
                        const ev = taskBreakdown?.find(t => matchEvaluationToCriterion(t, crit));
                        const isDel2 = (crit.part || "").toLowerCase().includes("2");
                        const isMissingPart = isDel2 ? d2.status === 'missing' : d1.status === 'missing';
                        if (isMissingPart) return null;
                        const cleanTask = cleanTaskPair(crit.taskNumber, crit.subTask);
                        const taskLabel = `${cleanTask.taskNumber}${cleanTask.subTask}`;
                        return (
                            <li key={idx} className="flex gap-2 py-1 print:py-0.5 border-b border-slate-200 break-inside-avoid items-start">
                                <span className="font-bold w-8 shrink-0">{taskLabel}</span>
                                <span className="flex-1 text-slate-700">
                                    {ev ? <LatexRenderer content={ev.comment} /> : '-'}
                                </span>
                                <span className="font-bold whitespace-nowrap text-right w-12 shrink-0">
                                    {ev ? formatScore(ev.score) : '-'} <span className="font-normal text-slate-400">/ {formatScore(crit.maxPoints)}</span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
             </div>
          </div>
      )}
    </div>
  );
};

const ResultMatrix: React.FC<{ 
    project: Project, 
    candidates: Candidate[], 
    onNavigate: (cId: string) => void,
    selectedIds: Set<string>,
    onToggle: (id: string) => void,
    onToggleAll: () => void
}> = ({ project, candidates, onNavigate, selectedIds, onToggle, onToggleAll }) => {
    
    const rubricTasks = useMemo(() => {
        if (!project.rubric) return { d1: [], d2: [] };
        const d1: RubricCriterion[] = [];
        const d2: RubricCriterion[] = [];
        project.rubric.criteria.forEach(c => {
           const isD2 = (c.part || "Del 1").toLowerCase().includes("2");
           if (isD2) d2.push(c); else d1.push(c);
        });
        const sorter = (a: RubricCriterion, b: RubricCriterion) => {
            const nA = parseInt(a.taskNumber.replace(/\D/g,'')) || 0;
            const nB = parseInt(b.taskNumber.replace(/\D/g,'')) || 0;
            if (nA !== nB) return nA - nB;
            return (a.subTask || "").localeCompare(b.subTask || "");
        };
        return { d1: d1.sort(sorter), d2: d2.sort(sorter) };
    }, [project.rubric]);

    const allSelected = candidates.length > 0 && selectedIds.size === candidates.length;

    return (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                        <tr className="bg-slate-50 text-[9px] font-black uppercase text-slate-500 tracking-wider text-center border-b border-slate-200">
                            <th className="p-3 bg-white sticky left-0 z-20 shadow-sm border-r border-slate-100 w-12">
                                <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                            </th>
                            <th className="p-3 bg-white sticky left-12 z-20 shadow-sm border-r border-slate-100 text-left min-w-[200px]">Kandidat</th>
                            {rubricTasks.d1.length > 0 && <th colSpan={rubricTasks.d1.length} className="p-2 bg-indigo-50 text-indigo-600 border-x border-indigo-100">DEL 1</th>}
                            {rubricTasks.d2.length > 0 && <th colSpan={rubricTasks.d2.length} className="p-2 bg-emerald-50 text-emerald-600 border-r border-emerald-100">DEL 2</th>}
                            <th colSpan={3} className="p-2 bg-slate-100 text-slate-600">TOTALT</th>
                        </tr>
                        <tr className="bg-white text-[8px] font-black uppercase text-slate-400 tracking-widest text-center border-b border-slate-100">
                            <th className="p-2 bg-white sticky left-0 z-20 shadow-sm border-r border-slate-100"></th>
                            <th className="p-2 bg-white sticky left-12 z-20 shadow-sm border-r border-slate-100"></th>
                            {rubricTasks.d1.map((t, i) => (
                                <th key={i} className="p-2 min-w-[40px] text-indigo-400 border-r border-slate-50" title={`${t.taskNumber}${t.subTask}`}>
                                    {t.taskNumber}{t.subTask}
                                </th>
                            ))}
                            {rubricTasks.d2.map((t, i) => (
                                <th key={i} className="p-2 min-w-[40px] text-emerald-500 border-r border-slate-50" title={`${t.taskNumber}${t.subTask}`}>
                                    {t.taskNumber}{t.subTask}
                                </th>
                            ))}
                            <th className="p-2 min-w-[60px] bg-slate-50 border-r border-slate-200">Sum</th>
                            <th className="p-2 min-w-[60px] bg-slate-50 border-r border-slate-200">%</th>
                            <th className="p-2 min-w-[40px] bg-slate-50">Kar</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs font-medium text-slate-700">
                        {candidates.map((c, i) => {
                            const { d1, d2, adjustedMax } = getCandidatePartStatus(c, project);
                            const score = c.evaluation?.score || 0;
                            const percent = adjustedMax > 0 ? Math.round((score/adjustedMax)*100) : 0;
                            const isSelected = selectedIds.has(c.id);
                            const grade = calculateGrade(score, adjustedMax);

                            return (
                                <tr key={c.id} className={`hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                                    <td className="p-3 bg-white sticky left-0 z-10 shadow-sm border-r border-slate-100 group-hover:bg-slate-50 text-center">
                                        <input type="checkbox" checked={isSelected} onChange={() => onToggle(c.id)} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                                    </td>
                                    <td className="p-3 bg-white sticky left-12 z-10 shadow-sm border-r border-slate-100 group-hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => onNavigate(c.id)} className="font-bold text-slate-700 hover:text-indigo-600 hover:underline text-left truncate">
                                                {c.name}
                                            </button>
                                            <div className="flex gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 opacity-80 shrink-0">
                                                {d1.status === 'complete' ? <span title="Del 1 Komplett">1️⃣✅</span> : d1.status === 'missing' ? <span title="Ingen Del 1">1️⃣🚫</span> : <span title="Del 1 Delvis">1️⃣⚠️</span>}
                                                {d2.status === 'complete' ? <span title="Del 2 Komplett">2️⃣✅</span> : d2.status === 'missing' ? <span title="Ingen Del 2">2️⃣🚫</span> : <span title="Del 2 Delvis">2️⃣⚠️</span>}
                                            </div>
                                        </div>
                                    </td>
                                    {rubricTasks.d1.map((t, idx) => {
                                        if (d1.status === 'missing') {
                                            return <td key={`d1-${idx}`} className="p-2 border-r border-slate-50 bg-slate-50/30"></td>;
                                        }
                                        const ev = c.evaluation?.taskBreakdown?.find(e => matchEvaluationToCriterion(e, t));
                                        return (
                                            <td key={`d1-${idx}`} className="p-2 text-center border-r border-slate-50 text-indigo-900">
                                                {ev ? (ev.score === 0 ? <span className="text-rose-400">0</span> : formatScore(ev.score)) : <span className="text-slate-200">-</span>}
                                            </td>
                                        );
                                    })}
                                    {rubricTasks.d2.map((t, idx) => {
                                        if (d2.status === 'missing') {
                                            return <td key={`d2-${idx}`} className="p-2 border-r border-slate-50 bg-slate-50/30"></td>;
                                        }
                                        const ev = c.evaluation?.taskBreakdown?.find(e => matchEvaluationToCriterion(e, t));
                                        return (
                                            <td key={`d2-${idx}`} className="p-2 text-center border-r border-slate-50 text-emerald-900">
                                                {ev ? (ev.score === 0 ? <span className="text-rose-400">0</span> : formatScore(ev.score)) : <span className="text-slate-200">-</span>}
                                            </td>
                                        );
                                    })}
                                    <td className="p-2 text-center bg-slate-50 border-r border-slate-200 font-bold">{formatScore(score)}</td>
                                    <td className="p-2 text-center bg-slate-50 border-r border-slate-200 text-slate-500 font-mono text-[10px]">{percent}%</td>
                                    <td className="p-2 text-center bg-slate-50 font-black text-indigo-600">{grade}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

interface ResultsStepProps {
  activeProject: Project;
  selectedResultCandidateId: string | null;
  setSelectedResultCandidateId: (id: string | null) => void;
  handleEvaluateAll: (force?: boolean) => void;
  handleBatchEvaluation: (ids: string[], force?: boolean) => void;
  handleEvaluateCandidate: (id: string) => void;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
  onNavigateToReview: (id: string) => void;
  onNavigateToTask?: (candidateId: string, taskId: string, part: 1 | 2) => void;
  updateActiveProject?: (updates: Partial<Project>) => void;
  progress?: {
    batchTotal: number;
    batchCompleted: number;
    currentAction?: string;
    etaSeconds?: number | null;
  };
}

export const ResultsStep: React.FC<ResultsStepProps> = ({
  activeProject,
  selectedResultCandidateId,
  setSelectedResultCandidateId,
  handleEvaluateAll,
  handleBatchEvaluation,
  handleEvaluateCandidate,
  handleGenerateRubric,
  rubricStatus,
  onNavigateToReview,
  onNavigateToTask,
  updateActiveProject,
  progress
}) => {
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false); // v8.6.4: UI state
  
  // v8.6.5: Default select all ready candidates
  useEffect(() => {
      const ready = activeProject.candidates.filter(c => c.status === 'completed' || c.status === 'evaluated').map(c => c.id);
      setSelectedCandidateIds(new Set(ready));
  }, [activeProject.candidates.length]);

  const displayCandidates = useMemo(() => {
    return activeProject.candidates.filter(c => c.status === 'completed' || c.status === 'evaluated');
  }, [activeProject.candidates]);

  const evaluatedCandidates = useMemo(() => {
    return displayCandidates.filter(c => c.status === 'evaluated' && c.evaluation);
  }, [displayCandidates]);

  const selectedCandidate = displayCandidates.find(c => c.id === selectedResultCandidateId);

  const groupSkillStats = useMemo(() => {
      const skillsMap: Record<string, { total: number, max: number }> = {};
      if (!activeProject.rubric) return undefined;

      activeProject.rubric.criteria.forEach(c => {
          const tema = c.tema || "Generelt";
          if (!skillsMap[tema]) skillsMap[tema] = { total: 0, max: 0 };
          skillsMap[tema].max += (c.maxPoints || 0) * evaluatedCandidates.length;
      });
      
      evaluatedCandidates.forEach(c => {
          c.evaluation?.taskBreakdown?.forEach(t => {
              const crit = activeProject.rubric?.criteria.find(crit => matchEvaluationToCriterion(t, crit));
              if (crit && crit.tema) {
                  if (skillsMap[crit.tema]) skillsMap[crit.tema].total += t.score;
              }
          });
      });
      return skillsMap;
  }, [activeProject.rubric, evaluatedCandidates]);

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const analysisData = useMemo(() => {
    if (!activeProject.rubric) return [];
    return activeProject.rubric.criteria.map(crit => {
        const evals = evaluatedCandidates.map(c => c.evaluation?.taskBreakdown?.find(t => matchEvaluationToCriterion(t, crit)));
        const validEvals = evals.filter(e => e !== undefined);
        if (validEvals.length === 0) return { label: `${crit.taskNumber}`, percent: 0, isDel2: false };
        const totalScore = validEvals.reduce((a, b) => a + (b?.score || 0), 0);
        const maxPossible = validEvals.length * (crit.maxPoints || 0);
        const percent = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
        const clean = cleanTaskPair(crit.taskNumber, crit.subTask);
        return {
            label: `${clean.taskNumber}${clean.subTask}`,
            percent,
            isDel2: (crit.part || "").toLowerCase().includes("2")
        };
    }).sort((a,b) => {
        if (a.isDel2 !== b.isDel2) return a.isDel2 ? 1 : -1;
        return a.label.localeCompare(b.label, undefined, {numeric: true});
    });
  }, [evaluatedCandidates, activeProject.rubric]);

  const handleUpdateCandidate = async (updatedCandidate: Candidate) => {
      await saveCandidate(updatedCandidate);
      if (updateActiveProject) {
          const newCandidates = activeProject.candidates.map(c => c.id === updatedCandidate.id ? updatedCandidate : c);
          updateActiveProject({ candidates: newCandidates });
      }
  };

  const toggleCandidateSelection = (id: string) => {
      const next = new Set(selectedCandidateIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedCandidateIds(next);
  };

  const toggleAllCandidates = () => {
      if (selectedCandidateIds.size === displayCandidates.length) {
          setSelectedCandidateIds(new Set());
      } else {
          setSelectedCandidateIds(new Set(displayCandidates.map(c => c.id)));
      }
  };

  const executeSelectedEvaluation = () => {
      if (selectedCandidateIds.size === 0) return;
      handleBatchEvaluation(Array.from(selectedCandidateIds), true);
  };

  const handleExportCSV = () => {
      const rubricTasks = (() => {
          if (!activeProject.rubric) return { d1: [], d2: [] };
          const d1: RubricCriterion[] = [];
          const d2: RubricCriterion[] = [];
          activeProject.rubric.criteria.forEach(c => {
             const isD2 = (c.part || "Del 1").toLowerCase().includes("2");
             if (isD2) d2.push(c); else d1.push(c);
          });
          const sorter = (a: RubricCriterion, b: RubricCriterion) => {
              const nA = parseInt(a.taskNumber.replace(/\D/g,'')) || 0;
              const nB = parseInt(b.taskNumber.replace(/\D/g,'')) || 0;
              if (nA !== nB) return nA - nB;
              return (a.subTask || "").localeCompare(b.subTask || "");
          };
          return { d1: d1.sort(sorter), d2: d2.sort(sorter) };
      })();

      const headers = ["Kandidat", ...rubricTasks.d1.map(c => `D1-${c.taskNumber}${c.subTask}`), ...rubricTasks.d2.map(c => `D2-${c.taskNumber}${c.subTask}`), "Sum", "Prosent", "Karakter"];
      const rows = displayCandidates.map(c => {
          const { adjustedMax } = getCandidatePartStatus(c, activeProject);
          const score = c.evaluation?.score || 0;
          const percent = adjustedMax > 0 ? Math.round((score/adjustedMax)*100) : 0;
          
          const cols = [
              c.name,
              ...rubricTasks.d1.map(t => {
                  const ev = c.evaluation?.taskBreakdown?.find(e => matchEvaluationToCriterion(e, t));
                  return ev ? formatScore(ev.score) : "-";
              }),
              ...rubricTasks.d2.map(t => {
                  const ev = c.evaluation?.taskBreakdown?.find(e => matchEvaluationToCriterion(e, t));
                  return ev ? formatScore(ev.score) : "-";
              }),
              formatScore(score),
              `${formatScore(percent)}%`,
              calculateGrade(score, adjustedMax)
          ];
          return cols.join(";");
      });
      
      const csvContent = [headers.join(";"), ...rows].join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
          const url = URL.createObjectURL(blob);
          link.setAttribute("href", url);
          link.setAttribute("download", `Resultater_${activeProject.name}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  const handleBatchPrint = () => {
      if (evaluatedCandidates.length === 0) {
          alert("Ingen kandidater er vurdert ennå.");
          return;
      }
      setIsBatchPrinting(true);
      setTimeout(() => {
          window.print();
          setIsBatchPrinting(false);
      }, 500); 
  };

  if (selectedCandidate) {
      return (
          <div className="flex h-full w-full overflow-hidden bg-[#F8FAFC]">
              <aside className="w-72 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full z-10">
                  <div className="p-4 border-b shrink-0 bg-white/80 sticky top-0 z-20">
                      <button onClick={() => setSelectedResultCandidateId(null)} className="w-full text-left flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-black text-[10px] uppercase tracking-widest transition-colors mb-2">
                          <span>←</span> Tilbake til oversikt
                      </button>
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Kandidater</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-slate-50/30">
                      {displayCandidates
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(c => {
                              const isSelected = c.id === selectedCandidate.id;
                              const { d1, d2, adjustedMax } = getCandidatePartStatus(c, activeProject);
                              const cScore = c.evaluation?.score || 0;
                              const cGrade = c.status === 'evaluated' ? calculateGrade(cScore, adjustedMax) : '-';

                              return (
                                  <button
                                      key={c.id}
                                      onClick={() => setSelectedResultCandidateId(c.id)}
                                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${isSelected ? 'bg-indigo-600 text-white shadow-md border-indigo-600' : 'bg-white hover:bg-indigo-50 text-slate-600 border-slate-100'}`}
                                  >
                                      <div className="flex items-center gap-2 min-w-0">
                                          <span className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-slate-700'}`}>{c.name}</span>
                                          <div className={`flex gap-1 text-[8px] font-black uppercase tracking-widest shrink-0 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                {d1.status === 'complete' ? <span title="Del 1">1️⃣✅</span> : d1.status === 'missing' ? <span title="Ingen Del 1">1️⃣🚫</span> : <span title="Del 1 Delvis">1️⃣⚠️</span>}
                                                {d2.status === 'complete' ? <span title="Del 2">2️⃣✅</span> : d2.status === 'missing' ? <span title="Ingen Del 2">2️⃣🚫</span> : <span title="Del 2 Delvis">2️⃣⚠️</span>}
                                          </div>
                                      </div>
                                      <span className={`text-[10px] font-black ${isSelected ? 'text-white' : 'text-emerald-600'}`}>{cGrade}</span>
                                  </button>
                              );
                          })}
                  </div>
              </aside>

              <main className="flex-1 overflow-y-auto custom-scrollbar p-8 print:p-0 print:overflow-visible h-full bg-[#F8FAFC]">
                  <div className="max-w-[1600px] mx-auto pb-20 print:pb-0">
                      <div className="flex justify-end mb-6 print:hidden gap-2 relative">
                          <button onClick={() => setShowPrintMenu(!showPrintMenu)} className="bg-white border border-slate-200 text-slate-600 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-all shadow-sm text-lg">⚙️</button>
                          {showPrintMenu && <PrintSettingsMenu config={printConfig} onChange={(k) => setPrintConfig(p => ({...p, [k]: !p[k]}))} onClose={() => setShowPrintMenu(false)} />}
                          
                          <button onClick={() => window.print()} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md">
                              🖨️ Skriv ut
                          </button>
                          <button onClick={() => onNavigateToReview(selectedCandidate.id)} className="bg-white border border-indigo-100 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all">
                              Se Transkripsjon →
                          </button>
                          <button onClick={() => handleEvaluateCandidate(selectedCandidate.id)} className="bg-white border border-slate-200 text-slate-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
                              {selectedCandidate.evaluation ? 'Vurder på nytt ↻' : 'Start vurdering 🚀'}
                          </button>
                      </div>

                      <CandidateReport
                          candidate={selectedCandidate}
                          project={activeProject}
                          config={printConfig}
                          onNavigateToTask={onNavigateToTask}
                          groupSkillStats={groupSkillStats} 
                          onUpdateCandidate={handleUpdateCandidate} 
                      />
                  </div>
              </main>
          </div>
      );
  }

  if (isBatchPrinting) {
      return (
          <div className="print:block hidden bg-white">
              {evaluatedCandidates.map(c => (
                  <div key={c.id} className="print:block print:break-after-page min-h-screen">
                      <CandidateReport
                          candidate={c}
                          project={activeProject}
                          config={printConfig}
                          groupSkillStats={groupSkillStats}
                      />
                  </div>
              ))}
          </div>
      );
  }

  return (
    <div className="h-full bg-[#F8FAFC] p-8 overflow-y-auto custom-scrollbar">
       <div className="max-w-[1800px] mx-auto space-y-8 pb-20">
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <header className="flex justify-between items-end">
                  <div>
                      <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Klasseoversikt</h2>
                      <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mt-2">Samlet statistikk for {evaluatedCandidates.length} vurderte kandidater</p>
                  </div>
                  
                  <div className="flex gap-3 items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100 relative">
                        {rubricStatus.loading ? (
                            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-xl">
                                <Spinner size="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">{rubricStatus.text}</span>
                                {progress?.etaSeconds && <span className="text-[10px] text-emerald-600 font-bold ml-2">{formatEta(progress.etaSeconds)}</span>}
                            </div>
                        ) : (
                            <>
                                <button 
                                    onClick={executeSelectedEvaluation}
                                    disabled={selectedCandidateIds.size === 0} 
                                    className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-2 ${selectedCandidateIds.size > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    <span>🚀</span> Vurder {selectedCandidateIds.size > 0 ? `${selectedCandidateIds.size} Markerte` : '...'}
                                </button>
                                <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
                                <button onClick={handleExportCSV} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
                                    <span>📊</span> CSV
                                </button>
                                
                                <button onClick={() => setShowPrintMenu(!showPrintMenu)} className="bg-white border border-slate-200 text-slate-600 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-all shadow-sm text-lg">⚙️</button>
                                {showPrintMenu && <PrintSettingsMenu config={printConfig} onChange={(k) => setPrintConfig(p => ({...p, [k]: !p[k]}))} onClose={() => setShowPrintMenu(false)} />}

                                <button onClick={handleBatchPrint} disabled={evaluatedCandidates.length === 0} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50">
                                    <span>🖨️</span> Skriv ut Alle (Batch)
                                </button>
                            </>
                        )}
                  </div>
              </header>
              
              {displayCandidates.length === 0 ? (
                  <div className="p-20 text-center border-2 border-dashed border-slate-200 rounded-[32px] opacity-50">
                    <div className="text-6xl mb-4 grayscale opacity-30">📊</div>
                    <h3 className="text-lg font-black text-slate-400 uppercase tracking-widest">Ingen resultater ennå</h3>
                    <p className="text-sm text-slate-400 mt-2">Start vurdering av kandidater i menyen til venstre.</p>
                  </div>
              ) : (
                  <>
                    {evaluatedCandidates.length > 0 && (
                        <>
                            <GroupStats candidates={activeProject.candidates} project={activeProject} />
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[400px]">
                                <TaskAnalysisChart data={analysisData} />
                                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center justify-center">
                                  <h3 className="text-xl font-black text-slate-800 mb-8 tracking-tighter self-start">Ferdighetsprofil (Snitt)</h3>
                                  {(() => {
                                      const stats = (groupSkillStats || {}) as Record<string, { total: number, max: number }>;
                                      const skills = Object.entries(stats)
                                          .filter(([_, data]) => data.max > 0)
                                          .map(([tema, data]) => ({
                                              tema,
                                              value: 0,
                                              avg: Math.round((data.total / data.max) * 100)
                                          }));
                                      
                                      return <SkillRadarChart skills={skills} isGroupView={true} />;
                                  })()}
                                </div>
                            </div>
                        </>
                    )}

                    <ResultMatrix 
                        project={activeProject} 
                        candidates={displayCandidates} 
                        onNavigate={(id) => setSelectedResultCandidateId(id)}
                        selectedIds={selectedCandidateIds}
                        onToggle={toggleCandidateSelection}
                        onToggleAll={toggleAllCandidates} 
                    />
                  </>
              )}
            </div>
       </div>
    </div>
  );
};
