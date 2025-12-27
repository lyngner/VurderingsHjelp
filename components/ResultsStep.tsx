
import React, { useMemo } from 'react';
import { Project } from '../types';
import { Spinner } from './SharedUI';

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

  const stats = useMemo(() => {
    const evaluated = candidates.filter(c => c.status === 'evaluated' && c.evaluation);
    if (evaluated.length === 0) return null;

    const totalScore = evaluated.reduce((acc, c) => acc + (c.evaluation?.score || 0), 0);
    const avgScore = totalScore / evaluated.length;
    
    const grades = evaluated.reduce((acc: Record<string, number>, c) => {
      const g = c.evaluation?.grade || '?';
      acc[g] = (acc[g] || 0) + 1;
      return acc;
    }, {});

    return {
      count: evaluated.length,
      avgScore: avgScore.toFixed(1),
      maxPoints: activeProject.rubric?.totalMaxPoints || 0,
      gradeDist: grades
    };
  }, [candidates, activeProject.rubric]);

  const hasCandidates = (activeProject.candidates?.length || 0) > 0;
  const hasRubric = !!activeProject.rubric;

  return (
    <div className="flex h-full overflow-hidden">
       <aside className="w-80 bg-white border-r overflow-y-auto p-6 shrink-0 no-print flex flex-col">
         <div className="bg-slate-800 p-8 rounded-[40px] text-white shadow-xl mb-6 text-center shrink-0">
            <p className="text-[8px] font-black uppercase opacity-60 tracking-widest">Kontrollpanel</p>
            <div className="text-2xl font-black mt-2">Vurdering</div>
         </div>

         <div className="space-y-3 mb-8">
            <button 
              onClick={handleGenerateRubric} 
              disabled={rubricStatus.loading}
              className={`w-full p-5 rounded-[30px] border transition-all flex items-center gap-4 ${
                rubricStatus.loading ? 'bg-indigo-50 border-indigo-100 text-indigo-300 cursor-not-allowed' : 'bg-white hover:border-indigo-200 text-slate-800'
              }`}
            >
              <span className="text-xl">{rubricStatus.loading ? <Spinner size="w-5 h-5" /> : '📋'}</span>
              <span className="font-black text-[10px] uppercase tracking-widest text-left">Oppdater Manual</span>
            </button>

            {hasRubric && hasCandidates && (
              <button 
                onClick={handleEvaluateAll} 
                disabled={rubricStatus.loading}
                className={`w-full p-5 rounded-[30px] border transition-all flex items-center gap-4 ${
                  rubricStatus.loading ? 'bg-indigo-50 border-indigo-100 text-indigo-300' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'
                }`}
              >
                <span className="text-xl">{rubricStatus.loading ? <Spinner size="w-5 h-5" color="text-white" /> : '🚀'}</span>
                <span className="font-black text-[10px] uppercase tracking-widest text-left">Start Vurdering</span>
              </button>
            )}
         </div>

         <div className="h-px bg-slate-100 mb-8 mx-4"></div>

         <button 
           onClick={() => setSelectedResultCandidateId(null)}
           className={`w-full mb-6 p-5 rounded-[30px] border transition-all flex items-center gap-4 ${selectedResultCandidateId === null ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white hover:border-slate-200 text-slate-600'}`}
         >
           <span className="text-xl">📊</span>
           <span className="font-black text-[11px] uppercase tracking-widest">Gruppeoversikt</span>
         </button>

         <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1">
           {candidates.map(c => (
             <button key={c.id} onClick={() => setSelectedResultCandidateId(c.id)} className={`w-full text-left p-5 rounded-[30px] border transition-all ${selectedResultCandidateId === c.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white hover:border-indigo-200'}`}>
               <div className="flex justify-between items-center mb-1">
                 <span className="font-black text-[11px] truncate flex-1">{c.name}</span>
                 {c.status === 'evaluated' && <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${selectedResultCandidateId === c.id ? 'bg-white/20' : 'bg-emerald-50 text-emerald-600'}`}>{c.evaluation?.score || 0} p</span>}
               </div>
               <div className="text-[8px] font-bold uppercase opacity-60">{c.status === 'evaluated' ? `Karakter: ${c.evaluation?.grade || '-'}` : 'Venter...'}</div>
             </button>
           ))}
         </div>
       </aside>

       <div className="flex-1 overflow-y-auto bg-slate-50/50 p-12 custom-scrollbar">
          {!selectedResultCandidateId ? (
            <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter">Gruppeoversikt</h2>
                  <p className="text-slate-400 font-bold uppercase text-[10px] mt-2 tracking-[0.2em]">{activeProject.name}</p>
                </div>
                <button onClick={() => window.print()} className="bg-white border px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all shadow-sm no-print">Skriv ut oversikt ⎙</button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-[45px] shadow-sm border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gjennomsnitt</span>
                  <div className="text-4xl font-black text-indigo-600 mt-2">{stats?.avgScore || 0} <span className="text-lg text-slate-300 font-bold">/ {stats?.maxPoints || 0} p</span></div>
                </div>
                <div className="bg-white p-8 rounded-[45px] shadow-sm border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Antall Vurdert</span>
                  <div className="text-4xl font-black text-slate-800 mt-2">{stats?.count || 0} <span className="text-lg text-slate-300 font-bold">av {candidates.length}</span></div>
                </div>
                <div className="bg-indigo-600 p-8 rounded-[45px] shadow-xl text-white">
                  <span className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Karakterfordeling</span>
                  <div className="flex items-end gap-1 mt-4 h-12">
                    {['1','2','3','4','5','6'].map(g => {
                      const count = stats?.gradeDist[g] || 0;
                      const height = stats?.count ? (count / stats.count) * 100 : 0;
                      return (
                        <div key={g} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full bg-white/20 rounded-t-sm relative group" style={{ height: `${Math.max(height, 5)}%` }}></div>
                          <span className="text-[8px] font-black opacity-60">{g}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[50px] border shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <tr><th className="p-8">Kandidat</th><th className="p-8">Status</th><th className="p-8">Poengsum</th><th className="p-8">Karakter</th><th className="p-8 text-right">Handling</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {candidates.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-8">
                          <div className="font-black text-slate-800">{c.name}</div>
                          <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter">ID: {c.id}</div>
                        </td>
                        <td className="p-8"><span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${c.status === 'evaluated' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{c.status === 'evaluated' ? 'Vurdert' : 'Venter'}</span></td>
                        <td className="p-8"><div className="text-xl font-black text-slate-700">{c.evaluation?.score || 0} <span className="text-[10px] text-slate-300">/ {stats?.maxPoints || 0}</span></div></td>
                        <td className="p-8"><div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-lg text-slate-800 group-hover:bg-indigo-600 group-hover:text-white transition-all">{c.evaluation?.grade || '-'}</div></td>
                        <td className="p-8 text-right"><button onClick={() => setSelectedResultCandidateId(c.id)} className="text-[10px] font-black uppercase text-indigo-600 hover:underline tracking-widest">Se rapport →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-right duration-300 pb-20">
                  <header className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
                    <div>
                      <h2 className="text-3xl font-black text-slate-800">{activeProject?.candidates?.find(c => c.id === selectedResultCandidateId)?.name}</h2>
                      <p className="text-slate-400 font-bold uppercase text-[10px] mt-2 tracking-[0.2em]">Vurderingsrapport</p>
                    </div>
                    <div className="text-center bg-indigo-50 text-indigo-600 px-8 py-4 rounded-[30px] border border-indigo-100/50">
                      <div className="text-5xl font-black leading-none">{activeProject?.candidates?.find(c => c.id === selectedResultCandidateId)?.evaluation?.grade || '-'}</div>
                      <div className="text-[9px] font-black uppercase mt-2 tracking-widest">Karakter</div>
                    </div>
                  </header>
                  {/* ... Resten av rapporten som før ... */}
                  <div className="flex justify-center pt-10 no-print">
                    <button onClick={() => setSelectedResultCandidateId(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors tracking-widest">← Tilbake til oversikt</button>
                  </div>
             </div>
          )}
       </div>
    </div>
  );
};
