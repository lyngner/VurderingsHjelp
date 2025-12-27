
import React, { useState, useEffect, useMemo } from 'react';
import { Page, Candidate, Project } from './types';
import { transcribeAndAnalyzeImage, generateRubricFromTaskAndSamples, evaluateCandidate, analyzeTextContent } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject } from './services/storageService';
import mammoth from 'mammoth';

// Importer de nye spesialiserte komponentene
import { SetupStep } from './components/SetupStep';
import { ReviewStep } from './components/ReviewStep';
import { RubricStep } from './components/RubricStep';
import { ResultsStep } from './components/ResultsStep';

if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// Forbedret hash-funksjon for å unngå kollisjoner ved skannede bilder
const generateHash = (str: string): string => {
  if (!str) return Math.random().toString(36).substring(7);
  
  // Ta prøver fra starten, midten og slutten for å sikre unikhet
  const sample = str.length > 2000 
    ? str.substring(500, 1000) + str.substring(str.length / 2, str.length / 2 + 500) + str.substring(str.length - 1000, str.length - 500)
    : str;

  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

const steps = [
  { id: 'setup', label: 'Innlasting', icon: '📥' },
  { id: 'review', label: 'Kontroll', icon: '🔍' },
  { id: 'rubric', label: 'Rettemanual', icon: '📋' },
  { id: 'results', label: 'Resultater', icon: '🏆' },
];

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [currentStep, setCurrentStep] = useState<'setup' | 'review' | 'rubric' | 'results'>('setup');
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
  const [selectedResultCandidateId, setSelectedResultCandidateId] = useState<string | null>(null);
  const [selectedReviewCandidateId, setSelectedReviewCandidateId] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState('');
  const [processingCount, setProcessingCount] = useState(0);

  useEffect(() => {
    getAllProjects().then(all => {
      setProjects(all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    });
  }, [activeProject]);

  useEffect(() => { 
    if (activeProject) {
      saveProject(activeProject);
      localStorage.setItem('activeProjectId', activeProject.id);
    }
  }, [activeProject]);

  const updateActiveProject = (updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  };

  const selectProject = (p: Project) => {
    setActiveProject(p);
    setView('editor');
    setCurrentStep('setup');
  };

  const createNewProject = () => {
    const newProj: Project = { 
      id: Math.random().toString(36).substring(7), 
      name: "Nytt prosjekt " + new Date().toLocaleDateString(), 
      createdAt: Date.now(), 
      updatedAt: Date.now(), 
      taskDescription: "", 
      taskFiles: [], 
      candidates: [], 
      unprocessedPages: [], 
      rubric: null, 
      status: 'draft' 
    };
    setActiveProject(newProj); 
    setView('editor'); 
    setCurrentStep('setup');
  };

  const processFileToImages = async (file: File): Promise<Page[]> => {
    return new Promise(async (resolve) => {
      if (file.name.endsWith('.docx')) {
        try {
          const buffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer: buffer });
          resolve([{ 
            id: Math.random().toString(36).substring(7), 
            fileName: file.name, 
            imagePreview: "", 
            base64Data: "", 
            contentHash: generateHash(result.value + file.name), 
            mimeType: 'text/plain', 
            status: 'pending', 
            transcription: result.value, 
            rotation: 0 
          }]);
          return;
        } catch (e) { resolve([]); return; }
      }
      
      if (file.type === 'application/pdf') {
        try {
          const buffer = await file.arrayBuffer();
          const pdf = await (window as any).pdfjsLib.getDocument({ data: buffer }).promise;
          const pages: Page[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.height = viewport.height; canvas.width = viewport.width;
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
            const b64 = canvas.toDataURL('image/jpeg', 0.6);
            pages.push({ 
              id: Math.random().toString(36).substring(7), 
              fileName: `${file.name} (S${i})`, 
              imagePreview: b64, 
              base64Data: b64.split(',')[1], 
              contentHash: generateHash(b64), 
              mimeType: 'image/jpeg', 
              status: 'pending', 
              rotation: 0 
            });
          }
          resolve(pages);
          return;
        } catch (e) { resolve([]); return; }
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          let w = img.width, h = img.height;
          if (w > 1200) { h = (1200/w)*h; w = 1200; }
          canvas.width = w; canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          const b64 = canvas.toDataURL('image/jpeg', 0.6);
          resolve([{ 
            id: Math.random().toString(36).substring(7), 
            fileName: file.name, 
            imagePreview: b64, 
            base64Data: b64.split(',')[1], 
            contentHash: generateHash(b64), 
            mimeType: 'image/jpeg', 
            status: 'pending', 
            rotation: 0 
          }]);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || (proj.taskFiles.length === 0 && !proj.taskDescription)) return;
    
    setRubricStatus({ loading: true, text: 'Analyserer oppgaveark og genererer rettemanual...' });
    try {
      const rubric = await generateRubricFromTaskAndSamples(proj.taskFiles, proj.taskDescription, []);
      updateActiveProject({ rubric });
    } catch (e) {
      console.error(e);
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const fileList = Array.from(files);
    setProcessingCount(prev => prev + fileList.length);

    try {
      const allNewTaskPages: Page[] = [];
      for (const file of fileList) {
        const pages = await processFileToImages(file);
        allNewTaskPages.push(...pages);
      }
      
      const updatedProject = { 
        ...activeProject, 
        taskFiles: [...(activeProject.taskFiles || []), ...allNewTaskPages] 
      };
      
      setActiveProject(updatedProject);
      
      // Start rettemanual-generering automatisk etter at filene er lastet inn
      handleGenerateRubric(updatedProject);
      
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingCount(prev => Math.max(0, prev - fileList.length));
    }
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    
    const fileList = Array.from(files);
    let allNewPages: Page[] = [];
    
    // 1. Les filer raskt (lokalt)
    for (const file of fileList) {
      const pages = await processFileToImages(file);
      allNewPages = [...allNewPages, ...pages];
    }

    if (allNewPages.length === 0) return;

    // 2. Legg alle sider i køen umiddelbart
    setActiveProject(prev => prev ? { 
      ...prev, 
      unprocessedPages: [...(prev.unprocessedPages || []), ...allNewPages] 
    } : null);

    setProcessingCount(prev => prev + allNewPages.length);

    // 3. Start bakgrunnsprosessering for hver side
    allNewPages.forEach(async (page) => {
      try {
        const results = page.mimeType === 'text/plain' 
          ? await analyzeTextContent(page.transcription!) 
          : await transcribeAndAnalyzeImage(page);
        
        if (results) {
          integratePageResult(page, results);
        }
      } catch (err) {
        console.error("Feil ved prosessering av side:", page.fileName, err);
        setActiveProject(prev => prev ? ({ 
          ...prev, 
          unprocessedPages: (prev.unprocessedPages || []).map(p => p.id === page.id ? { ...p, status: 'error' as const } : p) 
        }) : null);
      } finally {
        setProcessingCount(prev => Math.max(0, prev - 1));
      }
    });
  };

  const integratePageResult = (page: Page, results: any) => {
    setActiveProject(prev => {
      if (!prev) return null;
      let cands = [...(prev.candidates || [])];
      const resArr = Array.isArray(results) ? results : [results];
      
      resArr.forEach((res: any) => {
        if (!res) return;
        const cId = String(res.candidateId || "Ukjent");
        let candIndex = cands.findIndex(c => c.id === cId);
        const newPage: Page = { 
          ...page, 
          candidateId: cId, 
          part: res.part, 
          pageNumber: res.pageNumber, 
          transcription: res.fullText || page.transcription, 
          status: 'completed' 
        };

        if (candIndex === -1) {
          cands.push({ id: cId, name: `Kandidat ${cId}`, status: 'completed', pages: [newPage] });
        } else {
          const cand = cands[candIndex];
          if (!(cand.pages || []).some(p => p.id === page.id)) {
            const updatedPages = [...(cand.pages || []), newPage].sort((a,b) => (a.pageNumber||0)-(b.pageNumber||0));
            cands[candIndex] = { ...cand, pages: updatedPages };
          }
        }
      });
      
      return { 
        ...prev, 
        candidates: cands, 
        unprocessedPages: (prev.unprocessedPages || []).filter(p => p.id !== page.id) 
      };
    });
  };

  const handleEvaluateAll = async () => {
    if (!activeProject?.rubric) return;
    setRubricStatus({ loading: true, text: 'Vurderer besvarelser...' });
    try {
      const cands = [...(activeProject.candidates || [])];
      for (let i = 0; i < cands.length; i++) {
        if (cands[i].status !== 'evaluated') {
          const evalRes = await evaluateCandidate(cands[i], activeProject.rubric, "");
          cands[i] = { ...cands[i], evaluation: evalRes, status: 'evaluated' };
          setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
        }
      }
      setCurrentStep('results');
    } catch (e) { console.error(e); } finally { setRubricStatus({ loading: false, text: '' }); }
  };

  const rotatePage = (pId: string) => {
    if (!currentReviewCandidate) return;
    setActiveProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: (prev.candidates || []).map(c => 
          c.id === currentReviewCandidate.id 
            ? { ...c, pages: (c.pages || []).map(p => p.id === pId ? { ...p, rotation: ((p.rotation || 0) + 90) % 360 } : p) }
            : c
        )
      };
    });
  };

  const filteredCandidates = useMemo(() => {
    if (!activeProject?.candidates) return [];
    const lower = reviewFilter.toLowerCase();
    return (activeProject.candidates || []).filter(c => !reviewFilter || (c.name || "").toLowerCase().includes(lower) || (c.id || "").toLowerCase().includes(lower));
  }, [activeProject, reviewFilter]);

  const currentReviewCandidate = useMemo(() => {
    if (!selectedReviewCandidateId || !activeProject?.candidates) return null;
    return activeProject.candidates.find(c => c.id === selectedReviewCandidateId) || null;
  }, [selectedReviewCandidateId, activeProject]);

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-12">
        <header className="max-w-6xl mx-auto flex justify-between items-end mb-16">
          <div><h1 className="text-5xl font-black text-slate-800 tracking-tighter">ElevVurdering <span className="text-indigo-600">PRO</span></h1><p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-4">Profesjonell vurdering av besvarelser</p></div>
          <button onClick={createNewProject} className="bg-indigo-600 text-white px-10 py-5 rounded-[25px] font-black text-sm shadow-xl shadow-indigo-100 active:scale-95 transition-transform">Nytt prosjekt +</button>
        </header>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map(p => (
            <div key={p.id} onClick={() => selectProject(p)} className="bg-white p-10 rounded-[45px] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-indigo-50 group-hover:bg-indigo-600 transition-colors"></div>
              <h3 className="font-black text-xl text-slate-800 mb-2 truncate">{p.name}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">{new Date(p.updatedAt || 0).toLocaleDateString()}</p>
              <div className="flex justify-between items-center"><span className="bg-slate-50 text-slate-500 text-[9px] font-black px-4 py-2 rounded-full uppercase">{(p.candidates || []).length} elever</span><span className="text-indigo-600 font-black text-xs group-hover:translate-x-1 transition-transform">Åpne →</span></div>
              <button className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 text-rose-400 p-2" onClick={(e) => { e.stopPropagation(); deleteProject(p.id).then(() => setActiveProject(null)); }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
        <button onClick={() => setView('dashboard')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">← Oversikt</button>
        <div className="flex gap-2">{steps.map(s => (<button key={s.id} onClick={() => { setCurrentStep(s.id as any); if (s.id === 'review' && filteredCandidates.length > 0 && !selectedReviewCandidateId) setSelectedReviewCandidateId(filteredCandidates[0].id); }} className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${currentStep === s.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>{s.icon} {s.label}</button>))}</div>
        <div className="w-20"></div>
      </header>

      {(rubricStatus.loading || processingCount > 0) && (
        <div className="bg-indigo-600 text-white py-2 text-center text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center justify-center gap-3">
          <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
          {processingCount > 0 ? `Prosesserer ${processingCount} sider i bakgrunnen...` : rubricStatus.text}
          <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {activeProject && (
          <>
            {currentStep === 'setup' && (
              <SetupStep 
                activeProject={activeProject}
                isProcessing={processingCount > 0}
                rubricStatus={rubricStatus}
                handleTaskFileSelect={handleTaskFileSelect}
                handleGenerateRubric={handleGenerateRubric}
                handleCandidateFileSelect={handleCandidateFileSelect}
                updateActiveProject={updateActiveProject}
              />
            )}

            {currentStep === 'review' && (
              <ReviewStep 
                activeProject={activeProject}
                selectedReviewCandidateId={selectedReviewCandidateId}
                setSelectedReviewCandidateId={setSelectedReviewCandidateId}
                reviewFilter={reviewFilter}
                setReviewFilter={setReviewFilter}
                filteredCandidates={filteredCandidates}
                currentReviewCandidate={currentReviewCandidate}
                rotatePage={rotatePage}
                setActiveProject={setActiveProject}
              />
            )}

            {currentStep === 'rubric' && (
              <RubricStep 
                activeProject={activeProject}
                handleEvaluateAll={handleEvaluateAll}
                rubricStatus={rubricStatus}
              />
            )}

            {currentStep === 'results' && (
              <ResultsStep 
                activeProject={activeProject}
                selectedResultCandidateId={selectedResultCandidateId}
                setSelectedResultCandidateId={setSelectedResultCandidateId}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
