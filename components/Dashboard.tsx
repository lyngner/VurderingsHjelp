
import React, { useState } from 'react';
import { Project } from '../types';

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

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 md:p-12">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between mb-12 items-start md:items-end gap-6">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tighter">Vurderingshjelp</h1>
          <p className="text-slate-500 font-medium text-sm mt-4 leading-relaxed">
            Digitalisering, gruppering og analyse av elevbesvarelser ved hjelp av Gemini 3 Pro.
          </p>
        </div>
        <div className="flex gap-3">
           <button onClick={() => setShowSettings(true)} className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm">
             <span className="text-lg">⚙️</span>
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
            <p className="font-black uppercase tracking-widest text-[10px]">Ingen prosjekter</p>
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
              <button className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 text-rose-300 hover:text-rose-500 transition-all" onClick={(e) => { e.stopPropagation(); if(confirm('Slette?')) onDeleteProject(p.id); }}>✕</button>
            </div>
          ))
        )}
      </div>

      <footer className="max-w-6xl mx-auto mt-20 pt-6 border-t border-slate-100 flex justify-between items-center opacity-40">
        <span className="text-[9px] font-black uppercase tracking-[0.2em]">Versjon 4.6.3</span>
      </footer>

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white max-w-xl w-full rounded-3xl shadow-2xl overflow-hidden p-10 relative">
              <button onClick={() => setShowSettings(false)} className="absolute top-8 right-8 w-8 h-8 flex items-center justify-center bg-slate-50 rounded-full hover:bg-slate-100 font-black">✕</button>
              <h2 className="text-2xl font-black text-slate-800 mb-6">Informasjon</h2>
              <div className="space-y-6 text-sm text-slate-600 leading-relaxed overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                 <section>
                   <h4 className="font-black uppercase text-[9px] tracking-widest text-indigo-600 mb-2">Compact Content Focus (v4.6.3)</h4>
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                     <p>Optimalisert utnyttelse av skjermflaten ved å redusere padding og hjørneradius i alle moduler. Dette minimerer unødvendig skrolling og gir bedre oversikt over komplekse oppgaver og resultatlister.</p>
                   </div>
                 </section>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50 text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                <span>Versjon 4.6.3</span>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
