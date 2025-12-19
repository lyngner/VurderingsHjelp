
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Page, Candidate, Rubric, Project, RubricCriterion } from './types';
import { transcribeAndAnalyzeImage, generateRubricFromTaskAndSamples, evaluateCandidate } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject } from './services/storageService';

const steps = [
  { id: 'setup', label: 'Oppsett', sub: 'Last opp filer', icon: '📝' },
  { id: 'review', label: 'Gjennomgang', sub: 'Verifiser data', icon: '🔍' },
  { id: 'rubric', label: 'Rettemanual', sub: 'AI Analyse', icon: '📋' },
  { id: 'results', label: 'Resultater', sub: 'Vurdering klar', icon: '🏆' },
];

const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const splitA3IfNecessary = async (file: File): Promise<Page[]> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const base64Full = e.target?.result as string;
      const base64Data = base64Full.split(',')[1];

      if (!file.type.startsWith('image/')) {
        resolve([{
          id: Math.random().toString(36).substring(7),
          fileName: file.name,
          imagePreview: '', 
          base64Data: base64Data,
          mimeType: file.type,
          status: 'pending'
        }]);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        if (aspect > 1.2) {
          const pages: Page[] = [];
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve([{ id: Math.random().toString(36).substring(7), fileName: file.name, imagePreview: base64Full, base64Data, mimeType: file.type, status: 'pending' }]);
            return;
          }
          canvas.width = img.width / 2;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
          const leftBase64 = canvas.toDataURL('image/jpeg', 0.85);
          pages.push({ id: Math.random().toString(36).substring(7), fileName: `${file.name} (V)`, imagePreview: leftBase64, base64Data: leftBase64.split(',')[1], mimeType: 'image/jpeg', status: 'pending' });
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
          const rightBase64 = canvas.toDataURL('image/jpeg', 0.85);
          pages.push({ id: Math.random().toString(36).substring(7), fileName: `${file.name} (H)`, imagePreview: rightBase64, base64Data: rightBase64.split(',')[1], mimeType: 'image/jpeg', status: 'pending' });
          resolve(pages);
        } else {
          resolve([{ id: Math.random().toString(36).substring(7), fileName: file.name, imagePreview: base64Full, base64Data, mimeType: file.type, status: 'pending' }]);
        }
      };
      img.onerror = () => {
        resolve([{ id: Math.random().toString(36).substring(7), fileName: file.name, imagePreview: base64Full, base64Data, mimeType: file.type, status: 'pending' }]);
      };
      img.src = base64Full;
    };
    
    reader.onerror = () => resolve([]);
    reader.readAsDataURL(file);
  });
};

const LatexRenderer: React.FC<{ content: string }> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (containerRef.current && (window as any).MathJax) {
      try {
        (window as any).MathJax.typesetPromise([containerRef.current]);
      } catch (err) {
        console.warn("MathJax rendering error:", err);
      }
    }
  }, [content]);

  return <div ref={containerRef} className="whitespace-pre-wrap leading-relaxed">{content}</div>;
};

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [currentStep, setCurrentStep] = useState<'setup' | 'review' | 'rubric' | 'results'>('setup');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<{ type: string | null; current: number; total: number; statusText: string }>({ type: null, current: 0, total: 0, statusText: '' });
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; progress: number; text: string }>({ loading: false, progress: 0, text: '' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAllProjects(); }, []);

  const loadAllProjects = async () => {
    const all = await getAllProjects();
    setProjects(all.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const sortedCandidates = useMemo(() => {
    if (!activeProject || !activeProject.candidates) return [];
    return [...activeProject.candidates].sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
  }, [activeProject?.candidates]);

  const currentCandidate = useMemo(() => {
    if (!activeProject || sortedCandidates.length === 0) return null;
    return sortedCandidates.find(c => c.id === selectedCandidateId) || sortedCandidates[0];
  }, [sortedCandidates, selectedCandidateId]);

  const createNewProject = () => {
    const newProj: Project = { id: Math.random().toString(36).substring(7), name: `Ny vurdering ${new Date().toLocaleDateString('no-NO')}`, createdAt: Date.now(), updatedAt: Date.now(), taskDescription: '', taskFiles: [], candidates: [], unprocessedPages: [], rubric: null, status: 'draft' };
    setActiveProject(newProj);
    setCurrentStep('setup');
    setView('editor');
  };

  const updateActiveProject = async (updates: Partial<Project>) => {
    setActiveProject(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates, updatedAt: Date.now() };
      saveProject(updated).catch(console.error);
      return updated;
    });
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessStatus({ type: 'Filbehandling', current: 0, total: files.length, statusText: 'Laster inn fasit...' });
    
    const allLoadedPages: Page[] = [];
    for (let i = 0; i < files.length; i++) {
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Leser ${files[i].name}...` }));
      const splitPages = await splitA3IfNecessary(files[i]);
      splitPages.forEach(p => p.status = 'completed');
      allLoadedPages.push(...splitPages);
    }
    
    await updateActiveProject({ taskFiles: [...(activeProject.taskFiles || []), ...allLoadedPages] });
    setProcessStatus({ type: null, current: 0, total: 0, statusText: '' });
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessStatus({ type: 'Filbehandling', current: 0, total: files.length, statusText: 'Laster inn besvarelser...' });
    
    const newPages: Page[] = [];
    for (let i = 0; i < files.length; i++) {
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Leser ${files[i].name}...` }));
      const splitPages = await splitA3IfNecessary(files[i]);
      newPages.push(...splitPages);
    }
    
    const updatedUnprocessed = [...(activeProject.unprocessedPages || []), ...newPages];
    await updateActiveProject({ unprocessedPages: updatedUnprocessed });
    
    setProcessStatus({ type: null, current: 0, total: 0, statusText: '' });
    startProcessingQueue(newPages);
  };

  const startProcessingQueue = async (pagesToProcess: Page[]) => {
    for (const page of pagesToProcess) {
      setActiveProject(prev => {
        if (!prev) return null;
        return {
          ...prev,
          unprocessedPages: prev.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'processing' } : p)
        };
      });

      try {
        const results = await transcribeAndAnalyzeImage(page);
        setActiveProject(prev => {
          if (!prev) return null;
          let currentCandidates = [...(prev.candidates || [])];
          results.forEach(res => {
            const cId = res.candidateId || "Ukjent";
            let cand = currentCandidates.find(c => c.id === cId);
            const newP = { ...page, id: Math.random().toString(36).substring(7), candidateId: cId, pageNumber: res.pageNumber, transcription: res.text, identifiedTasks: res.tasks, status: 'completed' as const };
            if (!cand) {
              currentCandidates.push({ id: cId, name: `Kand. ${cId}`, status: 'completed', pages: [newP] });
            } else {
              cand.pages = [...(cand.pages || []), newP].sort((a,b) => (a.pageNumber||0)-(b.pageNumber||0));
            }
          });
          const newUnprocessed = prev.unprocessedPages?.filter(p => p.id !== page.id) || [];
          const updated = { ...prev, candidates: currentCandidates, unprocessedPages: newUnprocessed, updatedAt: Date.now() };
          saveProject(updated);
          return updated;
        });
      } catch (err) {
        console.error("Feil ved behandling:", err);
        setActiveProject(prev => {
          if (!prev) return null;
          return { ...prev, unprocessedPages: prev.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'error' } : p) };
        });
      }
    }
  };

  const performEvaluation = async () => {
    if (!activeProject || !activeProject.rubric) return;
    const targets = (activeProject.candidates || []).filter(c => c.status !== 'evaluated');
    if (targets.length === 0) return;
    
    setProcessStatus({ type: 'Vurdering', current: 0, total: targets.length, statusText: 'Starter vurdering...' });
    
    for (let i = 0; i < targets.length; i++) {
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Vurderer kandidat ${targets[i].id} (Bruker Thinking-modell)...` }));
      try {
        const evalRes = await evaluateCandidate(targets[i], activeProject.rubric!, activeProject.taskDescription);
        setActiveProject(prev => {
          if (!prev) return null;
          const updated = { ...prev, candidates: (prev.candidates || []).map(c => c.id === targets[i].id ? { ...c, evaluation: evalRes, status: 'evaluated' as any } : c), updatedAt: Date.now() };
          saveProject(updated);
          return updated;
        });
      } catch (err) { 
        console.error(err);
        setProcessStatus(p => ({ ...p, statusText: `Feil ved kandidat ${targets[i].id}. Fortsetter...` }));
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    updateActiveProject({ status: 'completed' });
    setProcessStatus({ type: 'Ferdig', current: targets.length, total: targets.length, statusText: 'Alle besvarelser er vurdert!' });
    setTimeout(() => setProcessStatus({ type: null, current: 0, total: 0, statusText: '' }), 3000);
  };

  const handleGenerateRubric = async () => {
    if (!activeProject) return;
    
    setRubricStatus({ loading: true, progress: 5, text: 'Lager rettemanual...' });
    
    const simInterval = setInterval(() => {
      setRubricStatus(p => {
        if (p.progress < 92) {
          const increment = Math.max(0.5, (95 - p.progress) / 25);
          return { ...p, progress: p.progress + increment };
        }
        return p;
      });
    }, 1500);

    try {
      const samples = (activeProject.candidates || []).slice(0, 3).map(c => (c.pages || []).map(p => p.transcription).join(" "));
      const res = await generateRubricFromTaskAndSamples(activeProject.taskFiles || [], activeProject.taskDescription || "", samples);
      
      clearInterval(simInterval);
      setRubricStatus({ loading: false, progress: 100, text: 'Fullført!' });
      
      await updateActiveProject({ rubric: res });
      setTimeout(() => setRubricStatus({ loading: false, progress: 0, text: '' }), 3000);
    } catch (err) {
      clearInterval(simInterval);
      console.error(err);
      setRubricStatus({ loading: false, progress: 0, text: 'Feil oppstod. Prøv igjen.' });
    }
  };

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen p-8 bg-[#F1F5F9]">
        <div className="max-w-6xl mx-auto">
          <header className="flex justify-between items-center mb-10">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Vurderingsportal</h1>
            <button onClick={createNewProject} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700">Ny vurdering</button>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {projects.map(p => (
              <div key={p.id} onClick={() => { setActiveProject(p); setView('editor'); setCurrentStep(p.candidates?.length > 0 ? 'review' : 'setup'); }} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-lg transition-all group relative">
                <button onClick={(e) => { e.stopPropagation(); if(confirm("Slette prosjekt?")) deleteProject(p.id).then(loadAllProjects); }} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                <div className={`w-10 h-1 rounded-full mb-4 ${p.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                <h3 className="font-black text-slate-800 text-lg mb-1">{p.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.candidates?.length || 0} kandidater</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="no-print bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <button onClick={() => setView('dashboard')} className="font-black text-[10px] text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">← Oversikt</button>
        <nav className="flex gap-4">
          {steps.map(s => (
            <button key={s.id} onClick={() => setCurrentStep(s.id as any)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${currentStep === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </nav>
        <div className="w-20" />
      </header>

      <main className="flex-1 overflow-y-auto">
        {currentStep === 'setup' && (
          <div className="max-w-5xl mx-auto py-12 px-6 animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
               <div className="space-y-6">
                 <div className="bg-white p-8 border rounded-[40px] shadow-sm border-t-[12px] border-t-indigo-600">
                   <h3 className="font-black text-[10px] uppercase mb-6 text-slate-400 tracking-[0.2em]">1. Oppgave / Fasit</h3>
                   <button onClick={() => taskInputRef.current?.click()} className="w-full h-48 border-2 border-dashed border-indigo-100 rounded-[32px] flex flex-col items-center justify-center text-indigo-400 font-black hover:bg-indigo-50/50 transition-all mb-8 group">
                     <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">📄</span>
                     <span className="text-sm">Last opp fasit</span>
                     <span className="text-[9px] mt-2 opacity-40 uppercase tracking-widest">JPG / PNG / PDF</span>
                   </button>
                   <input ref={taskInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} />
                   
                   <div className="space-y-2">
                      {activeProject?.taskFiles?.map(f => (
                        <div key={f.id} className="text-[11px] font-bold bg-slate-50/80 p-5 rounded-2xl border border-slate-100 flex justify-between items-center group">
                          <span className="truncate pr-4 flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            {f.fileName}
                          </span>
                          <button onClick={() => updateActiveProject({ taskFiles: activeProject.taskFiles?.filter(i => i.id !== f.id) || [] })} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>
                        </div>
                      ))}
                   </div>
                   
                   <div className="mt-10">
                    <button onClick={handleGenerateRubric} disabled={(activeProject?.taskFiles?.length || 0) === 0 || rubricStatus.loading} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed transform active:scale-95">
                      {rubricStatus.loading ? '🚀 Analyserer...' : '🚀 Generer Rettemanual'}
                    </button>
                    {rubricStatus.loading && (
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-1 px-1">
                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{rubricStatus.text}</span>
                          <span className="text-[9px] font-black text-indigo-400">{Math.round(rubricStatus.progress)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-indigo-50 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${rubricStatus.progress}%` }}></div>
                        </div>
                      </div>
                    )}
                   </div>
                 </div>
               </div>

               <div className="space-y-6">
                 <div className="bg-white p-8 border rounded-[40px] shadow-sm border-t-[12px] border-t-emerald-600">
                   <h3 className="font-black text-[10px] uppercase mb-6 text-slate-400 tracking-[0.2em]">2. Elevbesvarelser</h3>
                   <button onClick={() => fileInputRef.current?.click()} className="w-full h-48 border-2 border-dashed border-emerald-100 rounded-[32px] flex flex-col items-center justify-center text-emerald-400 font-black hover:bg-emerald-50/50 transition-all mb-8 group">
                     <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">📸</span>
                     <span className="text-sm">Last opp besvarelser</span>
                     <span className="text-[9px] mt-2 opacity-40 uppercase tracking-widest">Skannede ark (JPG)</span>
                   </button>
                   <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} />
                   
                   {(activeProject?.unprocessedPages?.length || 0) > 0 && (
                     <div className="mb-10 p-6 bg-amber-50/30 rounded-3xl border border-amber-100 animate-in slide-in-from-top-4 duration-500">
                        <p className="text-[10px] font-black uppercase text-amber-500 mb-4 tracking-[0.2em] flex items-center gap-3">
                          <Spinner size="w-3.5 h-3.5" color="text-amber-500" /> Behandler nye filer...
                        </p>
                        <div className="grid grid-cols-1 gap-2.5">
                          {activeProject?.unprocessedPages?.map(p => (
                            <div key={p.id} className="bg-white p-4 rounded-xl border border-amber-100/50 flex justify-between items-center shadow-sm">
                              <span className="text-[11px] font-bold text-amber-800 truncate pr-6">{p.fileName}</span>
                              {p.status === 'processing' ? <Spinner size="w-4 h-4" color="text-amber-500" /> : <div className="w-4 h-4 rounded-full border-2 border-amber-200 border-t-transparent animate-spin opacity-40"></div>}
                            </div>
                          ))}
                        </div>
                     </div>
                   )}

                   <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                      <p className="text-[10px] font-black uppercase text-slate-300 mb-2 tracking-[0.2em]">Kandidatoversikt</p>
                      {sortedCandidates.length === 0 && (!activeProject?.unprocessedPages || activeProject.unprocessedPages.length === 0) && (
                        <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                          <p className="text-xs text-slate-300 font-medium italic">Ingen filer lastet opp ennå</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-3">
                        {sortedCandidates.map(c => (
                          <div key={c.id} className="bg-emerald-50/50 p-5 rounded-[24px] border border-emerald-100 flex justify-between items-center group hover:bg-emerald-50 hover:shadow-md transition-all">
                            <div className="flex flex-col gap-1">
                              <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Kandidat {c.id}</div>
                              <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">{c.pages?.length || 0} sider lest</div>
                            </div>
                            <div className="flex gap-1.5 p-2 bg-white/50 rounded-xl">
                              {c.pages?.map(p => <div key={p.id} className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />)}
                            </div>
                          </div>
                        ))}
                      </div>
                   </div>
                 </div>
               </div>
             </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="flex h-[calc(100vh-73px)] animate-in fade-in duration-300">
            <div className="w-72 bg-white border-r overflow-y-auto p-6 custom-scrollbar">
              <h3 className="font-black text-[10px] text-slate-400 uppercase mb-6 tracking-[0.2em] px-2">Kandidater</h3>
              <div className="space-y-2">
                {sortedCandidates.map(c => (
                  <button key={c.id} onClick={() => setSelectedCandidateId(c.id)} className={`w-full text-left p-5 rounded-2xl font-black text-xs transition-all border ${selectedCandidateId === c.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 border-indigo-600' : 'hover:bg-slate-50 text-slate-600 border-transparent'}`}>
                    <div className="flex justify-between items-center">
                      <span>Kandidat {c.id}</span>
                      <span className={`text-[8px] uppercase tracking-widest px-2 py-1 rounded-md ${selectedCandidateId === c.id ? 'bg-white/20' : 'bg-slate-100'}`}>{c.pages?.length || 0} s.</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 p-10 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
              {currentCandidate ? (
                <div className="max-w-6xl mx-auto space-y-12">
                   <div className="flex justify-between items-end mb-4">
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gjennomgang: Kandidat {currentCandidate.id}</h2>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sjekk at AI-en har tolket matematikken riktig</p>
                   </div>
                   {currentCandidate.pages?.map((p, idx) => (
                    <div key={p.id} className="bg-white border p-12 rounded-[48px] grid grid-cols-1 xl:grid-cols-2 gap-12 shadow-sm animate-in slide-in-from-bottom-8 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="relative group cursor-zoom-in" onClick={() => p.imagePreview && setZoomedImage(p.imagePreview)}>
                        {p.imagePreview ? (
                          <img src={p.imagePreview} className="rounded-3xl border shadow-sm w-full h-auto transition-transform group-hover:scale-[1.01]" />
                        ) : (
                          <div className="w-full aspect-[3/4] bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300 font-bold italic p-8 text-center">
                            Ingen bildevisning tilgjengelig for denne filtypen ({p.mimeType})
                          </div>
                        )}
                        {p.imagePreview && (
                          <div className="absolute inset-0 bg-indigo-900/0 group-hover:bg-indigo-900/5 transition-all rounded-3xl flex items-center justify-center">
                            <span className="bg-white/90 backdrop-blur px-5 py-2 rounded-full text-[10px] font-black uppercase text-slate-500 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">Klikk for å forstørre</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-8">
                        <div>
                          <label className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mb-4 block">AI-tolkning (Vises som MathJax)</label>
                          <div className="bg-indigo-50/30 p-8 rounded-[32px] border border-indigo-100/50 text-base font-medium min-h-[120px] shadow-inner text-indigo-950">
                            <LatexRenderer content={p.transcription || "Ingen tekst detektert."} />
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4 block">Rediger rådata ($ for matematikk)</label>
                          <textarea className="flex-1 bg-white border-2 border-slate-50 p-8 rounded-[32px] text-sm font-medium min-h-[350px] outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50 transition-all leading-relaxed shadow-sm custom-scrollbar" value={p.transcription} onChange={(e) => {
                            const newTxt = e.target.value;
                            updateActiveProject({ candidates: (activeProject?.candidates || []).map(c => c.id === currentCandidate.id ? { ...c, pages: (c.pages || []).map(page => page.id === p.id ? {...page, transcription: newTxt} : page) } : c) });
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 animate-in fade-in duration-700">
                  <div className="text-7xl mb-6 opacity-20">🔍</div>
                  <p className="font-black uppercase tracking-[0.4em] text-sm">Velg en kandidat fra listen</p>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 'rubric' && (
          <div className="max-w-7xl mx-auto py-16 px-10 animate-in fade-in duration-500">
            <div className="bg-white p-16 rounded-[60px] border shadow-sm">
               <div className="flex justify-between items-center mb-16">
                 <div>
                   <h2 className="text-4xl font-black mb-2 tracking-tight">Rettemanual</h2>
                   <p className="text-slate-400 font-medium">Tilpass kriterier og løsningsforslag før retting starter.</p>
                 </div>
                 {rubricStatus.loading && (
                  <div className="bg-indigo-50 px-8 py-4 rounded-3xl flex items-center gap-5 text-indigo-600 font-black text-sm">
                    <Spinner /> 
                    <span>{Math.round(rubricStatus.progress)}%</span>
                  </div>
                 )}
               </div>

               {!activeProject?.rubric && !rubricStatus.loading && (
                 <div className="py-24 text-center border-4 border-dashed border-slate-50 rounded-[60px]">
                    <p className="text-slate-300 font-black uppercase tracking-widest mb-6">Ingen rettemanual generert</p>
                    <button onClick={() => setCurrentStep('setup')} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold">Gå til Oppsett</button>
                 </div>
               )}

               {activeProject?.rubric?.criteria?.map((c, idx) => (
                 <div key={idx} className="bg-slate-50 rounded-[50px] border border-slate-100 mb-16 overflow-hidden shadow-sm hover:shadow-md transition-all duration-500">
                   <div className="p-10 bg-indigo-900 text-white flex justify-between items-center">
                      <div>
                        <div className="text-[10px] font-black uppercase opacity-60 tracking-[0.3em] mb-2">{c.tema || 'Generell'}</div>
                        <div className="font-black text-3xl tracking-tight">{c.name}</div>
                      </div>
                      <div className="font-black bg-white/10 backdrop-blur-md border border-white/20 px-8 py-4 rounded-3xl text-2xl shadow-xl">
                        {c.maxPoints} <span className="text-sm opacity-60 uppercase font-black ml-1">poeng</span>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 lg:grid-cols-2 p-16 gap-16">
                      <div className="space-y-6">
                        <label className="text-[11px] font-black uppercase text-indigo-600 tracking-[0.3em] flex items-center gap-3">
                          <span className="w-3 h-3 bg-indigo-600 rounded-full shadow-lg"></span> Løsningsforslag
                        </label>
                        <div className="p-10 bg-white rounded-[40px] border border-slate-200 shadow-inner min-h-[180px] text-slate-900 font-medium leading-relaxed">
                          <LatexRenderer content={c.suggestedSolution || ""} />
                        </div>
                        <textarea className="w-full h-48 bg-white p-8 border-2 border-slate-100 rounded-[32px] text-sm outline-none focus:border-indigo-600 transition-all shadow-sm leading-relaxed custom-scrollbar" value={c.suggestedSolution || ""} onChange={e => {
                          const nc = [...(activeProject.rubric?.criteria || [])];
                          nc[idx].suggestedSolution = e.target.value;
                          updateActiveProject({ rubric: { ...activeProject.rubric!, criteria: nc }});
                        }} placeholder="Skriv løsningsforslag med $...$ for matte" />
                      </div>
                      <div className="space-y-6">
                        <label className="text-[11px] font-black uppercase text-emerald-600 tracking-[0.3em] flex items-center gap-3">
                          <span className="w-3 h-3 bg-emerald-600 rounded-full shadow-lg"></span> Vurderingskriterier
                        </label>
                        <div className="p-10 bg-white rounded-[40px] border border-slate-200 shadow-inner min-h-[180px] text-slate-600 italic font-medium leading-relaxed">
                          <LatexRenderer content={c.description || ""} />
                        </div>
                        <textarea className="w-full h-48 bg-white p-8 border-2 border-slate-100 rounded-[32px] text-sm outline-none focus:border-emerald-600 transition-all shadow-sm leading-relaxed custom-scrollbar" value={c.description || ""} onChange={e => {
                          const nc = [...(activeProject.rubric?.criteria || [])];
                          nc[idx].description = e.target.value;
                          updateActiveProject({ rubric: { ...activeProject.rubric!, criteria: nc }});
                        }} placeholder="Beskriv hva som gir poeng..." />
                      </div>
                   </div>
                 </div>
               ))}
               
               {activeProject?.rubric && (
                 <button onClick={performEvaluation} disabled={processStatus.type !== null} className="w-full py-12 bg-emerald-600 text-white rounded-[48px] font-black text-4xl shadow-2xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all mt-10 disabled:opacity-40 transform hover:-translate-y-1 duration-300">
                   🚀 Start automatisk retting
                 </button>
               )}
            </div>
          </div>
        )}

        {currentStep === 'results' && activeProject && (
          <div className="max-w-7xl mx-auto py-16 px-10 animate-in fade-in duration-700">
            {currentCandidate && currentCandidate.evaluation ? (
              <div className="bg-white rounded-[60px] shadow-sm border p-16 animate-in slide-in-from-bottom-12 duration-700">
                <div className="flex flex-col md:flex-row justify-between items-center mb-24 gap-12">
                   <div className="flex flex-col gap-4">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em] ml-2">VELG ELEV</label>
                      <select className="bg-slate-50 border-2 border-slate-100 rounded-[32px] px-12 py-6 font-black text-2xl outline-none focus:ring-8 focus:ring-indigo-100 transition-all cursor-pointer shadow-sm appearance-none" style={{ backgroundImage: 'none' }} value={currentCandidate.id} onChange={e => setSelectedCandidateId(e.target.value)}>
                        {sortedCandidates.map(c => <option key={c.id} value={c.id}>Kandidat {c.id}</option>)}
                      </select>
                   </div>
                   <div className="text-center md:text-right">
                      <div className="text-[120px] font-black text-indigo-700 leading-none tracking-tighter">
                        {currentCandidate.evaluation.score?.toFixed(1) || "0.0"} 
                        <span className="text-4xl text-slate-200 ml-2 tracking-normal">/ {activeProject.rubric?.totalMaxPoints || 0}</span>
                      </div>
                      <div className="mt-6 flex items-center justify-center md:justify-end gap-6">
                        <span className="text-sm font-black text-slate-300 uppercase tracking-[0.5em]">KARAKTER</span>
                        <div className="bg-indigo-600 text-white text-3xl font-black px-10 py-4 rounded-[28px] shadow-2xl shadow-indigo-200">{currentCandidate.evaluation.grade || "U"}</div>
                      </div>
                   </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-32">
                   <section>
                      <h4 className="font-black uppercase text-slate-400 text-[12px] mb-12 flex items-center gap-5 tracking-[0.5em]">
                        <div className="w-12 h-1.5 bg-indigo-600 rounded-full shadow-md"></div> TILBAKEMELDING
                      </h4>
                      <div className="p-16 bg-indigo-50/20 rounded-[64px] border border-indigo-100 italic leading-relaxed text-2xl text-indigo-950 shadow-inner relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600/10"></div>
                        <LatexRenderer content={currentCandidate.evaluation.feedback || ""} />
                      </div>
                   </section>
                   <section>
                      <h4 className="font-black uppercase text-slate-400 text-[12px] mb-12 flex items-center gap-5 tracking-[0.5em]">
                         <div className="w-12 h-1.5 bg-emerald-500 rounded-full shadow-md"></div> VEKSTPUNKTER
                      </h4>
                      <div className="space-y-8">
                        {currentCandidate.evaluation.vekstpunkter?.map((v, i) => (
                          <div key={i} className="p-10 bg-white border border-slate-100 rounded-[40px] shadow-sm font-semibold flex items-center gap-10 hover:border-indigo-300 hover:shadow-xl transition-all duration-500 group transform hover:-translate-x-2">
                            <span className="w-16 h-16 rounded-[24px] bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">{i+1}</span>
                            <div className="flex-1 text-xl text-slate-700 leading-relaxed"><LatexRenderer content={v} /></div>
                          </div>
                        ))}
                      </div>
                   </section>
                </div>
              </div>
            ) : (
              <div className="bg-white p-32 rounded-[64px] text-center text-slate-200 font-black uppercase tracking-[0.6em] border-[6px] border-dashed border-slate-50 flex flex-col items-center gap-10 animate-pulse">
                  <div className="text-9xl opacity-10">📈</div>
                  <div className="text-xl">Vurdering under arbeid...</div>
                </div>
            )}
          </div>
        )}
      </main>

      {zoomedImage && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/98 flex items-center justify-center p-8 cursor-zoom-out backdrop-blur-xl transition-all duration-700 animate-in fade-in" onClick={() => setZoomedImage(null)}>
              <img src={zoomedImage} className="max-w-full max-h-full object-contain rounded-[40px] shadow-[0_0_120px_rgba(0,0,0,0.8)] border-8 border-white/5 animate-in zoom-in-95 duration-500" alt="Fullskjerm" />
          </div>
      )}

      {processStatus.type && (
        <div className="fixed bottom-12 right-12 bg-slate-900 text-white p-12 rounded-[50px] shadow-[0_20px_80px_rgba(0,0,0,0.4)] flex items-center gap-12 z-[200] border border-white/10 animate-in slide-in-from-right-20 duration-700">
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-[0.6em] text-indigo-400 mb-5">{processStatus.type}</span>
            <span className="text-xl font-black max-w-[350px] leading-tight tracking-tight">{processStatus.statusText}</span>
          </div>
          <div className="w-28 h-28 relative flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle className="text-white/5" strokeWidth="4" fill="none" r="16" cx="18" cy="18" />
              <circle className="text-indigo-500" strokeDasharray={`${processStatus.total > 0 ? Math.round((processStatus.current/processStatus.total)*100) : 0}, 100`} strokeWidth="4" strokeLinecap="round" fill="none" r="16" cx="18" cy="18" style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }} />
            </svg>
            <span className="absolute text-xl font-black tracking-tighter">{processStatus.total > 0 ? Math.round((processStatus.current/processStatus.total)*100) : 0}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
