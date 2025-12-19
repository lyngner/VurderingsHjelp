
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

// Helper to split A3 scans into two A4 pages
const splitA3IfNecessary = async (file: File): Promise<Page[]> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        if (aspect > 1.2) {
          const pages: Page[] = [];
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve([]);

          canvas.width = img.width / 2;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
          const leftBase64 = canvas.toDataURL('image/jpeg', 0.85);
          pages.push({
            id: Math.random().toString(36).substring(7),
            fileName: `${file.name} (Del 1)`,
            imagePreview: leftBase64,
            base64Data: leftBase64.split(',')[1],
            mimeType: 'image/jpeg',
            status: 'completed'
          });

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
          const rightBase64 = canvas.toDataURL('image/jpeg', 0.85);
          pages.push({
            id: Math.random().toString(36).substring(7),
            fileName: `${file.name} (Del 2)`,
            imagePreview: rightBase64,
            base64Data: rightBase64.split(',')[1],
            mimeType: 'image/jpeg',
            status: 'completed'
          });

          resolve(pages);
        } else {
          const base64 = e.target?.result as string;
          resolve([{
            id: Math.random().toString(36).substring(7),
            fileName: file.name,
            imagePreview: base64,
            base64Data: base64.split(',')[1],
            mimeType: file.type,
            status: 'completed'
          }]);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

// KaTeX Component
const LatexRenderer: React.FC<{ content: string }> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (containerRef.current && (window as any).renderMathInElement) {
      try {
        (window as any).renderMathInElement(containerRef.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
          ],
          throwOnError: false,
        });
      } catch (err) {
        console.warn("KaTeX rendering error:", err);
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
  const [resultView, setResultView] = useState<'individual' | 'table' | 'group'>('individual');
  
  const [processStatus, setProcessStatus] = useState<{
    type: 'candidates' | 'rubric' | 'evaluation' | 'upload' | null;
    current: number;
    total: number;
    statusText: string;
  }>({ type: null, current: 0, total: 0, statusText: '' });

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAllProjects(); }, []);

  const sortedCandidates = useMemo(() => {
    if (!activeProject) return [];
    return [...activeProject.candidates].sort((a, b) => {
      const aId = parseInt(a.id.replace(/\D/g, '')) || 0;
      const bId = parseInt(b.id.replace(/\D/g, '')) || 0;
      return aId - bId || a.id.localeCompare(b.id);
    });
  }, [activeProject?.candidates]);

  // Added currentCandidate definition to fix "Cannot find name 'currentCandidate'" errors
  const currentCandidate = useMemo(() => {
    if (!activeProject || !selectedCandidateId) return null;
    return activeProject.candidates.find(c => c.id === selectedCandidateId) || null;
  }, [activeProject, selectedCandidateId]);

  const loadAllProjects = async () => {
    const all = await getAllProjects();
    setProjects(all.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const createNewProject = () => {
    const newProj: Project = {
      id: Math.random().toString(36).substring(7),
      name: `Ny vurdering ${new Date().toLocaleDateString('no-NO')}`,
      createdAt: Date.now(), updatedAt: Date.now(),
      taskDescription: '', taskFiles: [], candidates: [], rubric: null, status: 'draft'
    };
    setActiveProject(newProj);
    setCurrentStep('setup');
    setView('editor');
  };

  const handleProjectSelect = (project: Project) => {
    setActiveProject(project);
    setCurrentStep(project.candidates.length > 0 ? 'review' : 'setup');
    if (project.candidates.length > 0) setSelectedCandidateId(project.candidates[0].id);
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

  const handleGenerateRubric = async (allCandidates: boolean = false) => {
    if (!activeProject) return;
    setProcessStatus({ type: 'rubric', current: 0, total: 100, statusText: 'Analyserer oppgaver og genererer manual...' });
    try {
      const sampleCount = allCandidates ? 10 : 2;
      const samples = activeProject.candidates
        .slice(0, sampleCount)
        .map(c => c.pages.map(p => p.transcription).join(" "));
      const res = await generateRubricFromTaskAndSamples(activeProject.taskFiles, activeProject.taskDescription, samples);
      setActiveProject(prev => {
        if (!prev) return null;
        const updated = { ...prev, rubric: res, updatedAt: Date.now() };
        saveProject(updated);
        return updated;
      });
    } finally { setProcessStatus({ type: null, current: 0, total: 0, statusText: '' }); }
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessStatus({ type: 'upload', current: 0, total: files.length, statusText: 'Behandler oppgavefiler...' });
    
    const allLoadedPages: Page[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Behandler ${file.name}...` }));
      const splitPages = await splitA3IfNecessary(file);
      allLoadedPages.push(...splitPages);
    }
    
    const updatedTaskFiles = [...activeProject.taskFiles, ...allLoadedPages];
    await updateActiveProject({ taskFiles: updatedTaskFiles });
    setProcessStatus({ type: null, current: 0, total: 0, statusText: '' });
    handleGenerateRubric(false);
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setProcessStatus({ type: 'upload', current: 0, total: files.length, statusText: 'Behandler besvarelser...' });
    
    const newPages: Page[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Behandler ${file.name}...` }));
      const splitPages = await splitA3IfNecessary(file);
      newPages.push(...splitPages);
    }
    await processPages(newPages);
  };

  const processPages = async (pages: Page[]) => {
    setProcessStatus({ type: 'candidates', current: 0, total: pages.length, statusText: 'Analyserer håndskrift...' });
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Leser ${page.fileName}...` }));
      if (i > 0) await new Promise(r => setTimeout(r, 4000));
      try {
        const results = await transcribeAndAnalyzeImage(page);
        setActiveProject(prev => {
          if (!prev) return null;
          let currentCandidates = [...prev.candidates];
          results.forEach(res => {
            const cId = res.candidateId || "Ukjent";
            let candidate = currentCandidates.find(c => c.id === cId);
            const newPage: Page = {
              ...page, id: Math.random().toString(36).substring(7), candidateId: cId,
              pageNumber: res.pageNumber, transcription: res.text, identifiedTasks: res.tasks,
              drawings: res.drawings, illegibleSegments: res.illegible, status: 'completed'
            };
            if (!candidate) {
              candidate = { id: cId, name: `Kand. ${cId}`, status: 'completed', pages: [newPage] };
              currentCandidates.push(candidate);
            } else {
              candidate.pages = [...candidate.pages, newPage].sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
            }
          });
          const updated = { ...prev, candidates: currentCandidates, status: 'reviewing' as any };
          saveProject(updated);
          return updated;
        });
      } catch (e) { console.error(e); }
    }
    setCurrentStep('review');
    setProcessStatus({ type: null, current: 0, total: 0, statusText: '' });
  };

  const performEvaluation = async () => {
    if (!activeProject || !activeProject.rubric) return;
    const candidatesToEval = activeProject.candidates.filter(c => c.status !== 'evaluated');
    if (candidatesToEval.length === 0) return;
    setProcessStatus({ type: 'evaluation', current: 0, total: candidatesToEval.length, statusText: 'Vurderer besvarelser...' });
    try {
      const taskContext = (activeProject.taskDescription || '') + "\n" + (activeProject.taskFiles.map(f => f.transcription || '').join("\n"));
      for (let i = 0; i < candidatesToEval.length; i++) {
        setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Vurderer ${candidatesToEval[i].id}...` }));
        const evalResult = await evaluateCandidate(candidatesToEval[i], activeProject.rubric!, taskContext);
        setActiveProject(prev => {
          if (!prev) return null;
          const updatedCandidates = prev.candidates.map(c => c.id === candidatesToEval[i].id ? { ...c, evaluation: evalResult, status: 'evaluated' as any } : c);
          const updated = { ...prev, candidates: updatedCandidates, updatedAt: Date.now() };
          saveProject(updated);
          return updated;
        });
      }
      updateActiveProject({ status: 'completed' });
    } finally { setProcessStatus({ type: null, current: 0, total: 0, statusText: '' }); }
  };

  const updateRubricCriterion = (index: number, updates: Partial<RubricCriterion>) => {
    if (!activeProject || !activeProject.rubric) return;
    const newCriteria = [...activeProject.rubric.criteria];
    newCriteria[index] = { ...newCriteria[index], ...updates };
    updateActiveProject({
      rubric: { ...activeProject.rubric, criteria: newCriteria }
    });
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
              <div key={p.id} onClick={() => handleProjectSelect(p)} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-lg transition-all group relative">
                <button onClick={(e) => { e.stopPropagation(); if(confirm("Slette prosjekt?")) deleteProject(p.id).then(loadAllProjects); }} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                <div className={`w-10 h-1 rounded-full mb-4 ${p.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                <h3 className="font-black text-slate-800 text-lg mb-1">{p.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.candidates.length} kandidater</p>
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
          <div className="max-w-4xl mx-auto py-12 px-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-white p-8 border rounded-3xl shadow-sm border-t-8 border-t-indigo-600">
                 <h3 className="font-black text-xs uppercase mb-4 text-slate-400">1. Prøven / Fasit</h3>
                 <button onClick={() => taskInputRef.current?.click()} className="w-full h-40 border-2 border-dashed border-indigo-200 rounded-2xl flex flex-col items-center justify-center text-indigo-400 font-black hover:bg-indigo-50 transition-all">
                    <span className="text-2xl mb-2">📄</span>
                    <span>Last opp oppgave/fasit</span>
                    <span className="text-[10px] mt-2 font-bold opacity-60">Splittes automatisk ved bred scan</span>
                 </button>
                 <input ref={taskInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} />
                 
                 <div className="mt-8 space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Opplastede filer:</p>
                    {activeProject?.taskFiles.length === 0 && <p className="text-xs text-slate-300 italic">Ingen filer lastet opp ennå.</p>}
                    {activeProject?.taskFiles.map(f => (
                        <div key={f.id} className="text-[11px] font-bold bg-slate-50 p-4 rounded-xl flex justify-between items-center border border-slate-100 animate-in fade-in slide-in-from-top-2">
                           <span className="truncate pr-4 flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                             {f.fileName}
                           </span>
                           <button onClick={() => updateActiveProject({ taskFiles: activeProject.taskFiles.filter(i => i.id !== f.id) })} className="text-red-300 hover:text-red-500 transition-colors">✕</button>
                        </div>
                    ))}
                 </div>
               </div>
               
               <div className="bg-white p-8 border rounded-3xl shadow-sm border-t-8 border-t-emerald-600">
                 <h3 className="font-black text-xs uppercase mb-4 text-slate-400">2. Elevbesvarelser</h3>
                 <button onClick={() => fileInputRef.current?.click()} className="w-full h-40 border-2 border-dashed border-emerald-200 rounded-2xl flex flex-col items-center justify-center text-emerald-400 font-black hover:bg-emerald-50 transition-all">
                    <span className="text-2xl mb-2">📸</span>
                    <span>Last opp besvarelser</span>
                    <span className="text-[10px] mt-2 font-bold opacity-60">JPG bilder</span>
                 </button>
                 <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} />
                 
                 <div className="mt-8 space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                    <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Kandidatoversikt:</p>
                    {sortedCandidates.length === 0 && <p className="text-xs text-slate-300 italic">Ingen besvarelser lastet opp ennå.</p>}
                    {sortedCandidates.map(c => (
                        <div key={c.id} className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Kandidat {c.id}</span>
                              <span className="text-[9px] font-bold text-emerald-400 uppercase">{c.pages.length} sider</span>
                           </div>
                           <div className="flex flex-wrap gap-1">
                              {c.pages.map(p => <div key={p.id} className="w-3 h-3 rounded-[2px] bg-emerald-200 border border-emerald-300" />)}
                           </div>
                        </div>
                    ))}
                 </div>
               </div>
             </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="flex h-[calc(100vh-73px)]">
            <div className="w-64 bg-white border-r overflow-y-auto p-4 custom-scrollbar">
              <h3 className="font-black text-[10px] text-slate-400 uppercase mb-4">Kandidater</h3>
              {sortedCandidates.map(c => (
                <button key={c.id} onClick={() => setSelectedCandidateId(c.id)} className={`w-full text-left p-4 rounded-xl mb-1 font-black text-xs transition-all ${selectedCandidateId === c.id ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'}`}>Kandidat {c.id}</button>
              ))}
            </div>
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-50">
              {currentCandidate ? currentCandidate.pages.map(p => (
                <div key={p.id} className="bg-white border p-8 rounded-[40px] mb-8 grid grid-cols-1 xl:grid-cols-2 gap-8 shadow-sm group relative">
                  <div className="relative group/img">
                    <img src={p.imagePreview} className="rounded-2xl border shadow-sm w-full h-auto cursor-zoom-in" onClick={() => setZoomedImage(p.imagePreview)} />
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase text-slate-500 shadow-sm opacity-0 group-hover/img:opacity-100 transition-opacity">Klikk for å zoome</div>
                  </div>
                  <div className="flex flex-col gap-6">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-300 mb-2 tracking-widest">Håndskriftstolkning (KaTeX)</p>
                      <div className="bg-indigo-50/40 p-5 rounded-3xl border border-indigo-100/50 text-sm font-medium min-h-[80px]">
                        <LatexRenderer content={p.transcription || "Ingen matematikk detektert."} />
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col">
                      <p className="text-[10px] font-black uppercase text-slate-300 mb-2 tracking-widest">Rediger råtekst</p>
                      <textarea 
                          className="flex-1 bg-white border-2 border-slate-50 p-6 rounded-3xl text-sm font-medium leading-relaxed resize-none focus:border-indigo-100 focus:ring-4 focus:ring-indigo-50 transition-all outline-none min-h-[250px]" 
                          value={p.transcription} 
                          onChange={(e) => {
                              const newTxt = e.target.value;
                              updateActiveProject({
                                  candidates: activeProject?.candidates.map(c => c.id === currentCandidate.id ? {
                                      ...c, pages: c.pages.map(page => page.id === p.id ? {...page, transcription: newTxt} : page)
                                  } : c)
                              });
                          }}
                      />
                    </div>
                  </div>
                </div>
              )) : <div className="h-full flex items-center justify-center text-slate-300 font-black uppercase tracking-[0.2em]">Velg en kandidat for å verifisere data</div>}
            </div>
          </div>
        )}

        {currentStep === 'rubric' && (
          <div className="max-w-7xl mx-auto py-12 px-6">
            <div className="bg-white p-12 rounded-[40px] border shadow-sm">
               <h2 className="text-3xl font-black mb-2 tracking-tight text-slate-900">Rettemanual & Løsningsforslag</h2>
               <p className="text-slate-400 text-sm mb-12 font-medium italic">Finstem AI-ens foreslåtte manual. Bruk $...$ for matematikk.</p>
               
               {activeProject?.rubric && (
                 <div className="space-y-16 animate-in fade-in duration-700">
                   <div className="space-y-12">
                     {activeProject.rubric.criteria.map((c, idx) => (
                       <div key={idx} className="bg-slate-50 rounded-[40px] border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all">
                         <div className="p-8 bg-indigo-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center flex-1 w-full">
                                <div className="flex flex-col w-full md:w-auto">
                                  <label className="text-[9px] font-black uppercase opacity-60 mb-1 tracking-widest">Oppgave-ID</label>
                                  <input 
                                    className="bg-white/10 border-none rounded-xl px-4 py-2 font-black text-xl w-full md:w-48 outline-none focus:bg-white/20 transition-all" 
                                    value={c.name} 
                                    onChange={e => updateRubricCriterion(idx, { name: e.target.value })}
                                  />
                                </div>
                                <div className="flex flex-col w-full md:w-auto">
                                  <label className="text-[9px] font-black uppercase opacity-60 mb-1 tracking-widest">Tema</label>
                                  <input 
                                    className="text-[10px] uppercase font-black bg-white/10 border-none rounded-xl px-4 py-3 outline-none focus:bg-white/20 transition-all tracking-[0.2em] w-full md:w-64" 
                                    value={c.tema} 
                                    onChange={e => updateRubricCriterion(idx, { tema: e.target.value })}
                                  />
                                </div>
                            </div>
                            <div className="flex flex-col items-center">
                               <label className="text-[9px] font-black uppercase opacity-60 mb-1 tracking-widest">Maks Poeng</label>
                               <input 
                                 type="number"
                                 className="bg-white/20 px-6 py-2 rounded-xl text-lg font-black backdrop-blur-sm w-24 outline-none text-center"
                                 value={c.maxPoints}
                                 onChange={e => updateRubricCriterion(idx, { maxPoints: Number(e.target.value) })}
                               />
                            </div>
                         </div>
                         
                         <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[500px]">
                            {/* Løsningsforslag */}
                            <div className="p-10 border-r border-slate-200 bg-white flex flex-col gap-6">
                                <h5 className="text-[11px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-2">
                                    <span className="bg-indigo-100 p-1.5 rounded-lg">💡</span> Løsningsforslag
                                </h5>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100/50 text-base font-medium leading-relaxed text-slate-800 min-h-[150px] shadow-inner overflow-y-auto">
                                    <LatexRenderer content={c.suggestedSolution} />
                                </div>
                                <textarea 
                                  className="flex-1 w-full bg-white p-6 rounded-3xl text-sm font-medium border-2 border-slate-100 focus:border-indigo-200 focus:ring-4 focus:ring-indigo-50 transition-all outline-none leading-relaxed resize-none"
                                  value={c.suggestedSolution}
                                  onChange={e => updateRubricCriterion(idx, { suggestedSolution: e.target.value })}
                                  placeholder="Rediger løsningsforslag her..."
                                />
                            </div>

                            {/* Kriterier */}
                            <div className="p-10 bg-slate-50/40 flex flex-col gap-6">
                                <h5 className="text-[11px] font-black uppercase text-emerald-600 tracking-widest flex items-center gap-2">
                                    <span className="bg-emerald-100 p-1.5 rounded-lg">✅</span> Vurderingskriterier
                                </h5>
                                <div className="p-6 bg-white border border-slate-200/50 rounded-3xl text-sm font-medium text-slate-600 italic leading-relaxed shadow-sm min-h-[150px] overflow-y-auto">
                                    <LatexRenderer content={c.description} />
                                </div>
                                <textarea 
                                  className="flex-1 w-full bg-white p-6 rounded-3xl text-sm font-medium border-2 border-slate-100 focus:border-emerald-200 focus:ring-4 focus:ring-emerald-50 transition-all outline-none leading-relaxed resize-none"
                                  value={c.description}
                                  onChange={e => updateRubricCriterion(idx, { description: e.target.value })}
                                  placeholder="Beskriv hva som gir poeng..."
                                />
                                
                                {c.commonMistakes && c.commonMistakes.length > 0 && (
                                    <div className="mt-4 space-y-4">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Vanlige feil & poengtrekk:</p>
                                        <div className="grid grid-cols-1 gap-3">
                                            {c.commonMistakes.map((m, mi) => (
                                                <div key={mi} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
                                                    <div className="flex justify-between font-black items-center">
                                                        <span className="text-red-500">{m.mistake}</span>
                                                        <span className="bg-red-50 text-red-600 px-4 py-1.5 rounded-xl text-[10px]">-{m.deduction}p</span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 leading-relaxed"><LatexRenderer content={m.explanation} /></p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                         </div>
                       </div>
                     ))}
                   </div>

                   <div className="pt-12 border-t border-slate-100 flex flex-col gap-4">
                        <button onClick={() => { setCurrentStep('results'); performEvaluation(); }} className="w-full py-8 bg-emerald-600 text-white rounded-[32px] font-black text-2xl shadow-2xl shadow-emerald-100 hover:bg-emerald-700 transition-all transform hover:scale-[1.02] active:scale-95">
                            🚀 Start automatisk retting av alle besvarelser
                        </button>
                        <button onClick={() => handleGenerateRubric(true)} className="w-full py-4 text-slate-400 font-black hover:text-indigo-600 transition-all text-[11px] uppercase tracking-[0.3em]">
                            Oppdater manual basert på flere elevbesvarelser
                        </button>
                   </div>
                 </div>
               )}
            </div>
          </div>
        )}

        {currentStep === 'results' && activeProject && (
          <div className="max-w-7xl mx-auto py-12 px-6 animate-in fade-in duration-500">
            <header className="flex justify-between items-center mb-12 no-print">
               <div>
                  <h2 className="text-4xl font-black tracking-tight text-slate-900">Resultater</h2>
                  <p className="text-slate-500 font-medium text-sm mt-1">Vurdering utført av AI basert på din rettemanual.</p>
               </div>
               <div className="flex bg-white p-1.5 rounded-2xl border shadow-sm">
                 <button onClick={() => setResultView('individual')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${resultView === 'individual' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-slate-600'}`}>Enkelt-kandidat</button>
                 <button onClick={() => setResultView('group')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${resultView === 'group' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-slate-600'}`}>Klassenivå</button>
               </div>
            </header>

            {resultView === 'individual' && currentCandidate && (
              <div className="bg-white rounded-[40px] shadow-sm border p-12 animate-in slide-in-from-bottom-12 duration-500">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-10">
                   <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                      <span className="font-black text-slate-400 text-[11px] uppercase tracking-widest">Velg elev:</span>
                      <select className="bg-white border-2 border-slate-100 rounded-xl px-8 py-3 font-black text-base outline-none focus:ring-4 focus:ring-indigo-100 transition-all" value={currentCandidate.id} onChange={e => setSelectedCandidateId(e.target.value)}>
                        {sortedCandidates.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                      </select>
                   </div>
                   <div className="flex flex-col items-end">
                      <div className="text-7xl font-black text-indigo-700 leading-none flex items-baseline gap-3">
                          {currentCandidate.evaluation?.score.toFixed(1)} 
                          <span className="text-3xl text-slate-200">/ {activeProject.rubric?.totalMaxPoints}</span>
                      </div>
                      <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-300 mt-4 flex items-center gap-3">Karakter: <span className="text-white bg-indigo-600 px-5 py-2 rounded-xl shadow-lg shadow-indigo-100">{currentCandidate.evaluation?.grade}</span></div>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
                   <div className="space-y-16">
                      <section>
                        <h4 className="text-indigo-900 font-black text-[11px] uppercase tracking-widest mb-6 flex items-center gap-3"><div className="w-4 h-1 bg-indigo-600 rounded-full"></div> Oppsummering</h4>
                        <div className="bg-indigo-50/40 p-10 rounded-[40px] border border-indigo-100 italic text-indigo-950 text-lg leading-relaxed shadow-inner">
                          <LatexRenderer content={currentCandidate.evaluation?.feedback || ""} />
                        </div>
                      </section>

                      <section>
                        <h4 className="text-indigo-900 font-black text-[11px] uppercase tracking-widest mb-6 flex items-center gap-3"><div className="w-4 h-1 bg-indigo-600 rounded-full"></div> Vekstpunkter</h4>
                        <div className="space-y-4">
                           {currentCandidate.evaluation?.vekstpunkter?.map((v, i) => (
                             <div key={i} className="flex items-start gap-6 p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:border-indigo-200 transition-all group">
                               <span className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 text-sm font-black group-hover:bg-indigo-600 group-hover:text-white transition-all">{i+1}</span>
                               <div className="pt-2 leading-relaxed font-semibold text-slate-700"><LatexRenderer content={v} /></div>
                             </div>
                           ))}
                        </div>
                      </section>
                   </div>

                   <div className="bg-white rounded-[40px] border border-slate-100 p-2 shadow-inner overflow-hidden self-start">
                      <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="bg-slate-50">
                              <th className="p-8 text-[11px] font-black uppercase text-slate-400 tracking-widest rounded-tl-[38px]">DELOPPGAVE</th>
                              <th className="p-8 text-[11px] font-black uppercase text-slate-400 tracking-widest">TEMA</th>
                              <th className="p-8 text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">POENG</th>
                              <th className="p-8 text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">MAKS</th>
                              <th className="p-8 rounded-tr-[38px]"></th>
                           </tr>
                        </thead>
                        <tbody>
                           {currentCandidate.evaluation?.taskBreakdown?.map((tb, i) => (
                             <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-all">
                                <td className="p-8 font-black text-base text-slate-800">{tb.taskName}</td>
                                <td className="p-8 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{tb.tema}</td>
                                <td className="p-8 font-black text-emerald-600 text-xl text-center">{tb.score.toFixed(1)}</td>
                                <td className="p-8 text-[11px] font-bold text-slate-200 text-center">/ {tb.max}</td>
                                <td className="p-8 text-right">
                                   {tb.score === tb.max ? (
                                       <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-600 px-4 py-2 rounded-xl shadow-sm">Full uttelling</span>
                                   ) : <span className="text-[10px] font-black uppercase bg-amber-50 text-amber-500 px-4 py-2 rounded-xl">Delvis</span>}
                                </td>
                             </tr>
                           ))}
                        </tbody>
                      </table>
                   </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {zoomedImage && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setZoomedImage(null)}>
              <img src={zoomedImage} className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl border-4 border-white/10 animate-in zoom-in duration-300" alt="Forstørret bilde" />
          </div>
      )}

      {/* Global Status Indicator */}
      {processStatus.type && (
        <div className="fixed bottom-12 right-12 bg-slate-900 text-white p-10 rounded-[40px] shadow-2xl flex items-center gap-12 z-[200] border border-white/10 animate-in slide-in-from-right-12 duration-500">
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-4">
              {processStatus.type === 'upload' ? 'Filbehandling' : processStatus.type === 'rubric' ? 'Analyse' : 'Retting'}
            </span>
            <span className="text-lg font-black truncate max-w-[300px] leading-tight">{processStatus.statusText}</span>
          </div>
          <div className="w-24 h-24 relative flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle className="text-white/5" strokeWidth="3" stroke="currentColor" fill="none" r="16" cx="18" cy="18" />
              <circle className="text-indigo-500" strokeDasharray={`${processStatus.total > 0 ? Math.round((processStatus.current/processStatus.total)*100) : 0}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" r="16" cx="18" cy="18" style={{ transition: 'stroke-dasharray 0.5s ease-out' }} />
            </svg>
            <span className="absolute text-base font-black tracking-tight">{processStatus.total > 0 ? Math.round((processStatus.current/processStatus.total)*100) : 0}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
