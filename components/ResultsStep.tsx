import React, { useMemo, useState } from 'react';
import { Project, Candidate, RubricCriterion } from '../types';
import { Spinner, LatexRenderer } from './SharedUI';

interface ResultsStepProps {
  activeProject: Project;
  selectedResultCandidateId: string | null;
  setSelectedResultCandidateId: (id: string | null) => void;
  handleEvaluateAll: (force?: boolean) => void;
  handleEvaluateCandidate: (id: string) => void;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
}

/**
 * ResultsStep v5.5.5: "The Pedagogical Fortress"
 * Ultra-kompakt matrise med mangel-streker, dype elevrapporter og full kontroll.
 */
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
  const candidates = activeProject?.candidates || [];
  
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => 
      !candidateFilter || c.name.toLowerCase().includes(candidateFilter.toLowerCase())
    ).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [candidates, candidateFilter]);

  const currentCandidate = useMemo(() => 
    candidates.find(c => c.id === selectedResultCandidateId), 
    [candidates, selectedResultCandidateId]
  );

  // Ferdighetsprofil-logikk: Grupperer mestring per Tema
  const ferdighetsprofil = useMemo(() => {
    if (!currentCandidate?.evaluation) return [];
    const breakdown = currentCandidate.evaluation.taskBreakdown;
    const temaMap: Record<string, { total: number, max: number }> = {};
    
    breakdown.forEach(t => {
      const tema = t.tema || "Annet";
      if (!temaMap[tema]) temaMap[tema] = { total: 0, max: 0 };
      temaMap[tema].total += t.score;
      temaMap[tema].max += t.max;
    });

    return Object.entries(temaMap).map(([tema, val]) => ({
      tema,
      prosent: Math.round((val.total / (val.max || 1)) * 100),
      label: `${val.total}/${val.max}`
    })).sort((a, b) => b.prosent - a.prosent);
  }, [currentCandidate]);

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

  const sortedCriteria = useMemo(() => {
    if (!activeProject.rubric) return [];
    return [...activeProject.rubric.criteria].sort((a, b) => {
      const partA = (a.part || "Del 1").toLowerCase().includes("2") ? 2 : 1;
      const partB = (b.part || "Del 1").toLowerCase().includes("2") ? 2 : 1;
      if (partA !== partB) return partA - partB;
      const numA = parseInt(String(a.taskNumber).replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(String(b.taskNumber).replace(/[^0-9]/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return (a.subTask || "").localeCompare(b.subTask || "");
    });
  }, [activeProject.rubric]);

  return (
    <div className="flex h-full overflow-hidden bg-[#F8FAFC]">
      {/* SIDEBAR */}
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
             className={`w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${!selectedResultCandidateId ? 'bg-slate-100 border-slate-200 text-slate-800 shadow-inner' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}
           >
             📊 Full oversikt
           </button>
        </div>

        <div className="px-2 mb-3">
          <input 
            type="text" 
            placeholder="Søk kandidat..." 
            className="w-full bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={candidateFilter}
            onChange={e => setCandidateFilter(e.target.value)}
          />
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
          <div className="flex justify-between items-center px-2 mb-2">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kandidater</h4>
            {rubricStatus.loading && <Spinner size="w-3 h-3" color="text-indigo-400" />}
          </div>
          {filteredCandidates.map(c => {
            const isSelected = selectedResultCandidateId === c.id;
            const isEvaluated = c.status === 'evaluated' && c.evaluation;
            return (
              <button 
                key={c.id} 
                onClick={() => setSelectedResultCandidateId(c.id)} 
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all relative group ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white border-slate-100 hover:border-indigo-100'}`}
              >
                <div className="flex justify-between items-center">
                  <div className="font-bold text-[10px] truncate max-w-[120px]">{c.name}</div>
                  <div className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${isEvaluated ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 text-slate-400'}`}>
                    {c.evaluation?.grade || (isEvaluated ? 'OK' : '-')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* HOVEDOMRÅDE */}
      <main className="flex-1 overflow-y-auto bg-slate-50/30 p-8 custom-scrollbar relative">
        {!selectedResultCandidateId ? (
          /* ULTRA-KOMPAKT POENGMATRISE v5.5.5 */
          <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Gruppeoversikt</h2>
                <div className="flex items-center gap-4 mt-2">
                   <p className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em]">Poengmatrise v5.5.5</p>
                   <button onClick={() => handleEvaluateAll(true)} disabled={rubricStatus.loading} className="text-[8px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-1.5">
                    🔄 Re-evaluér alle
                   </button>
                </div>
              </div>
              <button onClick={() => window.print()} className="bg-white border border-slate-200 px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-600 shadow-sm hover:bg-slate-50 no-print flex items-center gap-2">
                🖨️ Skriv ut
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Snittspoeng</span>
                <div className="text-3xl font-black text-indigo-600 mt-2">{stats?.avgScore || 0} <span className="text-sm text-slate-300 font-medium">/ {stats?.maxPoints}</span></div>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fremdrift</span>
                <div className="text-3xl font-black text-slate-800 mt-2">{stats?.count || 0} <span className="text-sm text-slate-300 font-medium">vurdert</span></div>
              </div>
              <div className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white flex justify-between items-center">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Karakterfordeling</span>
                <div className="flex gap-2">
                  {['1','2','3','4','5','6'].map(g => (
                    <div key={g} className="text-center group">
                      <div className="text-[10px] font-black group-hover:text-indigo-400 transition-colors">{g}</div>
                      <div className="text-[8px] text-slate-600 font-black">{stats?.gradeDist[g] || 0}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl overflow-hidden mb-12">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/5 sticky left-0 bg-slate-900 z-10">Kand</th>
                      {sortedCriteria.map(crit => (
                        <th key={crit.name} className="px-1 py-4 text-center border-r border-white/5 min-w-[55px]">
                          <div className="text-[11px] font-black leading-none">{crit.taskNumber}{crit.subTask}</div>
                          <div className="text-[7px] font-black uppercase text-indigo-400 mt-1 opacity-60">{(crit.part || "").includes("2") ? "D2" : "D1"}</div>
                        </th>
                      ))}
                      <th className="px-4 py-4 text-center text-[10px] font-black uppercase tracking-widest bg-indigo-600">Sum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCandidates.map(c => {
                      return (
                        <tr key={c.id} className="hover:bg-indigo-50/20 transition-colors group">
                          <td className="px-6 py-2 border-r border-slate-50 sticky left-0 bg-white group-hover:bg-indigo-50/20 z-10">
                            <div className="text-[11px] font-black text-slate-800 truncate max-w-[140px]">{c.name}</div>
                          </td>
                          {sortedCriteria.map(crit => {
                            const taskLabel = `${crit.taskNumber}${crit.subTask}`;
                            const evalMatch = c.evaluation?.taskBreakdown.find(tb => `${tb.taskNumber}${tb.subTask}` === taskLabel);
                            
                            // Regel 19: Bruk '-' hvis oppgaven ikke er funnet i besvarelsen
                            const isIdentified = c.pages.some(p => p.identifiedTasks?.some(it => `${it.taskNumber}${it.subTask}` === taskLabel));
                            const score = evalMatch ? evalMatch.score : null;
                            const displayScore = (!isIdentified && score === null) ? '-' : (score !== null ? score.toString().replace('.', ',') : '-');
                            const isZeroValue = score === 0 && isIdentified;

                            return (
                              <td key={crit.name} className="px-1 py-2 text-center border-r border-slate-50 font-bold text-[11px]">
                                <span className={isZeroValue ? 'text-rose-500 bg-rose-50 px-1 rounded' : 'text-slate-600'}>
                                  {displayScore}
                                </span>
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-center bg-slate-50/50 group-hover:bg-indigo-100/50 transition-colors">
                            <div className="text-[12px] font-black text-indigo-600">
                              {c.evaluation?.score !== undefined ? c.evaluation.score.toString().replace('.', ',') : '-'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* PEDAGOGISK ELEVRAPPORT v5.5.5 */
          <div className="max-w-4xl mx-auto space-y-8 pb-32 animate-in slide-in-from-right-8 duration-500">
            <header className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{currentCandidate?.name}</h2>
                <div className="flex items-center gap-4 mt-2">
                  <p className="text-slate-400 font-black uppercase text-[9px] tracking-[0.2em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Vurderingsrapport v5.5.5
                  </p>
                  <button 
                    onClick={() => currentCandidate && handleEvaluateCandidate(currentCandidate.id)} 
                    disabled={rubricStatus.loading}
                    className="text-[9px] font-black uppercase text-indigo-600 hover:underline transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    🔄 Re-evaluér eleven
                  </button>
                </div>
              </div>
              <div className="flex gap-6 items-center">
                <div className="text-right">
                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Poengsum</div>
                   <div className="text-2xl font-black text-slate-800">{currentCandidate?.evaluation?.score} / {activeProject.rubric?.totalMaxPoints}</div>
                </div>
                <div className="text-center bg-slate-900 text-white px-8 py-5 rounded-[28px] shadow-2xl">
                  <div className="text-4xl font-black leading-none">{currentCandidate?.evaluation?.grade || '-'}</div>
                  <div className="text-[8px] font-black uppercase mt-2 tracking-widest text-slate-500">Karakter</div>
                </div>
              </div>
            </header>

            {(rubricStatus.loading && rubricStatus.text.includes(currentCandidate?.name || '')) ? (
              <div className="bg-white p-24 rounded-[45px] text-center space-y-8 border-2 border-dashed border-slate-100">
                <Spinner size="w-12 h-12 mx-auto" color="text-indigo-400" />
                <p className="font-black uppercase text-[11px] text-slate-400 tracking-[0.3em] animate-pulse">Analyserer transkripsjoner...</p>
              </div>
            ) : currentCandidate?.status === 'evaluated' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* VEKSTPUNKTER */}
                  <section className="bg-emerald-50/50 p-10 rounded-[45px] border border-emerald-100 relative group overflow-hidden">
                    <div className="absolute top-6 right-6 opacity-10 text-4xl group-hover:scale-110 transition-transform">🌱</div>
                    <h3 className="font-black text-[11px] uppercase text-emerald-700 tracking-[0.2em] mb-8">Vekstpunkter & Mestring</h3>
                    <ul className="space-y-5">
                      {currentCandidate.evaluation?.vekstpunkter?.map((v, i) => (
                        <li key={i} className="flex gap-4 text-[15px] font-bold text-emerald-900 items-start">
                          <span className="shrink-0 w-6 h-6 rounded-lg bg-emerald-200 flex items-center justify-center text-[10px] text-emerald-700 shadow-sm">✓</span> 
                          <LatexRenderer content={v} />
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* FERDIGHETSPROFIL */}
                  <section className="bg-white p-10 rounded-[45px] border border-slate-100 shadow-sm relative group overflow-hidden">
                    <div className="absolute top-6 right-6 opacity-10 text-4xl group-hover:scale-110 transition-transform">📈</div>
                    <h3 className="font-black text-[11px] uppercase text-slate-400 tracking-[0.2em] mb-8">Ferdighetsprofil</h3>
                    <div className="space-y-5">
                      {ferdighetsprofil.map((f, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-600 px-1">
                            <span>{f.tema}</span>
                            <span className="text-indigo-600">{f.label}</span>
                          </div>
                          <div className="h-2.5 bg-slate-50 rounded-full border border-slate-100 overflow-hidden p-0.5">
                             <div className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.3)] transition-all duration-1000 ease-out" style={{ width: `${f.prosent}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* HELHETLIG TILBAKEMELDING */}
                <section className="bg-slate-900 p-12 rounded-[50px] text-white shadow-2xl relative overflow-hidden group">
                   <div className="absolute top-8 right-8 text-7xl opacity-5 group-hover:scale-105 transition-transform">💬</div>
                   <h3 className="font-black text-[11px] uppercase text-indigo-400 tracking-[0.3em] mb-8">Helhetlig tilbakemelding</h3>
                   <div className="text-indigo-50 text-lg leading-relaxed font-medium pl-2">
                      <LatexRenderer content={currentCandidate.evaluation?.feedback || ""} />
                   </div>
                </section>

                {/* OPPGAVESPESIFIKKE KOMMENTARER */}
                <section className="bg-white rounded-[50px] border border-slate-100 shadow-xl overflow-hidden">
                  <div className="px-10 py-6 border-b bg-slate-50/30 flex justify-between items-center">
                    <h3 className="font-black text-[10px] uppercase text-slate-500 tracking-[0.2em]">Spesifisert vurdering</h3>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        <th className="px-10 py-5 w-24">Oppgave</th>
                        <th className="px-10 py-5">Tilbakemelding (Begrunnelse ved trekk)</th>
                        <th className="px-10 py-5 text-right w-32">Poeng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentCandidate.evaluation?.taskBreakdown.map((t, i) => {
                        const isPerfect = t.score >= t.max;
                        return (
                          <tr key={i} className={`group transition-colors ${isPerfect ? 'opacity-40 hover:opacity-70' : 'bg-rose-50/20'}`}>
                            <td className="px-10 py-8">
                               <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[11px] ring-1 ring-slate-200 shadow-sm transition-all ${isPerfect ? 'bg-slate-100 text-slate-500' : 'bg-indigo-600 text-white scale-110 shadow-indigo-100'}`}>
                                 {t.taskNumber}{t.subTask}
                               </div>
                            </td>
                            <td className="px-10 py-8">
                              <div className={`text-base leading-relaxed ${!isPerfect ? 'font-bold text-slate-800' : 'font-medium text-slate-500'}`}>
                                 <LatexRenderer content={t.comment} />
                              </div>
                            </td>
                            <td className={`px-10 py-8 text-right font-black text-lg tabular-nums whitespace-nowrap ${isPerfect ? 'text-slate-400' : 'text-indigo-600'}`}>
                               {t.score.toString().replace('.', ',')} <span className="text-[10px] opacity-30 font-medium tracking-normal">/ {t.max}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              </>
            ) : (
              <div className="bg-white p-24 rounded-[50px] text-center space-y-8 border-2 border-dashed border-slate-100 shadow-sm">
                <div className="text-6xl grayscale opacity-20">📊</div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Kandidaten er ikke vurdert</h3>
                <button 
                  onClick={() => currentCandidate && handleEvaluateCandidate(currentCandidate.id)} 
                  className="bg-indigo-600 text-white px-10 py-4 rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-xl"
                >
                  🚀 Start Vurdering
                </button>
              </div>
            )}

            <div className="flex justify-center pt-12 no-print pb-20">
              <button onClick={() => setSelectedResultCandidateId(null)} className="group flex items-center gap-4 text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-all tracking-[0.2em]">
                ← Tilbake til oversiktsmatrise
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};