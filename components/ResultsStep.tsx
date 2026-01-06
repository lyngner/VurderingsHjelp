
import React, { useMemo, useState, useEffect } from 'react';
import { Project, Candidate, RubricCriterion, TaskEvaluation } from '../types';
import { Spinner, LatexRenderer } from './SharedUI';
import { saveCandidate, deleteCandidate } from '../services/storageService';
import { sanitizeTaskId, cleanTaskPair } from '../services/geminiService';

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

const renderTaskLabel = (num: unknown, sub: unknown): string => {
    const pair = cleanTaskPair(String(num || ""), String(sub || ""));
    return `${pair.taskNumber}${pair.subTask}`;
};

// v8.0.49: Robust Task Matcher
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

// v8.0.35: Helper to calculate Part status and adjusted max score
// v8.2.12: Page existence check to prevent missing status if no tasks found
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

    // Check for page presence
    const hasPagesD1 = candidate.pages.some(p => !(p.part || "Del 1").toLowerCase().includes("2"));
    const hasPagesD2 = candidate.pages.some(p => (p.part || "").toLowerCase().includes("2"));

    // v8.1.6: Improved Presence Detection
    // Logic: A task is "present" if OCR found it (candidate.pages) OR if Evaluation gave it > 0 points.
    // We ignore Evaluation entries with 0 points because the AI auto-fills them even if missing.

    // 1. Scan raw pages (OCR evidence)
    candidate.pages.forEach(p => {
        const pPart = (p.part || "Del 1").toLowerCase().includes("2") ? "Del 2" : "Del 1";
        p.identifiedTasks?.forEach(t => {
             const label = renderTaskLabel(t.taskNumber, t.subTask);
             if (pPart === "Del 2") foundD2.add(label);
             else foundD1.add(label);
        });
    });

    // 2. Scan evaluation (Score evidence)
    // Only trust evaluation presence if score > 0. 
    // This prevents "Not Answered" tasks (auto-filled with 0) from counting as "Present".
    if (candidate.evaluation?.taskBreakdown) {
        candidate.evaluation.taskBreakdown.forEach(t => {
            if (t.score > 0) {
                const label = renderTaskLabel(t.taskNumber, t.subTask);
                
                // v8.2.4 Fix: Robust Part Logic
                // Always check Rubric for Part belonging first. 
                // Only trust 't.part' if the task name exists in BOTH parts (ambiguous).
                
                const inD1 = rubricTasksD1.has(label);
                const inD2 = rubricTasksD2.has(label);
                
                let isD2 = false;
                
                if (inD2 && !inD1) {
                    isD2 = true; // Unique to D2
                } else if (inD1 && !inD2) {
                    isD2 = false; // Unique to D1
                } else {
                    // Ambiguous or Unknown -> Fallback to evaluation metadata
                    const rawPart = String(t.part || "Del 1");
                    isD2 = rawPart.toLowerCase().includes("2");
                }
                
                if (isD2) foundD2.add(label);
                else foundD1.add(label);
            }
        });
    }

    const getStatus = (found: Set<string>, rubric: Set<string>, hasPages: boolean) => {
        if (rubric.size === 0) return 'none'; // No tasks in rubric for this part
        if (found.size === 0) {
            // If pages exist but no tasks found, assume incomplete/partial instead of missing
            return hasPages ? 'partial' : 'missing';
        }
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
  
  // Calculate average grade (assuming grade is number 1-6)
  const grades = evaluated.map(c => parseInt(c.evaluation?.grade || "0") || 0).filter(g => g > 0);
  const avgGrade = grades.length > 0 ? grades.reduce((a,b) => a+b, 0) / grades.length : 0;

  // v8.1.3: Average Percentage Calculation
  const totalPercent = evaluated.reduce((acc, c) => {
      const { adjustedMax } = getCandidatePartStatus(c, project);
      const score = c.evaluation?.score || 0;
      const pct = adjustedMax > 0 ? (score / adjustedMax) * 100 : 0;
      return acc + pct;
  }, 0);
  const avgPercent = totalPercent / evaluated.length;

  // Distribution
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
  grades.forEach(g => {
    if (distribution[g] !== undefined) distribution[g]++;
  });

  return (
    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm mb-8 print:hidden flex justify-between items-center gap-8 flex-wrap">
       <div className="flex gap-8">
          <div>
             <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Snittkarakter</div>
             <div className="text-3xl font-black text-indigo-600">{avgGrade > 0 ? avgGrade.toFixed(1) : '-'}</div>
          </div>
          <div>
             <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Snittpoeng</div>
             <div className="text-3xl font-black text-slate-800">{avgScore.toFixed(1)}</div>
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
  // v8.0.49: Relaxed constraint. Allow charts even with 1 or 2 themes, just to show SOMETHING.
  if (skills.length === 0) return <div className="p-10 text-center text-[10px] font-bold text-slate-400 uppercase print:hidden">Ingen data for diagram</div>;

  const size = 300;
  const center = size / 2;
  const radius = 100;
  const angleStep = (Math.PI * 2) / (skills.length < 3 ? 3 : skills.length); // Force 3-way split minimum for layout

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
    <div className="flex flex-col items-center print:scale-75 print:transform-origin-top">
      <div className="flex gap-4 mb-4 print:hidden">
         {!isGroupView && (
           <div className="flex items-center gap-2">
              <div className="w-8 h-3 bg-indigo-500 rounded-sm border-2 border-indigo-200 print:border-black print:bg-transparent"></div>
              <span className="text-[10px] font-black text-slate-500 uppercase print:text-black">Deg</span>
           </div>
         )}
         <div className="flex items-center gap-2">
            <div className={`w-8 h-3 ${isGroupView ? 'bg-indigo-500 border-2 border-indigo-200' : 'border-t-2 border-dashed border-slate-300'} print:border-black`}></div>
            <span className="text-[10px] font-black text-slate-400 uppercase print:hidden">{isGroupView ? 'Snitt' : 'Snitt'}</span>
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
          return <polygon key={i} points={points} fill="none" stroke="#e2e8f0" strokeWidth="1" className="print:stroke-black print:stroke-[0.5]" />;
        })}
        
        {skills.map((s, i) => {
          const x2 = center + radius * Math.cos(i * angleStep - Math.PI / 2);
          const y2 = center + radius * Math.sin(i * angleStep - Math.PI / 2);
          const lx = center + (radius + 35) * Math.cos(i * angleStep - Math.PI / 2);
          const ly = center + (radius + 20) * Math.sin(i * angleStep - Math.PI / 2);
          return (
            <g key={i}>
              <line x1={center} y1={center} x2={x2} y2={y2} stroke="#e2e8f0" strokeWidth="1" className="print:stroke-black print:stroke-[0.5]" />
              <text x={lx} y={ly} textAnchor="middle" className="text-[9px] font-black fill-slate-500 uppercase print:fill-black print:text-[8px]">{s.tema}</text>
            </g>
          );
        })}

        {!isGroupView ? (
          <>
            <polygon points={getPoints(true)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4,2" className="print:hidden" />
            <polygon 
              points={getPoints(false)} 
              fill="rgba(99, 102, 241, 0.2)" 
              stroke="#6366f1" 
              strokeWidth="3" 
              className="print:fill-transparent print:stroke-black print:stroke-2" 
            />
          </>
        ) : (
          <polygon 
            points={getPoints(true)} 
            fill="rgba(99, 102, 241, 0.2)" 
            stroke="#6366f1" 
            strokeWidth="3" 
            className="print:fill-transparent print:stroke-black print:stroke-2" 
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
  onNavigateToTask?: (cId: string, tId: string, part: 1 | 2) => void 
}> = ({ candidate, project, config, onNavigateToTask }) => {
  if (!candidate.evaluation) return <div className="p-8 text-center text-slate-400">Ingen vurdering tilgjengelig</div>;

  const { score, grade, feedback, vekstpunkter, taskBreakdown } = candidate.evaluation;
  const { d1, d2, totalMax, adjustedMax } = getCandidatePartStatus(candidate, project);
  
  // Calculate skills for radar
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
           if (!isMissing) {
               skillsMap[tema].max += c.maxPoints || 0;
           }
      }
  });
  
  const skills = Object.entries(skillsMap)
    .filter(([_, data]) => data.max > 0)
    .map(([tema, data]) => ({
      tema,
      value: Math.round((data.total / data.max) * 100),
      avg: 0 
    }));

  // v8.3.0: Calculate percent
  const percent = adjustedMax > 0 ? Math.round((score / adjustedMax) * 100) : 0;

  return (
    <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-8 md:p-12 print:shadow-none print:border-none print:p-0">
      <div className="flex flex-col md:flex-row justify-between gap-8 border-b border-slate-100 pb-8 mb-8">
         <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tighter mb-2">{candidate.name}</h2>
            <div className="flex gap-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
               <span>ID: {candidate.id}</span>
               <span>•</span>
               <span>{new Date().toLocaleDateString()}</span>
            </div>
         </div>
         <div className="flex gap-6 items-center">
            {config.showGrade && (
                <div className="text-center">
                   <div className="text-5xl font-black text-indigo-600">{grade}</div>
                   <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">Karakter</div>
                </div>
            )}
            {config.showScore && (
                <div className="text-center px-6 border-l border-slate-100">
                   <div className="text-3xl font-black text-slate-800">{score} <span className="text-lg text-slate-300">/ {adjustedMax}</span></div>
                   <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">
                       {config.showPercent ? `${percent}% Resultat` : 'Poeng'}
                   </div>
                </div>
            )}
         </div>
      </div>

      {/* v8.3.0: New Layout: Comment & Growth top, Radar bottom */}
      <div className="flex flex-col gap-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:block">
              {/* Left Column: Comment */}
              {config.showFeedback && (
                  <div className="print:mb-6">
                     <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Kommentar</h3>
                     <LatexRenderer content={feedback} className="text-sm text-slate-700 leading-relaxed font-medium" />
                  </div>
              )}
              
              {/* Right Column: Growth */}
              {config.showGrowth && vekstpunkter && vekstpunkter.length > 0 && (
                  <div className="print:mb-6">
                     <h3 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-4">Vekstpunkter</h3>
                     <ul className="space-y-3">
                        {vekstpunkter.map((v, i) => (
                            <li key={i} className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl text-xs text-emerald-900 flex gap-3 items-start print:bg-transparent print:border-none print:p-0">
                               <span className="text-emerald-400 text-lg leading-none print:hidden">↗</span>
                               <span>- {v}</span>
                            </li>
                        ))}
                     </ul>
                  </div>
              )}
          </div>

          {/* Bottom: Radar Chart */}
          {config.showRadar && skills.length > 0 && (
              <div className="flex flex-col items-center pt-8 border-t border-slate-100 print:break-inside-avoid">
                 <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Ferdighetsprofil</h3>
                 <SkillRadarChart skills={skills} />
              </div>
          )}
      </div>

      {config.showTable && project.rubric && (
          <div className="mt-12 print:break-before-page">
             <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Oppgavedetaljer</h3>
             <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="bg-slate-50 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                         <th className="p-4 border-b border-slate-200">Oppgave</th>
                         <th className="p-4 border-b border-slate-200">Tema</th>
                         <th className="p-4 border-b border-slate-200 w-1/2">Kommentar</th>
                         <th className="p-4 border-b border-slate-200 text-right">Poeng</th>
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
                              <tr key={idx} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${!ev ? 'opacity-50' : ''}`}>
                                  <td className="p-4 font-bold text-slate-700">
                                     <div className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${isDel2 ? 'bg-emerald-400' : 'bg-indigo-400'}`}></span>
                                        {taskLabel}
                                     </div>
                                  </td>
                                  <td className="p-4 text-slate-500">{crit.tema}</td>
                                  <td className="p-4 text-slate-600">
                                      {ev ? (
                                        <div className="space-y-1">
                                            {config.showCommentsInTable && (
                                                <div className="text-xs leading-relaxed">
                                                    <LatexRenderer content={ev.comment} />
                                                </div>
                                            )}
                                            {onNavigateToTask && (
                                              <button 
                                                onClick={() => onNavigateToTask(candidate.id, taskLabel, isDel2 ? 2 : 1)}
                                                className="text-[8px] font-black uppercase text-indigo-500 hover:underline mt-1 print:hidden"
                                              >
                                                Se besvarelse →
                                              </button>
                                            )}
                                        </div>
                                      ) : <span className="italic text-slate-400">Ikke vurdert</span>}
                                  </td>
                                  <td className="p-4 text-right font-bold text-slate-800">
                                      {ev ? ev.score : '-'} <span className="text-slate-300 font-normal">/ {crit.maxPoints}</span>
                                  </td>
                              </tr>
                          );
                      })}
                   </tbody>
                </table>
             </div>
          </div>
      )}
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
  progress
}) => {
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);
  const [filterQuery, setFilterQuery] = useState('');
  // v8.3.0: Toggle for Print Menu
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  
  const evaluatedCandidates = useMemo(() => {
    return activeProject.candidates.filter(c => c.status === 'evaluated' && c.evaluation);
  }, [activeProject.candidates]);

  const selectedCandidate = evaluatedCandidates.find(c => c.id === selectedResultCandidateId);

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const analysisData = useMemo(() => {
    if (!activeProject.rubric) return [];
    
    // Calculate average % per task
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

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F8FAFC]">
      <aside className="w-64 bg-white border-r flex flex-col shrink-0 no-print shadow-sm h-full z-10">
         <div className="p-4 border-b shrink-0 bg-white/80 sticky top-0 z-20">
             <div className="flex justify-between items-center mb-3">
                 <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Resultater</h3>
                 {evaluatedCandidates.length > 0 && (
                     <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md text-[8px] font-black">{evaluatedCandidates.length} stk</span>
                 )}
             </div>
             <input type="text" placeholder="Søk..." className="w-full bg-slate-50 border p-2 rounded-lg font-bold text-[10px] outline-none" value={filterQuery} onChange={e => setFilterQuery(e.target.value)} />
         </div>
         
         <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50/30">
            <button 
               onClick={() => setSelectedResultCandidateId(null)}
               className={`w-full text-left p-3 rounded-xl border transition-all ${!selectedCandidate ? 'bg-indigo-600 text-white shadow-md' : 'bg-white hover:bg-indigo-50 text-slate-600 border-slate-100'}`}
            >
               <div className="text-[10px] font-black uppercase tracking-widest mb-1">Oversikt</div>
               <div className="text-xs font-bold">Hele klassen</div>
            </button>
            
            {activeProject.candidates
              .filter(c => c.name.toLowerCase().includes(filterQuery.toLowerCase()))
              .sort((a,b) => a.name.localeCompare(b.name))
              .map(c => {
                 const isSelected = c.id === selectedResultCandidateId;
                 const isEvaluated = c.status === 'evaluated';
                 
                 return (
                   <button 
                      key={c.id} 
                      onClick={() => isEvaluated ? setSelectedResultCandidateId(c.id) : handleEvaluateCandidate(c.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden group ${isSelected ? 'bg-slate-900 text-white shadow-md' : isEvaluated ? 'bg-white hover:border-indigo-200' : 'bg-slate-50 opacity-70 hover:opacity-100'}`}
                   >
                      <div className="flex justify-between items-center mb-1">
                         <div className={`font-bold text-xs truncate ${!isEvaluated ? 'text-slate-400' : ''}`}>{c.name}</div>
                         {isEvaluated && <div className={`text-[10px] font-black ${isSelected ? 'text-emerald-400' : 'text-emerald-600'}`}>{c.evaluation?.grade || '-'}</div>}
                      </div>
                      {!isEvaluated && (
                          <div className="text-[8px] font-black uppercase text-indigo-500 tracking-widest flex items-center gap-1">
                             <span>Start Vurdering</span>
                             <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                          </div>
                      )}
                      {isEvaluated && (
                          <div className={`text-[8px] font-black uppercase tracking-widest ${isSelected ? 'text-slate-400' : 'text-slate-300'}`}>
                             {c.evaluation?.score} Poeng
                          </div>
                      )}
                   </button>
                 );
              })}
         </div>
         
         <div className="p-4 border-t bg-slate-50/50">
             {rubricStatus.loading ? (
                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm animate-pulse">
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">Jobber...</span>
                      {progress?.etaSeconds && <span className="text-[8px] font-bold text-emerald-600">{formatEta(progress.etaSeconds)}</span>}
                   </div>
                   {progress && progress.batchTotal > 0 && (
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                         <div className="h-full bg-indigo-500 transition-all duration-300 rounded-full" style={{ width: `${(progress.batchCompleted / progress.batchTotal) * 100}%` }}></div>
                      </div>
                   )}
                   <div className="text-[8px] text-slate-400 font-medium truncate">{rubricStatus.text}</div>
                </div>
             ) : (
                <button 
                  onClick={() => handleEvaluateAll()} 
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                >
                  Vurder Alle (Auto)
                </button>
             )}
         </div>
      </aside>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-8 print:p-0 print:overflow-visible h-full bg-[#F8FAFC]">
         <div className="max-w-[1600px] mx-auto space-y-8 pb-20 print:max-w-none print:pb-0">
            {!selectedCandidate ? (
               <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                  <header>
                     <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Klasseoversikt</h2>
                     <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mt-2">Samlet statistikk for {evaluatedCandidates.length} vurderte kandidater</p>
                  </header>
                  
                  {evaluatedCandidates.length === 0 ? (
                     <div className="p-20 text-center border-2 border-dashed border-slate-200 rounded-[32px] opacity-50">
                        <div className="text-6xl mb-4 grayscale opacity-30">📊</div>
                        <h3 className="text-lg font-black text-slate-400 uppercase tracking-widest">Ingen resultater ennå</h3>
                        <p className="text-sm text-slate-400 mt-2">Start vurdering av kandidater i menyen til venstre.</p>
                     </div>
                  ) : (
                     <>
                        <GroupStats candidates={activeProject.candidates} project={activeProject} />
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[400px]">
                           <TaskAnalysisChart data={analysisData} />
                           {/* Add Group Radar here if wanted, or other stats */}
                           <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center justify-center">
                              <h3 className="text-xl font-black text-slate-800 mb-8 tracking-tighter self-start">Ferdighetsprofil (Snitt)</h3>
                              {/* Calculate avg skills for group */}
                              {(() => {
                                  const skillsMap: Record<string, { total: number, max: number }> = {};
                                  activeProject.rubric?.criteria.forEach(c => {
                                      const tema = c.tema || "Generelt";
                                      if (!skillsMap[tema]) skillsMap[tema] = { total: 0, max: 0 };
                                      skillsMap[tema].max += (c.maxPoints || 0) * evaluatedCandidates.length;
                                  });
                                  
                                  evaluatedCandidates.forEach(c => {
                                      c.evaluation?.taskBreakdown?.forEach(t => {
                                          // Find tema
                                          const crit = activeProject.rubric?.criteria.find(crit => matchEvaluationToCriterion(t, crit));
                                          if (crit && crit.tema) {
                                              if (skillsMap[crit.tema]) skillsMap[crit.tema].total += t.score;
                                          }
                                      });
                                  });
                                  
                                  const skills = Object.entries(skillsMap)
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
               </div>
            ) : (
               <div className="animate-in fade-in slide-in-from-right-4 relative">
                  {/* v8.3.0: Print Config Menu */}
                  {showPrintMenu && (
                      <div className="absolute top-12 left-0 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-64 animate-in fade-in zoom-in-95 print:hidden">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 border-b pb-2">Utskriftsvalg</h4>
                          <div className="space-y-2">
                              {Object.keys(DEFAULT_PRINT_CONFIG).map(key => {
                                  const k = key as keyof PrintConfig;
                                  const labels: Record<string, string> = {
                                      showGrade: 'Vis Karakter',
                                      showScore: 'Vis Poeng',
                                      showPercent: 'Vis Prosent',
                                      showFeedback: 'Vis Kommentar',
                                      showRadar: 'Vis Ferdighetsprofil',
                                      showGrowth: 'Vis Vekstpunkter',
                                      showTable: 'Vis Oppgavetabell',
                                      showCommentsInTable: 'Vis Tabellkommentarer'
                                  };
                                  return (
                                      <label key={k} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded-lg">
                                          <input 
                                              type="checkbox" 
                                              checked={printConfig[k]} 
                                              onChange={() => setPrintConfig(prev => ({...prev, [k]: !prev[k]}))}
                                              className="accent-indigo-600 w-4 h-4 rounded" 
                                          />
                                          <span className="text-xs font-medium text-slate-700">{labels[k] || k}</span>
                                      </label>
                                  );
                              })}
                          </div>
                          <button onClick={() => window.print()} className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700">
                              Skriv ut nå →
                          </button>
                      </div>
                  )}

                  <div className="flex justify-between items-center mb-6 print:hidden">
                     <button onClick={() => setShowPrintMenu(!showPrintMenu)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                        <span>🖨️</span> Utskriftsvalg {showPrintMenu ? '▲' : '▼'}
                     </button>
                     
                     <div className="flex gap-2">
                        {/* Config Toggles could go here as a dropdown */}
                        <button onClick={() => onNavigateToReview(selectedCandidate.id)} className="bg-white border border-indigo-100 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all">
                           Se Transkripsjon →
                        </button>
                        <button onClick={() => handleEvaluateCandidate(selectedCandidate.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md">
                           Vurder på nytt ↻
                        </button>
                     </div>
                  </div>

                  <CandidateReport 
                     candidate={selectedCandidate} 
                     project={activeProject} 
                     config={printConfig} 
                     onNavigateToTask={onNavigateToTask}
                  />
               </div>
            )}
         </div>
      </main>
    </div>
  );
};
