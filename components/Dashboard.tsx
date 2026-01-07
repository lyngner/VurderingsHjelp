
import React, { useState, useEffect } from 'react';
import { Project, SYSTEM_VERSION, RubricCriterion } from '../types';
import { clearAllData, getStorageStats, saveSetting } from '../services/storageService';

interface DashboardProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  forceFlash?: boolean;
  setForceFlash?: (val: boolean) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  projects, 
  onSelectProject, 
  onCreateProject, 
  onDeleteProject,
  forceFlash,
  setForceFlash
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [storageStats, setStorageStats] = useState<{ projects: number, candidates: number, media: number } | null>(null);

  useEffect(() => {
    if (showSettings) {
      getStorageStats().then(setStorageStats);
    }
  }, [showSettings]);

  const handleFullReset = async () => {
    if (confirm("ER DU SIKKER? Dette vil slette ALLE prosjekter, alle kandidater og all historikk permanent. Handlingen kan ikke angres.")) {
      await clearAllData();
      window.location.reload();
    }
  };

  const getProjectStats = (p: Project) => {
    const candidateCount = p.candidates?.length ?? (p.candidateCount || 0);
    // v7.9.44: Use stored evaluatedCount if candidates are not loaded (Dashboard view)
    const evaluatedCount = p.candidates 
        ? p.candidates.filter(c => c.status === 'evaluated').length 
        : (p.evaluatedCount || 0);
        
    const pageCount = (p.candidates?.reduce((acc, c) => acc + c.pages.length, 0) || 0) + (p.unprocessedPages?.length || 0);
    
    // Rubric Stats
    const rubricTitle = p.rubric?.title || "Rettemanual ikke generert";
    const hasRubric = !!p.rubric;
    
    let structureSummary: string[] = [];

    if (p.rubric) {
      // Grupper kriterier per del
      const partMap = new Map<string, RubricCriterion[]>();
      p.rubric.criteria.forEach(c => {
        const partName = c.part || "Del 1";
        if (!partMap.has(partName)) partMap.set(partName, []);
        partMap.get(partName)?.push(c);
      });

      // Sorter delene (Del 1 først)
      const sortedParts = Array.from(partMap.keys()).sort();

      structureSummary = sortedParts.map(partName => {
        const criteria = partMap.get(partName) || [];
        // Antall deloppgaver er lik antall kriterier
        const subTaskCount = criteria.length;
        // Antall hovedoppgaver er unike taskNumbers INNENFOR denne delen
        const uniqueTasksInPart = new Set(criteria.map(c => String(c.taskNumber).replace(/[^0-9]/g, ''))).size;
        
        return `${partName} (${uniqueTasksInPart} oppg, ${subTaskCount} deloppg)`;
      });
    }

    const createdDate = new Date(p.createdAt).toLocaleDateString() + ' ' + new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return { candidateCount, evaluatedCount, pageCount, rubricTitle, hasRubric, structureSummary, createdDate };
  };

  const hasData = storageStats ? (storageStats.projects > 0 || storageStats.candidates > 0 || storageStats.media > 0) : false;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 md:p-12">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between mb-12 items-start md:items-end gap-6">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-1">
             <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tighter">Vurderingshjelp</h1>
             <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 mt-2">
                {SYSTEM_VERSION}
             </span>
          </div>
          <p className="text-slate-500 font-medium text-sm mt-4 leading-relaxed max-w-2xl">
            Kvalitetssikret og kontrollert digitalisering og analyse av elevbesvarelser. Utfyllende tilbakemeldinger. Alt trygt lagret i din nettleser.
          </p>
        </div>
        <div className="flex gap-3">
           <button onClick={() => setShowSettings(true)} className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm group">
             <span className="text-lg group-hover:rotate-90 transition-transform inline-block">⚙️</span>
           </button>
           <button onClick={onCreateProject} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:scale-105 transition-all">
             Nytt prosjekt +
           </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length === 0 ? (
          <div className="col-span-full py-40 text-center opacity-20">
            <div className="text-6xl mb-4">📁</div>
            <p className="font-black uppercase tracking-widest text-[10px]">Ingen prosjekter ennå</p>
          </div>
        ) : (
          projects.map(p => {
            const stats = getProjectStats(p);
            return (
              <div key={p.id} onClick={() => onSelectProject(p)} className="bg-white rounded-[32px] border border-slate-100 shadow-sm cursor-pointer hover:shadow-xl transition-all group relative overflow-hidden flex flex-col">
                <div className={`absolute top-0 left-0 w-1.5 h-full transition-colors ${stats.hasRubric ? 'bg-emerald-500' : 'bg-slate-200 group-hover:bg-indigo-500'}`}></div>
                
                <div className="p-8 pb-4 border-b border-slate-50">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-black text-lg text-slate-800 truncate pr-2">{p.name}</h3>
                    <button className="text-slate-300 hover:text-rose-500 transition-colors p-1 -mr-2" onClick={(e) => { e.stopPropagation(); if(confirm('Slette prosjekt?')) onDeleteProject(p.id); }}>✕</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{stats.createdDate}</span>
                  </div>
                </div>

                <div className="px-8 py-6 flex-1 flex flex-col justify-center">
                  {stats.hasRubric ? (
                    <div>
                      <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1 block">Prøvens tema</span>
                      <div className="font-bold text-sm text-slate-700 leading-tight line-clamp-2">{stats.rubricTitle}</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 opacity-50">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Rettemanual mangler</span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50/50 p-6 grid grid-cols-3 gap-4 border-t border-slate-50">
                  <div>
                    <div className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Vurdert</div>
                    <div className={`text-lg font-black leading-none ${stats.evaluatedCount > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {stats.evaluatedCount}<span className="text-slate-300 text-sm">/{stats.candidateCount}</span>
                    </div>
                  </div>
                  
                  {stats.hasRubric && (
                    <div className="col-span-2 border-l border-slate-100 pl-4">
                      <div className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Struktur</div>
                      <div className="text-[9px] font-bold text-slate-600 leading-tight space-y-0.5">
                        {stats.structureSummary.map((line, idx) => (
                          <div key={idx} className="truncate">{line}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!stats.hasRubric && (
                    <div className="col-span-2 border-l border-slate-100 pl-4 flex flex-col justify-between">
                       <div className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Omfang</div>
                       <div className="text-sm font-black text-indigo-600">{stats.pageCount} sider</div>
                    </div>
                  )}
                </div>
                
                <div className="bg-white px-6 py-3 border-t border-slate-100 flex justify-end">
                   <span className="text-indigo-600 font-black text-[10px] uppercase tracking-widest group-hover:translate-x-1 transition-transform">Åpne prosjekt →</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white max-w-xl w-full rounded-[32px] shadow-2xl overflow-hidden p-10 relative border border-white/20">
              <button onClick={() => setShowSettings(false)} className="absolute top-8 right-8 w-8 h-8 flex items-center justify-center bg-slate-50 rounded-full hover:bg-slate-100 font-black transition-colors">✕</button>
              
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">⚙️</div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Systeminnstillinger</h2>
              </div>

              <div className="space-y-8 text-sm text-slate-600 leading-relaxed overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                 <section className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                   <h4 className="font-black uppercase text-[10px] tracking-widest text-indigo-600 mb-3 flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                     Personvern & GDPR
                   </h4>
                   <p className="text-[11px] font-medium leading-relaxed text-slate-700">
                     All behandling av elevbesvarelser skjer <strong>lokalt i din nettleser</strong> (IndexedDB). Ingen filer lagres på våre servere. KI-analysen sendes som krypterte transienter til Gemini API og dataene brukes <strong>ikke</strong> til trening av modeller. Du har full kontroll over dine data.
                   </p>
                 </section>

                 <div className="grid grid-cols-2 gap-4">
                   <section>
                     <h4 className="font-black uppercase text-[10px] tracking-widest text-slate-400 mb-3">Systeminformasjon</h4>
                     <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500">Versjon:</span>
                        <span className="text-[10px] font-black text-indigo-600 uppercase">{SYSTEM_VERSION}</span>
                     </div>
                   </section>

                   <section>
                     <h4 className="font-black uppercase text-[10px] tracking-widest text-slate-400 mb-3">Lagringsstatus (IndexedDB)</h4>
                     <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                        {storageStats ? (
                          <>
                            <div className="flex justify-between text-[10px]">
                              <span className="font-bold text-slate-500">Prosjekter:</span>
                              <span className="font-black text-slate-800">{storageStats.projects}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="font-bold text-slate-500">Kandidater:</span>
                              <span className="font-black text-slate-800">{storageStats.candidates}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="font-bold text-slate-500">Lagrede bildefiler:</span>
                              <span className="font-black text-slate-800">{storageStats.media}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">Laster status...</div>
                        )}
                     </div>
                   </section>
                 </div>

                 <section className="pt-4 border-t border-slate-100">
                   <h4 className="font-black uppercase text-[10px] tracking-widest text-rose-500 mb-4">Fareområde</h4>
                   <p className="text-[10px] text-slate-400 mb-4">Hvis du opplever problemer eller vil starte helt på nytt, kan du slette hele databasen.</p>
                   <button 
                     onClick={handleFullReset}
                     disabled={!hasData}
                     className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${hasData ? 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-600 hover:text-white' : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'}`}
                   >
                     {hasData ? 'Slett alle data permanent' : 'Databasen er tom'}
                   </button>
                 </section>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
