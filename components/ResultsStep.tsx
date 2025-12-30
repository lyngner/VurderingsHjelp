
import React, { useMemo } from 'react';
import { Project, Candidate } from '../types';
import { Spinner, LatexRenderer } from './SharedUI';

interface ResultsStepProps {
  activeProject: Project;
  selectedResultCandidateId: string | null;
  setSelectedResultCandidateId: (id: string | null) => void;
  handleEvaluateAll: () => void;
  handleGenerateRubric: () => void;
  rubricStatus: { loading: boolean; text: string };
}

export const ResultsStep: React.FC<ResultsStepProps> = ({
  activeProject,
  selectedResultCandidateId,
  setSelectedResultCandidateId,
  handleEvaluateAll,
  handleGenerateRubric,
  rubricStatus
}) => {
  const candidates = activeProject?.candidates || [];
  const currentCandidate = useMemo(() => 
    candidates.find(c => c.id === selectedResultCandidateId), 
    [candidates, selectedResultCandidateId]
  );

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

  if (!selectedResultCandidateId) {
    return (
      <div className="flex h-full overflow-hidden">
        <aside className="w-64 bg-white border-r overflow-y-auto p-4 shrink-0 no-print flex flex-col">
          <div className="bg-slate-800 p-4 rounded-2xl text-white shadow-lg mb-4 text-center">
             <p className="text-[7px] font-black uppercase opacity-60 tracking-widest">Kontrollpanel</p>
             <div className="text-lg font-black mt-1">Vurdering</div>
          </div>
          <div className="space-y-2 mb-6">
             <button onClick={handleEvaluateAll} disabled={rubricStatus.loading} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
               {rubricStatus.loading ? <Spinner size="w-3 h-3" color="text-white" /> : '🚀 Kjør Vurdering'}
             </button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
            {candidates.map(c => (
              <button key={c.id} onClick={() => setSelectedResultCandidateId(c.id)} className="w-full text-left p-3 rounded-xl border bg-white hover:border-indigo-100 transition-all">
                <div className="font-black text-[10px] truncate">{c.name}</div>
                <div className="text-[7px] font-bold uppercase opacity-50 mt-0.5">{c.status === 'evaluated' ? `Grad: ${c.evaluation?.grade}` : 'Venter'}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-slate-50/50 p-6">
           <div className="max-w-6xl mx-auto space-y-6">
              <header className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Gruppeoversikt</h2>
                <button onClick={() => window.print()} className="bg-white border px-4 py-2 rounded-full font-black text-[9px] uppercase tracking-widest text-slate-500 shadow-sm no-print">Skriv ut</button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Snittpoeng</span>
                  <div className="text-2xl font-black text-indigo-600 mt-1">{stats?.avgScore || 0} <span className="text-sm text-slate-300">/ {stats?.maxPoints}</span></div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fullført</span>
                  <div className="text-2xl font-black text-slate-800 mt-1">{stats?.count || 0} <span className="text-sm text-slate-300">av {candidates.length}</span></div>
                </div>
                <div className="bg-indigo-600 p-6 rounded-2xl shadow-xl text-white">
                  <span className="text-[8px] font-black text-indigo-200 uppercase tracking-widest">Karakterer</span>
                  <div className="flex items-end gap-1 mt-2 h-8">
                    {['1','2','3','4','5','6'].map(g => (
                      <div key={g} className="flex-1 bg-white/20 rounded-t-sm" style={{ height: `${(stats?.gradeDist[g] || 0) * 15 + 10}%` }}></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b font-black uppercase text-slate-400">
                    <tr><th className="px-6 py-4">Kandidat</th><th className="px-6 py-4">Poeng</th><th className="px-6 py-4">Karakter</th><th className="px-6 py-4 text-right">Rapport</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {candidates.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3 font-black">{c.name}</td>
                        <td className="px-6 py-3 font-bold">{c.evaluation?.score || 0} / {stats?.maxPoints}</td>
                        <td className="px-6 py-3"><div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center font-black">{c.evaluation?.grade || '-'}</div></td>
                        <td className="px-6 py-3 text-right"><button onClick={() => setSelectedResultCandidateId(c.id)} className="text-indigo-600 font-black uppercase text-[9px] hover:underline">Vis →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50 p-6 custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-6 pb-20">
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600"></div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
               <LatexRenderer content={currentCandidate?.name || ""} />
            </h2>
            <p className="text-slate-400 font-bold uppercase text-[8px] mt-1 tracking-widest">Vurderingsrapport</p>
          </div>
          <div className="text-center bg-indigo-50 text-indigo-600 px-6 py-3 rounded-xl border border-indigo-100/50">
            <div className="text-3xl font-black leading-none">{currentCandidate?.evaluation?.grade || '-'}</div>
            <div className="text-[8px] font-black uppercase mt-1 tracking-widest">Karakter</div>
          </div>
        </header>

        {currentCandidate?.status !== 'evaluated' ? (
          <div className="bg-white p-10 rounded-2xl text-center space-y-4 border border-dashed">
            <Spinner size="w-8 h-8 mx-auto" />
            <p className="font-black uppercase text-[9px] text-slate-400">Analyserer besvarelse...</p>
          </div>
        ) : (
          <>
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
               <h3 className="font-black text-[10px] uppercase text-indigo-600 tracking-widest">Begrunnelse</h3>
               <div className="text-slate-700 text-sm leading-relaxed font-medium">
                  <LatexRenderer content={currentCandidate.evaluation?.feedback || ""} />
               </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                <h3 className="font-black text-[10px] uppercase text-emerald-700 tracking-widest mb-3">Mestring</h3>
                <ul className="space-y-2">
                  {currentCandidate.evaluation?.vekstpunkter?.map((v, i) => (
                    <li key={i} className="flex gap-2 text-xs font-bold text-emerald-800 items-start">
                      <span className="shrink-0">•</span> 
                      <LatexRenderer content={v} />
                    </li>
                  ))}
                </ul>
              </section>
              <section className="bg-indigo-600 p-6 rounded-2xl text-white">
                <h3 className="font-black text-[10px] uppercase text-indigo-200 tracking-widest mb-2">Poengsum</h3>
                <div className="text-4xl font-black">{currentCandidate.evaluation?.score} <span className="text-lg opacity-50">/ {activeProject.rubric?.totalMaxPoints}</span></div>
                <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                   <div className="h-full bg-white" style={{ width: `${((currentCandidate.evaluation?.score || 0) / (activeProject.rubric?.totalMaxPoints || 1)) * 100}%` }}></div>
                </div>
              </section>
            </div>

            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-slate-50/30">
                <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Oppgave-for-oppgave</h3>
              </div>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y">
                  {currentCandidate.evaluation?.taskBreakdown.map((t, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 w-24 font-black text-slate-400">
                        <LatexRenderer content={t.taskName} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-700">
                           <LatexRenderer content={t.comment} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-indigo-600 whitespace-nowrap">{t.score} / {t.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        <div className="flex justify-center pt-6 no-print">
          <button onClick={() => setSelectedResultCandidateId(null)} className="text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-all tracking-widest">← Tilbake til oversikt</button>
        </div>
      </div>
    </div>
  );
};
