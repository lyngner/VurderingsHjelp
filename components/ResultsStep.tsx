
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
        <aside className="w-80 bg-white border-r overflow-y-auto p-6 shrink-0 no-print flex flex-col">
          <div className="bg-slate-800 p-8 rounded-[40px] text-white shadow-xl mb-6 text-center">
             <p className="text-[8px] font-black uppercase opacity-60 tracking-widest">Kontrollpanel</p>
             <div className="text-2xl font-black mt-2">Vurdering</div>
          </div>
          <div className="space-y-3 mb-8">
             <button onClick={handleEvaluateAll} disabled={rubricStatus.loading} className="w-full p-5 rounded-[30px] bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
               {rubricStatus.loading ? <Spinner size="w-4 h-4" color="text-white" /> : '🚀 Start Vurdering'}
             </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
            {candidates.map(c => (
              <button key={c.id} onClick={() => setSelectedResultCandidateId(c.id)} className="w-full text-left p-4 rounded-2xl border bg-white hover:border-indigo-200 transition-all">
                <div className="font-black text-[11px] truncate">{c.name}</div>
                <div className="text-[8px] font-bold uppercase opacity-50 mt-1">{c.status === 'evaluated' ? `Karakter: ${c.evaluation?.grade}` : 'Venter...'}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-slate-50/50 p-12">
           <div className="max-w-6xl mx-auto space-y-10">
              <header className="flex justify-between items-end">
                <h2 className="text-4xl font-black text-slate-800 tracking-tighter">Gruppeoversikt</h2>
                <button onClick={() => window.print()} className="bg-white border px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest text-slate-500 shadow-sm no-print">Skriv ut ⎙</button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-[45px] shadow-sm border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Snittpoeng</span>
                  <div className="text-4xl font-black text-indigo-600 mt-2">{stats?.avgScore || 0} <span className="text-lg text-slate-300">/ {stats?.maxPoints}</span></div>
                </div>
                <div className="bg-white p-8 rounded-[45px] shadow-sm border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ferdig Vurdert</span>
                  <div className="text-4xl font-black text-slate-800 mt-2">{stats?.count || 0} <span className="text-lg text-slate-300">av {candidates.length}</span></div>
                </div>
                <div className="bg-indigo-600 p-8 rounded-[45px] shadow-xl text-white flex flex-col justify-between">
                  <span className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Karakterer</span>
                  <div className="flex items-end gap-1 mt-4 h-10">
                    {['1','2','3','4','5','6'].map(g => (
                      <div key={g} className="flex-1 bg-white/20 rounded-t-sm" style={{ height: `${(stats?.gradeDist[g] || 0) * 20 + 5}%` }}></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[50px] border shadow-sm overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-slate-50 border-b font-black uppercase text-slate-400">
                    <tr><th className="p-8">Kandidat</th><th className="p-8">Poeng</th><th className="p-8">Karakter</th><th className="p-8 text-right">Rapport</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {candidates.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="p-8 font-black">{c.name}</td>
                        <td className="p-8 font-bold">{c.evaluation?.score || 0} / {stats?.maxPoints}</td>
                        <td className="p-8"><div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black">{c.evaluation?.grade || '-'}</div></td>
                        <td className="p-8 text-right"><button onClick={() => setSelectedResultCandidateId(c.id)} className="text-indigo-600 font-black uppercase text-[10px]">Vis →</button></td>
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
    <div className="h-full overflow-y-auto bg-slate-50/50 p-12 custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-10 pb-40">
        <header className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100 flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
          <div>
            <h2 className="text-3xl font-black text-slate-800">{currentCandidate?.name}</h2>
            <p className="text-slate-400 font-bold uppercase text-[10px] mt-2 tracking-widest">Individuell vurderingsrapport</p>
          </div>
          <div className="text-center bg-indigo-50 text-indigo-600 px-8 py-4 rounded-[30px] border border-indigo-100/50">
            <div className="text-5xl font-black leading-none">{currentCandidate?.evaluation?.grade || '-'}</div>
            <div className="text-[9px] font-black uppercase mt-2 tracking-widest">Karakter</div>
          </div>
        </header>

        {currentCandidate?.status !== 'evaluated' ? (
          <div className="bg-white p-20 rounded-[50px] text-center space-y-6 border border-dashed">
            <Spinner size="w-10 h-10 mx-auto" />
            <p className="font-black uppercase text-[10px] text-slate-400">Vurderer besvarelse...</p>
          </div>
        ) : (
          <>
            <section className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100 space-y-6">
               <h3 className="font-black text-[11px] uppercase text-indigo-600 tracking-widest">Begrunnelse</h3>
               <p className="text-slate-700 leading-relaxed font-medium">{currentCandidate.evaluation?.feedback}</p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="bg-emerald-50 p-10 rounded-[50px] border border-emerald-100">
                <h3 className="font-black text-[11px] uppercase text-emerald-700 tracking-widest mb-6">Mestring</h3>
                <ul className="space-y-3">
                  {currentCandidate.evaluation?.vekstpunkter?.map((v, i) => (
                    <li key={i} className="flex gap-3 text-sm font-bold text-emerald-800">
                      <span>✓</span> {v}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="bg-indigo-600 p-10 rounded-[50px] text-white">
                <h3 className="font-black text-[11px] uppercase text-indigo-200 tracking-widest mb-6">Poengsum</h3>
                <div className="text-6xl font-black">{currentCandidate.evaluation?.score} <span className="text-xl opacity-50">/ {activeProject.rubric?.totalMaxPoints}</span></div>
                <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
                   <div className="h-full bg-white" style={{ width: `${((currentCandidate.evaluation?.score || 0) / (activeProject.rubric?.totalMaxPoints || 1)) * 100}%` }}></div>
                </div>
              </section>
            </div>

            <section className="bg-white rounded-[50px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b bg-slate-50/30">
                <h3 className="font-black text-[11px] uppercase text-slate-400 tracking-widest">Oppgave-for-oppgave</h3>
              </div>
              <table className="w-full text-left text-sm">
                <tbody className="divide-y">
                  {currentCandidate.evaluation?.taskBreakdown.map((t, i) => (
                    <tr key={i}>
                      <td className="p-8 w-32 font-black text-slate-400">{t.taskName}</td>
                      <td className="p-8">
                        <p className="font-bold text-slate-700 mb-1">{t.comment}</p>
                      </td>
                      <td className="p-8 text-right font-black text-indigo-600">{t.score} / {t.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        <div className="flex justify-center pt-10 no-print">
          <button onClick={() => setSelectedResultCandidateId(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors tracking-widest">← Tilbake til oversikt</button>
        </div>
      </div>
    </div>
  );
};
