
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
    <div className="min-h-screen bg-[#F8FAFC] p-12">
      <header className="max-w-6xl mx-auto flex justify-between mb-16 items-end">
        <div className="max-w-2xl">
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter">Vurderingshjelp</h1>
          <p className="text-slate-500 font-medium text-sm mt-4 leading-relaxed">
            Et verktøy for lærere som forenkler rettingen ved å digitalisere, gruppere og analysere elevbesvarelser ved hjelp av kunstig intelligens.
          </p>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => setShowSettings(true)} 
             className="p-5 rounded-[25px] border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center"
             title="Innstillinger og GDPR"
           >
             <span className="text-xl">⚙️</span>
           </button>
           <button 
             onClick={onCreateProject} 
             className="bg-indigo-600 text-white px-10 py-5 rounded-[25px] font-black shadow-xl shadow-indigo-100 hover:scale-105 transition-transform active:scale-95"
           >
             Nytt prosjekt +
           </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {projects.length === 0 ? (
          <div className="col-span-full py-40 text-center">
            <div className="text-6xl mb-6 opacity-20">📁</div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Ingen prosjekter ennå. Trykk "Nytt prosjekt" for å starte.</p>
          </div>
        ) : (
          projects.map(p => (
            <div 
              key={p.id} 
              onClick={() => onSelectProject(p)} 
              className="bg-white p-10 rounded-[45px] border border-slate-100 shadow-sm cursor-pointer hover:shadow-xl transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-2 h-full bg-indigo-50 group-hover:bg-indigo-600 transition-colors"></div>
              <h3 className="font-black text-xl mb-2 text-slate-800">{p.name}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Sist endret: {new Date(p.updatedAt).toLocaleDateString()}
              </p>
              <div className="mt-8 flex justify-between items-center">
                <span className="text-[9px] font-black bg-slate-50 px-3 py-1 rounded-full uppercase text-slate-500">
                  {(p.candidates || []).length} elever
                </span>
                <span className="text-indigo-600 font-black text-xs group-hover:translate-x-1 transition-transform">Åpne →</span>
              </div>
              <button 
                className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 text-rose-400 p-2 hover:bg-rose-50 rounded-full transition-all" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if(confirm('Er du sikker på at du vil slette dette prosjektet?')) onDeleteProject(p.id); 
                }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <footer className="max-w-6xl mx-auto mt-20 pt-8 border-t border-slate-100 flex justify-between items-center opacity-40">
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Versjon 3.14.1</span>
        <span className="text-[9px] font-bold text-slate-400 uppercase italic">Digitalisering av vurderingsarbeid</span>
      </footer>

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white max-w-2xl w-full rounded-[50px] shadow-2xl overflow-hidden p-12 relative animate-in zoom-in-95 duration-300">
              <button 
                onClick={() => setShowSettings(false)} 
                className="absolute top-10 right-10 w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full hover:bg-slate-100 transition-colors font-black"
              >
                ✕
              </button>
              <h2 className="text-3xl font-black text-slate-800 mb-8">Teknisk info & GDPR</h2>
              <div className="space-y-8 text-sm text-slate-600 leading-relaxed overflow-y-auto max-h-[60vh] pr-4 custom-scrollbar">
                 <section>
                   <h4 className="font-black uppercase text-[10px] tracking-widest text-indigo-600 mb-3">Datasikkerhet og Lagring</h4>
                   <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                     <ul className="space-y-3">
                       <li className="flex gap-3">
                         <span className="text-indigo-600 font-bold">✓</span>
                         <span><strong>Lokal lagring:</strong> Alt lagres i din nettlesers IndexedDB.</span>
                       </li>
                       <li className="flex gap-3">
                         <span className="text-indigo-600 font-bold">✓</span>
                         <span><strong>KI-behandling:</strong> Bilder analyseres kryptert via Google Gemini API.</span>
                       </li>
                     </ul>
                   </div>
                 </section>

                 <section>
                   <h4 className="font-black uppercase text-[10px] tracking-widest text-indigo-600 mb-3">GDPR</h4>
                   <p>Skolen/læreren er behandlingsansvarlig. Vi anbefaler anonymisering ved bruk av kandidatnummer.</p>
                 </section>
              </div>
              <div className="mt-12 pt-8 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                <span>Versjon 3.14.1</span>
                <span className="text-indigo-400">Digitalisering av vurderingsarbeid</span>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
