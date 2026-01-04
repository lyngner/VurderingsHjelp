
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
    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm overflow-x-auto custom-scrollbar h-full print:hidden">
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
    <div className="flex flex-col items-center print:scale-90 print:-mt-4">
      <div className="flex gap-4 mb-4 print:hidden">
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
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
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
  showPercent: boolean;
  showRadar: boolean;
  showGrowth: boolean;
  showFeedback: boolean;
  showTable: boolean;
  showCommentsInTable: boolean;
}

const DEFAULT_PRINT_CONFIG: PrintConfig = {
  showGrade: true,
  showScore: true,
  showPercent: true,
  showRadar: true,
  showGrowth: true,
  showFeedback: true,
  showTable: true,
  showCommentsInTable: true,
};

// --- CANDIDATE REPORT COMPONENT (A4 Optimized) ---
const CandidateReport: React.FC<{
  candidate: Candidate;
  project: Project;
  config: PrintConfig;
  onNavigateToReview?: (id: string) => void;
  isBatchMode?: boolean;
}> = ({ candidate, project, config, onNavigateToReview, isBatchMode }) => {
  const [isEditingFeedback, setIsEditingFeedback] = useState(false);
  const [tempFeedback, setTempFeedback] = useState('');

  // Re-calculate skills locally for the component
  const uniqueThemes = useMemo(() => {
    const themes = new Set<string>();
    project.rubric?.criteria.forEach(c => { if (c.tema && c.tema.trim()) themes.add(c.tema.trim()); });
    return Array.from(themes).sort();
  }, [project.rubric]);

  const candidateSkills = useMemo(() => {
    if (!candidate.evaluation || uniqueThemes.length === 0 || !project.rubric) return [];
    const breakdown = candidate.evaluation.taskBreakdown;
    const themeMap: Record<string, { total: number, max: number }> = {};
    uniqueThemes.forEach(t => themeMap[t] = { total: 0, max: 0 });
    
    breakdown.forEach(t => {
      const criterion = project.rubric?.criteria.find(crit => 
        String(crit.taskNumber) === String(t.taskNumber) &&
        String(crit.subTask || '').toLowerCase() === String(t.subTask || '').toLowerCase()
      );
      const tema = criterion?.tema?.trim();
      if (tema && themeMap[tema]) {
        themeMap[tema].total += t.score;
        themeMap[tema].max += criterion?.maxPoints || t.max;
      }
    });
    return Object.entries(themeMap)
      .filter(([_, val]) => val.max > 0)
      .map(([tema, val]) => ({
        tema,
        value: Math.round((val.total / val.max) * 100),
        avg: 0 // Avg not needed for single print
      }));
  }, [candidate, uniqueThemes, project.rubric]);

  const getPercentage = () => {
    if (!candidate.evaluation || !project.rubric?.totalMaxPoints) return 0;
    return Math.round((candidate.evaluation.score / project.rubric.totalMaxPoints) * 100);
  };

  const handleUpdateFeedback = async () => {
    const updatedCandidate = {
      ...candidate,
      evaluation: { ...candidate.evaluation!, feedback: tempFeedback }
    };
    await saveCandidate(updatedCandidate);
    // Note: Parent state update is not handled here in batch mode, but save is persistent
    setIsEditingFeedback(false);
  };

  const cleanComment = (text: string) => {
    // Remove pattern like "[-0.5 p]" or "[ -1.0p ]" from start of string
    return text.replace(/^\[-?\d+(?:[.,]\d+)?\s*p\]\s*/i, '');
  };

  return (
    <div className={`bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 mb-8 print:shadow-none print:border-0 print:p-0 print:mb-0 print:break-after-page relative overflow-hidden ${isBatchMode ? '' : 'animate-in slide-in-from-right-8 duration-500'}`}>
      
      {/* Header */}
      <header className="flex justify-between items-start mb-8 print:mb-4 border-b border-slate-100 pb-6 print:pb-2">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter print:text-2xl">{candidate.name}</h2>
          {!isBatchMode && (
            <div className="flex items-center gap-4 mt-2 print:hidden">
              <button 
                onClick={() => onNavigateToReview && onNavigateToReview(candidate.id)}
                className="text-[9px] font-black uppercase text-indigo-600 hover:bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg transition-all flex items-center gap-1"
              >
                🔍 Se besvarelse
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-4 items-center">
          {config.showGrade && (
            <div className="text-center bg-slate-900 text-white px-6 py-4 rounded-[20px] shadow-lg print:shadow-none print:bg-transparent print:text-black print:border print:px-4 print:py-2">
              <div className="text-3xl font-black leading-none print:text-2xl">{candidate.evaluation?.grade || '-'}</div>
              <div className="text-[8px] font-black uppercase mt-1 tracking-widest text-slate-500">Karakter</div>
            </div>
          )}
          {(config.showScore || config.showPercent) && (
            <div className="text-center bg-white border px-5 py-3 rounded-[20px] print:border print:px-4 print:py-2">
              <div className="text-xl font-black leading-none text-indigo-600 print:text-black">
                {config.showScore && <span>{candidate.evaluation?.score || 0}</span>}
                {config.showScore && config.showPercent && <span className="mx-1 text-slate-300">/</span>}
                {config.showPercent && <span>{getPercentage()}%</span>}
              </div>
              <div className="text-[8px] font-black uppercase mt-1 tracking-widest text-slate-400">Resultat</div>
            </div>
          )}
        </div>
      </header>

      {/* Skills & Growth */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 print:grid-cols-2 print:gap-4 print:mb-4 ${(!config.showRadar && !config.showGrowth) ? 'hidden' : ''}`}>
        {config.showRadar && (
          <section className="bg-white p-6 rounded-[30px] border border-slate-100 flex flex-col items-center print:border print:rounded-xl print:p-2">
            <h3 className="font-black text-[11px] uppercase text-slate-800 tracking-[0.2em] mb-4 self-start print:mb-1 print:text-[9px]">Ferdighetsprofil</h3>
            <div className="w-full flex justify-center">
               <SkillRadarChart skills={candidateSkills} />
            </div>
          </section>
        )}

        {config.showGrowth && (
          <section className="bg-emerald-50/50 p-8 rounded-[30px] border border-emerald-100 relative print:bg-transparent print:border-slate-200 print:rounded-xl print:p-4">
            <h3 className="font-black text-[11px] uppercase text-emerald-700 tracking-[0.2em] mb-6 print:text-black print:mb-2 print:text-[9px]">Vekstpunkter</h3>
            <ul className="space-y-4 print:space-y-1">
              {candidate.evaluation?.vekstpunkter?.map((v, i) => (
                <li key={i} className="flex gap-3 text-sm font-bold text-emerald-900 items-start print:text-[10px] print:text-black">
                  <span className="shrink-0 text-emerald-500 mt-0.5 print:hidden">✓</span> 
                  <span className="print:block hidden text-slate-800 mr-1">•</span>
                  <LatexRenderer content={v} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Feedback */}
      {config.showFeedback && (
        <section className="bg-slate-900 p-10 rounded-[35px] text-white shadow-xl mb-8 print:bg-transparent print:text-black print:shadow-none print:p-0 print:rounded-none print:mb-4 print:border-t print:border-b print:py-4">
            <div className="flex justify-between items-center mb-6 print:mb-2">
              <h3 className="font-black text-[11px] uppercase text-indigo-400 tracking-[0.3em] print:text-black print:tracking-widest">Tilbakemelding</h3>
              {!isBatchMode && (
                <button 
                  onClick={() => {
                    if (isEditingFeedback) handleUpdateFeedback();
                    else {
                      setTempFeedback(candidate.evaluation?.feedback || "");
                      setIsEditingFeedback(true);
                    }
                  }} 
                  className="text-[9px] font-black uppercase text-indigo-300 hover:text-white transition-all border border-indigo-700 px-3 py-1 rounded-full no-print"
                >
                  {isEditingFeedback ? 'Lagre' : 'Rediger'}
                </button>
              )}
            </div>
            
            {isEditingFeedback ? (
              <textarea 
                value={tempFeedback}
                onChange={(e) => setTempFeedback(e.target.value)}
                className="w-full h-64 bg-slate-800 text-white p-4 rounded-xl text-sm font-medium outline-none border border-slate-700"
              />
            ) : (
              <div className="text-indigo-50 text-base leading-relaxed font-medium print:text-black print:text-[10px] print:leading-normal print:text-justify">
                <LatexRenderer content={candidate.evaluation?.feedback || ""} />
              </div>
            )}
        </section>
      )}

      {/* Table */}
      {config.showTable && (
        <section className="print:break-inside-avoid">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DEL 1 */}
            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden flex flex-col print:border-slate-200 print:shadow-none">
              <div className="bg-indigo-600 text-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-center print:bg-slate-100 print:text-black print:border-b print:border-slate-300">Del 1</div>
              <div className="divide-y divide-indigo-50 p-2 print:divide-slate-100">
                {candidate.evaluation?.taskBreakdown
                  .filter(t => !project.rubric?.criteria.find(c => 
                    String(c.taskNumber) === String(t.taskNumber) && 
                    String(c.subTask||'').toLowerCase() === String(t.subTask||'').toLowerCase()
                  )?.part?.includes("2"))
                  .map((t, i) => {
                    const rubricTask = project.rubric?.criteria.find(c => 
                      String(c.taskNumber) === String(t.taskNumber) && 
                      String(c.subTask||'').toLowerCase() === String(t.subTask||'').toLowerCase()
                    );
                    const realMax = rubricTask ? rubricTask.maxPoints : t.max;
                    const isPerfect = t.score >= realMax;
                    const isOver = t.score > realMax;

                    return (
                      <div key={i} className="flex gap-3 py-2 items-start group">
                        <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center font-black text-[9px] ${isPerfect ? 'bg-indigo-50 text-indigo-400 print:bg-white print:text-black print:border' : 'bg-indigo-600 text-white print:bg-black print:text-white'}`}>
                          {t.taskNumber}{t.subTask}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex justify-between items-start mb-1">
                            {config.showCommentsInTable && (
                              <div className="text-[10px] font-medium text-slate-600 leading-tight pr-2 print:text-[9px] print:text-black">
                                <LatexRenderer content={cleanComment(t.comment)} />
                              </div>
                            )}
                            <div className={`text-xs font-black whitespace-nowrap ml-auto ${isPerfect ? 'text-emerald-500' : isOver ? 'text-amber-500' : 'text-indigo-600'} print:text-black`}>
                              {t.score.toString().replace('.', ',')} <span className="text-[8px] opacity-40">/ {realMax}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {candidate.evaluation?.taskBreakdown.filter(t => !project.rubric?.criteria.find(c => String(c.taskNumber) === String(t.taskNumber) && String(c.subTask||'').toLowerCase() === String(t.subTask||'').toLowerCase())?.part?.includes("2")).length === 0 && (
                    <div className="text-center py-4 text-[9px] text-slate-400 font-bold uppercase">Ingen oppgaver</div>
                  )}
              </div>
            </div>

            {/* DEL 2 */}
            <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden flex flex-col print:border-slate-200 print:shadow-none">
              <div className="bg-emerald-600 text-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-center print:bg-slate-100 print:text-black print:border-b print:border-slate-300">Del 2</div>
              <div className="divide-y divide-emerald-50 p-2 print:divide-slate-100">
                {candidate.evaluation?.taskBreakdown
                  .filter(t => project.rubric?.criteria.find(c => 
                    String(c.taskNumber) === String(t.taskNumber) && 
                    String(c.subTask||'').toLowerCase() === String(t.subTask||'').toLowerCase()
                  )?.part?.includes("2"))
                  .map((t, i) => {
                    const rubricTask = project.rubric?.criteria.find(c => 
                      String(c.taskNumber) === String(t.taskNumber) && 
                      String(c.subTask||'').toLowerCase() === String(t.subTask||'').toLowerCase()
                    );
                    const realMax = rubricTask ? rubricTask.maxPoints : t.max;
                    const isPerfect = t.score >= realMax;
                    const isOver = t.score > realMax;

                    return (
                      <div key={i} className="flex gap-3 py-2 items-start group">
                        <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center font-black text-[9px] ${isPerfect ? 'bg-emerald-50 text-emerald-400 print:bg-white print:text-black print:border' : 'bg-emerald-600 text-white print:bg-black print:text-white'}`}>
                          {t.taskNumber}{t.subTask}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex justify-between items-start mb-1">
                            {config.showCommentsInTable && (
                              <div className="text-[10px] font-medium text-slate-600 leading-tight pr-2 print:text-[9px] print:text-black">
                                <LatexRenderer content={cleanComment(t.comment)} />
                              </div>
                            )}
                            <div className={`text-xs font-black whitespace-nowrap ml-auto ${isPerfect ? 'text-emerald-500' : isOver ? 'text-amber-500' : 'text-emerald-600'} print:text-black`}>
                              {t.score.toString().replace('.', ',')} <span className="text-[8px] opacity-40">/ {realMax}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {candidate.evaluation?.taskBreakdown.filter(t => project.rubric?.criteria.find(c => String(c.taskNumber) === String(t.taskNumber) && String(c.subTask||'').toLowerCase() === String(t.subTask||'').toLowerCase())?.part?.includes("2")).length === 0 && (
                    <div className="text-center py-4 text-[9px] text-slate-400 font-bold uppercase">Ingen oppgaver</div>
                  )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

interface ResultsStepProps {
  activeProject: Project;
  selectedResultCandidateId: string | null;
  setSelectedResultCandidateId: (id: string | null) => void;
  handleEvaluateAll: (force?: boolean) => void;
  handleEvaluateCandidate: (id: string) => void;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
  onNavigateToReview: (candidateId: string) => void;
}

export const ResultsStep: React.FC<ResultsStepProps> = ({
  activeProject,
  selectedResultCandidateId,
  setSelectedResultCandidateId,
  handleEvaluateAll,
  handleEvaluateCandidate,
  handleGenerateRubric,
  rubricStatus,
  onNavigateToReview
}) => {
  const [candidateFilter, setCandidateFilter] = useState('');
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [showBatchExportModal, setShowBatchExportModal] = useState(false);
  const [showUnknowns, setShowUnknowns] = useState(false);
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);

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

    return filtered.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aIsUnknown = aName.includes("ukjent");
      const bIsUnknown = bName.includes("ukjent");
      if (aIsUnknown && !bIsUnknown) return 1;
      if (!aIsUnknown && bIsUnknown) return -1;
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [candidates, candidateFilter, showUnknowns]);

  const currentCandidate = useMemo(() => 
    candidates.find(c => c.id === selectedResultCandidateId), 
    [candidates, selectedResultCandidateId]
  );

  // FIX v7.9.31: Part-Aware Completion Check
  const getCandidateStatus = (candidate: Candidate) => {
    if (!activeProject.rubric) return { missing: [], isComplete: false, foundTasks: [] };

    // 1. Bygg fasit-sett med DEL-ID for presis matching
    const rubricTasks = new Set<string>();
    // Lagre også originalt label for visning
    const displayLabels: Record<string, string> = {}; 

    activeProject.rubric.criteria.forEach(c => {
      const part = (c.part || "Del 1").toLowerCase().includes("2") ? "2" : "1";
      const label = `${c.taskNumber}${c.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const key = `${part}-${label}`;
      rubricTasks.add(key);
      displayLabels[key] = label;
    });

    const foundTasks = new Set<string>();
    const foundTasksDetails: { label: string, isDel2: boolean }[] = [];

    candidate.pages.forEach(p => {
      const isDel2 = (p.part || "Del 1").toLowerCase().includes("2");
      const part = isDel2 ? "2" : "1";
      p.identifiedTasks?.forEach(t => {
        const label = `${t.taskNumber}${t.subTask || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const key = `${part}-${label}`;
        
        if (rubricTasks.has(key)) {
          if (!foundTasks.has(key)) {
            foundTasks.add(key);
            foundTasksDetails.push({ label, isDel2 });
          }
        }
      });
    });

    // 2. Sammenlign settene
    // Missing er nå nøkler som mangler (Part-Aware)
    const missingKeys = Array.from(rubricTasks).filter(t => !foundTasks.has(t));
    const missing = missingKeys.map(key => {
       const label = displayLabels[key];
       const part = key.startsWith('2') ? 'Del 2' : 'Del 1';
       return `${label} (${part})`;
    });
    
    // Sort found tasks for display
    const sortedFound = foundTasksDetails.sort((a,b) => {
      const numA = parseInt(a.label.replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(b.label.replace(/[^0-9]/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return a.label.localeCompare(b.label);
    });

    return { 
      missing, 
      isComplete: rubricTasks.size > 0 && missing.length === 0, 
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
        // v7.9.7: Robust matching
        const match = c.evaluation?.taskBreakdown.find(t => 
          String(t.taskNumber) === String(crit.taskNumber) &&
          String(t.subTask || '').toLowerCase() === String(crit.subTask || '').toLowerCase()
        );
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

  // v7.9.7: RADAR FIX - Look up themes from Rubric (source of truth) instead of evaluation
  const averageSkills = useMemo(() => {
    if (uniqueThemes.length === 0 || !activeProject.rubric) return {};
    const evaluated = candidates.filter(c => c.status === 'evaluated' && c.evaluation);
    const themeMap: Record<string, { total: number, max: number }> = {};
    uniqueThemes.forEach(t => themeMap[t] = { total: 0, max: 0 });
    
    evaluated.forEach(c => {
      c.evaluation?.taskBreakdown.forEach(t => {
        // Find matching criterion to get the CORRECT theme
        const criterion = activeProject.rubric?.criteria.find(crit => 
          String(crit.taskNumber) === String(t.taskNumber) &&
          String(crit.subTask || '').toLowerCase() === String(t.subTask || '').toLowerCase()
        );
        const tema = criterion?.tema?.trim();
        
        if (tema && themeMap[tema]) {
          themeMap[tema].total += t.score;
          themeMap[tema].max += criterion?.maxPoints || t.max;
        }
      });
    });
    const results: Record<string, number> = {};
    Object.entries(themeMap).forEach(([tema, val]) => {
      if (val.max > 0) results[tema] = Math.round((val.total / val.max) * 100);
    });
    return results;
  }, [candidates, uniqueThemes, activeProject.rubric]);

  const groupRadarData = useMemo(() => {
    return uniqueThemes.map(t => ({
      tema: t,
      value: averageSkills[t] || 0,
      avg: averageSkills[t] || 0 // For group chart, we just use the average as the main value
    }));
  }, [uniqueThemes, averageSkills]);

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
                
                // v7.9.10: Prosentkalkulering
                const maxPoints = activeProject.rubric?.totalMaxPoints || 1;
                const percent = isEvaluated ? Math.round(((totalScore || 0) / maxPoints) * 100) : 0;

                return (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors group ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}>
                    <td onClick={() => onNavigateToReview(c.id)} className="px-4 py-2 border-r border-slate-50 sticky left-0 bg-inherit group-hover:bg-slate-50 z-10 cursor-pointer hover:bg-indigo-50 transition-all" title="Klikk for å se besvarelsen">
                      <div className="flex items-center gap-1 group-hover/td:text-indigo-600">
                        <div className="text-[11px] font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{c.name}</div>
                        <span className="text-[9px] opacity-0 group-hover:opacity-100 text-indigo-400">↗</span>
                      </div>
                    </td>
                    {allCriteria.map(crit => {
                      // v7.9.7: Robust matching
                      const evalMatch = c.evaluation?.taskBreakdown.find(tb => 
                        String(tb.taskNumber) === String(crit.taskNumber) &&
                        String(tb.subTask || '').toLowerCase() === String(crit.subTask || '').toLowerCase()
                      );
                      const isIdentified = c.pages.some(p => p.identifiedTasks?.some(it => 
                        String(it.taskNumber) === String(crit.taskNumber) &&
                        String(it.subTask || '').toLowerCase() === String(crit.subTask || '').toLowerCase()
                      ));
                      
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
                      <div className="flex flex-col items-center">
                        <div className="text-[11px] font-black text-indigo-700">
                          {isEvaluated ? totalScore?.toString().replace('.', ',') : '-'}
                        </div>
                        {isEvaluated && (
                          <div className="text-[8px] font-bold text-indigo-400">({percent}%)</div>
                        )}
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

  const handleBatchPrint = () => {
    setIsBatchPrinting(true);
    setTimeout(() => {
      window.print();
      // Reset is handled when the user focuses back or manually
      // We can also reset on a timer, but let's keep the print view for a bit or until modal closes
      const afterPrint = () => {
        setIsBatchPrinting(false);
        setShowBatchExportModal(false);
        window.removeEventListener('afterprint', afterPrint);
      };
      window.addEventListener('afterprint', afterPrint);
    }, 500);
  };

  if (isBatchPrinting) {
    return (
      <div className="bg-white min-h-screen">
        {filteredCandidates.filter(c => c.status === 'evaluated').map(c => (
          <CandidateReport 
            key={c.id} 
            candidate={c} 
            project={activeProject} 
            config={printConfig} 
            isBatchMode={true} 
          />
        ))}
      </div>
    );
  }

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
             onClick={() => setShowBatchExportModal(true)}
             className="w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
           >
             📄 Eksporter Valgte (PDF)
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
                  <div className="flex items-center gap-1.5">
                     <div className="font-bold text-[10px] truncate max-w-[100px]">{c.name}</div>
                     {isComplete && <span className="text-[10px]" title="Alle oppgaver funnet">✅</span>}
                  </div>
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
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50/30 p-8 custom-scrollbar relative print:p-0 print:bg-white print:overflow-visible print:w-full">
        {/* Batch Export Modal */}
        {showBatchExportModal && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-[32px] p-8 shadow-2xl max-w-md w-full border border-white/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Eksportinnstillinger</h3>
                <button onClick={() => setShowBatchExportModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
              </div>
              
              <div className="space-y-4 mb-8">
                <p className="text-[10px] font-medium text-slate-500">
                  Du eksporterer rapporter for <strong className="text-slate-800">{filteredCandidates.filter(c => c.status === 'evaluated').length}</strong> ferdigrettede kandidater.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'showGrade', label: 'Vis Karakter' },
                    { key: 'showScore', label: 'Vis Poeng' },
                    { key: 'showPercent', label: 'Vis Prosent' },
                    { key: 'showFeedback', label: 'Vis Tilbakemelding' },
                    { key: 'showRadar', label: 'Vis Ferdighetsprofil' },
                    { key: 'showGrowth', label: 'Vis Vekstpunkter' },
                    { key: 'showTable', label: 'Vis Oppgavetabell' },
                    { key: 'showCommentsInTable', label: 'Vis Kommentarer' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition-all border border-slate-100">
                      <input 
                        type="checkbox" 
                        checked={printConfig[opt.key as keyof PrintConfig]} 
                        onChange={() => setPrintConfig(prev => ({...prev, [opt.key]: !prev[opt.key as keyof PrintConfig]}))}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                      />
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowBatchExportModal(false)} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">Avbryt</button>
                <button onClick={handleBatchPrint} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg transition-all">Start Eksport</button>
              </div>
            </div>
          </div>
        )}

        {!selectedResultCandidateId ? (
          <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex justify-between items-center">
              <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Resultater</h2>
                <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mt-2">Visuell Analyse v6.2.4</p>
              </div>
              <button onClick={() => window.print()} className="bg-indigo-600 px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:bg-indigo-700 no-print transition-all hover:scale-105">
                📄 Eksporter Oversikt
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
            <div className="flex justify-between items-center mb-6 no-print">
               <div className="flex gap-2">
                  <button onClick={() => setSelectedResultCandidateId(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-all tracking-[0.2em]">← Tilbake</button>
               </div>
               <div className="flex gap-2">
                  <button 
                    onClick={() => setShowPrintSettings(!showPrintSettings)}
                    className="text-[9px] font-black uppercase bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all px-4 py-2 rounded-xl flex items-center gap-2"
                  >
                    ⚙️ Tilpass visning
                  </button>
                  <button 
                    onClick={() => currentCandidate && handleSafeEvaluation(currentCandidate.id)} 
                    disabled={rubricStatus.loading}
                    className="text-[9px] font-black uppercase bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50"
                  >
                    🔄 Re-evaluér
                  </button>
               </div>
            </div>

            {/* Print Settings Modal (Local) */}
            {showPrintSettings && (
              <div className="absolute top-24 right-8 z-50 bg-white p-6 rounded-2xl shadow-2xl border border-slate-100 no-print w-64 animate-in fade-in">
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
              <CandidateReport 
                candidate={currentCandidate} 
                project={activeProject} 
                config={printConfig} 
                onNavigateToReview={onNavigateToReview}
              />
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
          </div>
        )}
      </main>
    </div>
  );
};
