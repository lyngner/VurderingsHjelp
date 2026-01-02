
import React, { useState } from 'react';
import { Project, SYSTEM_VERSION } from '../types';
import { clearAllData } from '../services/storageService';

interface DashboardProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  projects, 
  onSelectProject, 
  onCreateProject, 
  onDeleteProject 
}) => {
  const [showSettings, setShowSettings] = useState(false);

  const handleFullReset = async () => {
    if (confirm("ER DU SIKKER? Dette vil slette ALLE prosjekter, alle kandidater og all historikk permanent. Handlingen kan ikke angres.")) {
      await clearAllData();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 md:p-12">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between mb-12 items-start md:items-end gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-1">
             <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tighter">Vurderingshjelp</h1>
             <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 mt-2">
                {SYSTEM_VERSION}
             </span>
          </div>
          <p className="text-slate-500 font-medium text-sm mt-4 leading-relaxed">
            Profesjonell digitalisering og analyse av elevbesvarelser. Trygt lagret i din nettleser.
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
          projects.map(p => (
            <div key={p.id} onClick={() => onSelectProject(p)} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm cursor-pointer hover:shadow-xl transition-all group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-50 group-hover:bg-indigo-600 transition-colors"></div>
              <h3 className="font-black text-lg mb-1 text-slate-800 truncate pr-6">{p.name}</h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{new Date(p.updatedAt).toLocaleDateString()}</p>
              
              <div className="mt-6 flex justify-between items-center">
                <span className="text-[8px] font-black bg-slate-50 px-2 py-0.5 rounded-md uppercase text-slate-500">{p.candidateCount || 0} elever</span>
                <span className="text-indigo-600 font-black text-[10px] group-hover:translate-x-1 transition-transform">Åpne →</span>
              </div>
              <button className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 text-rose-300 hover:text-rose-500 transition-all" onClick={(e) => { e.stopPropagation(); if(confirm('Slette prosjekt?')) onDeleteProject(p.id); }}>✕</button>
            </div>
          ))
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

                 <section>
                   <h4 className="font-black uppercase text-[10px] tracking-widest text-slate-400 mb-3">Systeminformasjon</h4>
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500">Versjon:</span>
                      <span className="text-[10px] font-black text-indigo-600 uppercase">{SYSTEM_VERSION}</span>
                   </div>
                 </section>

                 <section className="pt-4 border-t border-slate-100">
                   <h4 className="font-black uppercase text-[10px] tracking-widest text-rose-500 mb-4">Fareområde</h4>
                   <p className="text-[10px] text-slate-400 mb-4">Hvis du opplever problemer eller vil starte helt på nytt, kan du slette hele databasen.</p>
                   <button 
                     onClick={handleFullReset}
                     className="w-full py-4 rounded-2xl bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all border border-rose-100"
                   >
                     Slett alle data permanent
                   </button>
                 </section>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
