
import React, { useState, useEffect, useRef } from 'react';
import { Page, Candidate, Rubric, Project } from './types';
import { transcribeAndAnalyzeImage, generateRubricFromTaskAndSamples, evaluateCandidate } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject } from './services/storageService';
// @ts-ignore
import mammoth from 'mammoth';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [currentStep, setCurrentStep] = useState<'setup' | 'review' | 'rubric' | 'results'>('setup');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, statusText: '' });
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAllProjects();
  }, []);

  const loadAllProjects = async () => {
    const all = await getAllProjects();
    setProjects(all.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const createNewProject = () => {
    const newProj: Project = {
      id: Math.random().toString(36).substring(7),
      name: `Ny vurdering ${new Date().toLocaleDateString('no-NO')}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      taskDescription: '',
      taskFiles: [],
      candidates: [],
      rubric: null,
      status: 'draft'
    };
    setActiveProject(newProj);
    setCurrentStep('setup');
    setView('editor');
  };

  const handleProjectSelect = (project: Project) => {
    setActiveProject(project);
    if (project.candidates.length > 0) {
      setCurrentStep('review');
      setSelectedCandidateId(project.candidates[0].id);
    } else {
      setCurrentStep('setup');
    }
    setView('editor');
  };

  const updateActiveProject = async (updates: Partial<Project>) => {
    if (!activeProject) return;
    const updated = { ...activeProject, ...updates, updatedAt: Date.now() };
    setActiveProject(updated);
    await saveProject(updated);
    loadAllProjects();
  };

  const handleTaskFileSelect = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const textPage: Page = {
          id: Math.random().toString(36).substring(7),
          fileName: file.name,
          imagePreview: '', 
          base64Data: '',
          mimeType: 'text/plain',
          transcription: result.value,
          status: 'completed'
        };
        updateActiveProject({ 
          taskFiles: [...(activeProject?.taskFiles || []), textPage],
          taskDescription: (activeProject?.taskDescription || '') + "\n\nInnhold fra DOCX:\n" + result.value
        });
      } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const page: Page = {
            id: Math.random().toString(36).substring(7),
            fileName: file.name,
            imagePreview: file.type === 'application/pdf' ? '' : e.target?.result as string,
            base64Data: (e.target?.result as string).split(',')[1],
            mimeType: file.type,
            status: 'completed'
          };
          updateActiveProject({ taskFiles: [...(activeProject?.taskFiles || []), page] });
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const startAnalysis = async (files: FileList) => {
    if (!activeProject) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: files.length, statusText: 'Laster inn...' });
    setCurrentStep('review');
    
    const rawPages: Page[] = [];
    await Promise.all(Array.from(files).map(file => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          rawPages.push({
            id: Math.random().toString(36).substring(7),
            fileName: file.name,
            imagePreview: e.target?.result as string,
            base64Data: (e.target?.result as string).split(',')[1],
            mimeType: file.type,
            status: 'pending'
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }));

    const total = rawPages.length;
    setProgress({ current: 0, total, statusText: 'Analyserer kandidater...' });

    let currentCandidates = [...activeProject.candidates];

    for (let i = 0; i < rawPages.length; i++) {
      const page = rawPages[i];
      setProgress({ current: i + 1, total, statusText: `Leser ${page.fileName}...` });

      try {
        if (i > 0) await new Promise(r => setTimeout(r, 4500));
        const results = await transcribeAndAnalyzeImage(page);
        
        results.forEach(res => {
          const cId = res.candidateId || "Ukjent";
          let candidate = currentCandidates.find(c => c.id === cId);
          
          const newPage: Page = {
            ...page,
            id: Math.random().toString(36).substring(7),
            candidateId: cId,
            pageNumber: res.pageNumber,
            transcription: res.text,
            status: 'completed'
          };

          if (!candidate) {
            currentCandidates.push({ id: cId, name: `Kandidat ${cId}`, status: 'processing', pages: [newPage] });
          } else {
            candidate.pages = [...candidate.pages, newPage].sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
          }
        });

        updateActiveProject({ candidates: [...currentCandidates] });
        if (i === 0 && currentCandidates.length > 0) setSelectedCandidateId(currentCandidates[0].id);

      } catch (e) { console.error(e); }
    }

    updateActiveProject({ candidates: currentCandidates.map(c => ({ ...c, status: 'completed' })), status: 'reviewing' });
    setIsProcessing(false);
    setProgress({ current: 0, total: 0, statusText: '' });
  };

  const selectedCandidate = activeProject?.candidates.find(c => c.id === selectedCandidateId);
  const progressPercentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 lg:p-12 animate-in fade-in duration-500">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black shadow-lg shadow-indigo-100 rotate-2 text-lg">E</div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Mine vurderingsprosjekter</h1>
              </div>
              <p className="text-slate-500 text-sm font-medium">Digital assistent for retting og vurdering</p>
            </div>
            <button 
              onClick={createNewProject}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 text-sm"
            >
              <span>+</span> Nytt vurderingsprosjekt
            </button>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {projects.map(p => (
              <div 
                key={p.id} 
                className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all group cursor-pointer relative"
                onClick={() => handleProjectSelect(p)}
              >
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                      onClick={(e) => { e.stopPropagation(); if(confirm("Slette vurderingsprosjekt?")) deleteProject(p.id).then(loadAllProjects); }}
                      className="w-7 h-7 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-xs"
                   >✕</button>
                </div>
                <div className="mb-4">
                   <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest mb-2 ${p.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {p.status === 'completed' ? 'Ferdig' : 'Aktiv'}
                   </div>
                   <h3 className="text-base font-black text-slate-800 leading-tight mb-0.5 truncate">{p.name}</h3>
                   <p className="text-slate-400 text-[8px] font-bold uppercase tracking-widest">{new Date(p.updatedAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{p.candidates.length} kandidater</span>
                   <span className="text-indigo-600 font-bold text-[10px]">Åpne →</span>
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <div className="col-span-full py-20 text-center bg-white border border-dashed border-slate-200 rounded-2xl">
                <p className="text-slate-400 font-bold text-sm">Ingen prosjekter ennå. Start din første vurdering over.</p>
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 lg:p-10 text-white shadow-xl">
             <div className="max-w-2xl">
                <h2 className="text-xl font-black mb-3 flex items-center gap-2">🔒 Personvern & Sikkerhet</h2>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                   Data lagres <strong>kun lokalt</strong> i din nettleser (IndexedDB). 
                   Ingen bilder eller transkripsjoner lagres sentralt. 
                   AI-analyse utføres kryptert via Google Gemini.
                </p>
             </div>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { id: 'setup', label: '1. Oppsett', sub: 'Prøve & Ark', icon: '📎' },
    { id: 'review', label: '2. Kontroll', sub: 'Verifiser lesing', icon: '🔍' },
    { id: 'rubric', label: '3. Rettemanual', sub: 'Kriterier', icon: '🎯' },
    { id: 'results', label: '4. Resultater', sub: 'Vurdering', icon: '🏆' }
  ];

  return (
    <div className="min-h-screen flex flex-col animate-in fade-in duration-500 bg-[#F8FAFC]">
      {/* Horizontal Top Navigation */}
      <header className="no-print bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => { updateActiveProject({}); setView('dashboard'); }}
            className="flex items-center gap-2 text-slate-400 hover:text-indigo-600 transition-all font-black uppercase text-[10px] tracking-widest border-r border-slate-100 pr-6 h-10"
          >
            <span>←</span> Oversikt
          </button>
          <div className="flex flex-col">
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Aktiv vurdering:</p>
            <input 
              className="bg-transparent font-black text-slate-900 outline-none focus:text-indigo-600 text-sm truncate w-48"
              value={activeProject?.name}
              onChange={(e) => updateActiveProject({ name: e.target.value })}
            />
          </div>
        </div>

        <nav className="flex items-center gap-1 md:gap-4 flex-1 justify-center max-w-4xl px-4">
          {steps.map(step => (
            <button
              key={step.id}
              disabled={step.id !== 'setup' && activeProject?.candidates.length === 0}
              onClick={() => setCurrentStep(step.id as any)}
              className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-xl border transition-all relative overflow-hidden flex-1 max-w-[200px] ${currentStep === step.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-50 border-transparent hover:bg-white text-slate-400'}`}
            >
              <span className="text-xl hidden md:inline">{step.icon}</span>
              <div className="text-left">
                 <p className="font-black text-[9px] md:text-xs leading-none">{step.label}</p>
                 <p className="text-[7px] md:text-[8px] font-bold uppercase tracking-widest opacity-70 leading-none mt-1 hidden sm:block">{step.sub}</p>
              </div>
            </button>
          ))}
        </nav>

        <div className="w-32 flex justify-end">
          {isProcessing && (
            <div className="flex items-center gap-2 text-indigo-600 animate-pulse">
               <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
               <span className="text-[9px] font-black uppercase tracking-widest">Arbeider...</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative flex flex-col">
        {zoomedImage && (
          <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setZoomedImage(null)}>
            <img src={zoomedImage} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" alt="Zoom" />
          </div>
        )}

        <div className="flex-1 flex flex-col h-full">
          {currentStep === 'setup' && (
            <div className="max-w-4xl mx-auto py-8 px-6 animate-in fade-in duration-500 w-full">
               <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Klargjør vurdering</h2>
               <p className="text-slate-500 text-sm font-medium mb-8">Last opp prøven og kandidatenes svar.</p>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col">
                     <h3 className="text-base font-black mb-3">Prøven (DOCX/PDF/Bilde)</h3>
                     <div 
                        onClick={() => taskInputRef.current?.click()}
                        className="flex-1 min-h-[140px] border-2 border-dashed border-slate-100 rounded-xl p-4 hover:border-indigo-200 cursor-pointer flex flex-col items-center justify-center group bg-slate-50/30"
                     >
                        <input ref={taskInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && handleTaskFileSelect(e.target.files)} />
                        {activeProject?.taskFiles.length ? (
                          <div className="w-full grid grid-cols-1 gap-1.5">
                             {activeProject.taskFiles.map(f => (
                               <div key={f.id} className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-100 text-[10px] font-bold truncate">
                                  📄 {f.fileName}
                               </div>
                             ))}
                          </div>
                        ) : <p className="font-black text-slate-300 text-xs">Last opp oppgave</p>}
                     </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col">
                     <h3 className="text-base font-black mb-3">Kandidatenes svar (Bilder)</h3>
                     <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 min-h-[140px] border-2 border-dashed border-slate-100 rounded-xl p-4 hover:border-green-200 cursor-pointer flex flex-col items-center justify-center bg-slate-50/30"
                     >
                        <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && startAnalysis(e.target.files)} />
                        <p className="font-black text-slate-300 text-xs">Last opp kandidatliste</p>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {currentStep === 'review' && (
             <div className="flex-1 flex overflow-hidden">
                <div className="w-64 border-r border-slate-200 bg-white p-4 flex flex-col shrink-0 overflow-hidden">
                   <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-widest px-2 mb-3">Kandidater</h3>
                   <div className="space-y-1 overflow-y-auto pr-1 custom-scrollbar flex-1">
                     {activeProject?.candidates.map(c => (
                       <button 
                         key={c.id}
                         onClick={() => setSelectedCandidateId(c.id)}
                         className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${selectedCandidateId === c.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-slate-50 border-transparent hover:bg-white text-slate-600'}`}
                       >
                         <span className="font-black text-[11px]">Kandidat {c.id}</span>
                         <span className="text-[9px] opacity-70 font-bold">{c.pages.length} s</span>
                       </button>
                     ))}
                   </div>
                </div>

                <div className="flex-1 bg-white flex flex-col overflow-hidden relative">
                   {selectedCandidate ? (
                     <>
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                           <h2 className="text-lg font-black">Kandidat {selectedCandidate.id}</h2>
                           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Verifiser transkripsjon</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                          {selectedCandidate.pages.map((page, idx) => (
                            <div key={page.id} className="grid grid-cols-1 xl:grid-cols-2 gap-6 bg-slate-50/30 p-4 rounded-2xl border border-slate-100">
                               <div className="cursor-zoom-in relative" onClick={() => setZoomedImage(page.imagePreview)}>
                                  <div className="absolute top-2 left-2 bg-slate-900/80 text-white text-[9px] font-black px-2 py-0.5 rounded-md">SIDE {idx+1}</div>
                                  <img src={page.imagePreview} className="w-full rounded-xl border border-slate-200 shadow-sm" alt="Scan" />
                               </div>
                               <textarea 
                                  value={page.transcription}
                                  onChange={(e) => {
                                    const newText = e.target.value;
                                    updateActiveProject({
                                      candidates: activeProject?.candidates.map(c => c.id === selectedCandidate.id ? {
                                        ...c, pages: c.pages.map(p => p.id === page.id ? { ...p, transcription: newText } : p)
                                      } : c)
                                    });
                                  }}
                                  className="w-full p-4 bg-white rounded-xl border border-slate-200 text-xs font-medium leading-relaxed resize-none outline-none focus:ring-4 focus:ring-indigo-50 min-h-[250px]"
                                  placeholder="Ingen tekst funnet..."
                                />
                            </div>
                          ))}
                        </div>
                     </>
                   ) : <div className="flex-1 flex items-center justify-center text-slate-300 font-bold text-sm italic">Velg en kandidat til venstre</div>}
                </div>
             </div>
          )}

          {currentStep === 'rubric' && (
             <div className="max-w-3xl mx-auto py-8 px-6 animate-in fade-in duration-500 w-full">
                <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
                   <h2 className="text-2xl font-black mb-1 tracking-tight">Rettemanual</h2>
                   <p className="text-slate-500 text-xs font-medium mb-6">Opprett poengfordeling og kriterier automatisk eller manuelt.</p>

                   <textarea 
                      value={activeProject?.taskDescription}
                      onChange={(e) => updateActiveProject({ taskDescription: e.target.value })}
                      placeholder="Legg til føringer eller sensorveiledning..."
                      className="w-full h-24 p-4 rounded-xl bg-slate-50 border border-slate-100 mb-6 text-xs font-medium outline-none focus:bg-white"
                   />
                   
                   <button 
                    onClick={async () => {
                      setProgress({ current: 0, total: 1, statusText: 'Lager rettemanual...' });
                      setIsProcessing(true);
                      try {
                        const samples = activeProject?.candidates.slice(0, 2).map(c => c.pages.map(p => p.transcription).join(" ")) || [];
                        const res = await generateRubricFromTaskAndSamples(activeProject?.taskFiles || [], activeProject?.taskDescription || '', samples);
                        updateActiveProject({ rubric: res });
                      } catch (e) { alert("Analyse feilet."); }
                      setIsProcessing(false);
                      setProgress({ current: 0, total: 0, statusText: '' });
                    }}
                    disabled={isProcessing}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-all text-sm mb-8"
                   >
                     {isProcessing ? 'Analyserer...' : 'Generer vurderingsplan ✨'}
                   </button>

                   {activeProject?.rubric && (
                      <div className="animate-in slide-in-from-bottom-4 duration-500 border-t border-slate-100 pt-6">
                         <h3 className="text-lg font-black mb-4">{activeProject.rubric.title}</h3>
                         <div className="space-y-2 mb-8">
                            {activeProject.rubric.criteria.map((c, i) => (
                              <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center group">
                                 <div className="flex-1 pr-4">
                                    <p className="font-bold text-slate-800 text-xs">{c.name}</p>
                                    <p className="text-[9px] text-slate-400 leading-tight mt-0.5">{c.description}</p>
                                 </div>
                                 <span className="font-black text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-50 shadow-sm text-[11px] min-w-[32px] text-center">{c.maxPoints}p</span>
                              </div>
                            ))}
                         </div>
                         
                         <button 
                          onClick={async () => {
                            setIsProcessing(true);
                            const updated = [...(activeProject?.candidates || [])];
                            const taskContext = (activeProject?.taskDescription || '') + "\n" + (activeProject?.taskFiles.map(f => f.transcription || '').join("\n"));
                            for (let i = 0; i < updated.length; i++) {
                              try {
                                setProgress({ current: i + 1, total: updated.length, statusText: `Vurderer Kandidat ${updated[i].id}...` });
                                updated[i].evaluation = await evaluateCandidate(updated[i], activeProject.rubric!, taskContext);
                                updateActiveProject({ candidates: [...updated] });
                              } catch (e) {}
                            }
                            setCurrentStep('results');
                            setIsProcessing(false);
                            updateActiveProject({ status: 'completed' });
                            setProgress({ current: 0, total: 0, statusText: '' });
                          } }
                          disabled={isProcessing}
                          className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-base shadow-xl hover:bg-black transition-all"
                         >
                           Start vurdering av alle 🏆
                         </button>
                      </div>
                   )}
                </div>
             </div>
          )}

          {currentStep === 'results' && (
             <div className="max-w-6xl mx-auto py-8 px-6 animate-in fade-in w-full">
                <header className="flex justify-between items-center mb-6 no-print">
                   <h2 className="text-2xl font-black tracking-tight">Vurderingsresultater</h2>
                   <div className="flex gap-2">
                     <button onClick={() => window.print()} className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg font-bold shadow-sm text-xs">🖨️ Skriv ut</button>
                     <button onClick={() => setView('dashboard')} className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs">Ferdig</button>
                   </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                   {activeProject?.candidates.map(c => (
                     <div key={c.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm border-t-4 border-t-indigo-600 flex flex-col h-full print-break">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-black text-sm text-slate-900">Kandidat {c.id}</h4>
                          <div className="bg-indigo-600 text-white w-8 h-8 flex items-center justify-center rounded-lg font-black text-lg shadow-md">
                            {c.evaluation?.grade || '-'}
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl flex-1 text-[11px] text-slate-700 italic leading-relaxed mb-4 border border-slate-100 overflow-y-auto max-h-32 custom-scrollbar">
                          "{c.evaluation?.feedback || 'Ingen tilbakemelding.'}"
                        </div>
                        <div className="flex justify-between items-center text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">
                           <span>Score:</span>
                           <span className="text-indigo-600 text-sm font-black">{c.evaluation?.score || 0} / {activeProject?.rubric?.totalMaxPoints}</span>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          )}
        </div>

        {/* Improved Progress HUD */}
        {isProcessing && (
          <div className="fixed bottom-6 right-6 bg-[#0B0E14] text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 z-[100] flex items-center gap-6 animate-in slide-in-from-right-6">
             <div className="flex flex-col">
                <div className="flex items-center gap-1.5 mb-1">
                   <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></div>
                   <span className="text-[8px] font-black uppercase tracking-[0.2em] text-indigo-400">Systemstatus</span>
                </div>
                <span className="text-xs font-black whitespace-nowrap max-w-[150px] truncate">{progress.statusText}</span>
             </div>
             <div className="relative w-12 h-12 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle className="text-slate-800" strokeWidth="3" stroke="currentColor" fill="none" r="16" cx="18" cy="18" />
                  <circle className="text-indigo-500" strokeDasharray={`${progressPercentage}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" r="16" cx="18" cy="18" style={{ transition: 'stroke-dasharray 0.3s ease-out' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black">{progressPercentage}%</div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
