
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Page, Candidate, Rubric, Project, TaskEvaluation, CandidateHierarchy, CommonError, RubricCriterion } from './types';
import { transcribeAndAnalyzeImage, generateRubricFromTaskAndSamples, evaluateCandidate } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject, getFromGlobalCache, saveToGlobalCache, getCacheStats, clearGlobalCache } from './services/storageService';

// Konsistent hashing er kritisk for å beholde cachen mellom oppdateringer.
// Ved å bruke Math.abs sikrer vi at nøklene i IndexedDB forblir stabile.
const generateHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
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

const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const Modal: React.FC<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
        <h3 className="text-xl font-black mb-4">{title}</h3>
        <p className="text-slate-500 text-sm mb-10 leading-relaxed">{message}</p>
        <div className="flex gap-4">
          <button onClick={onCancel} className="flex-1 px-6 py-4 rounded-2xl bg-slate-50 text-slate-400 font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-colors">Avbryt</button>
          <button onClick={onConfirm} className="flex-1 px-6 py-4 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-colors">Bekreft</button>
        </div>
      </div>
    </div>
  );
};

const SettingsModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  cacheCount: number; 
  onClearCache: () => void;
}> = ({ isOpen, onClose, cacheCount, onClearCache }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[2000] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-300">
        <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Innstillinger & System</h2>
            <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mt-1">Konfigurasjon og personvern</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-white border shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
          <section className="space-y-6">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Lokal bilde-cache</h3>
            <div className="bg-indigo-50/50 rounded-3xl p-8 border border-indigo-100 flex items-center justify-between">
              <div>
                <p className="text-slate-700 font-bold">Lagrede transkripsjoner: <span className="text-indigo-600 font-black">{cacheCount}</span></p>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed max-w-sm">Disse dataene lagres kun lokalt i din nettleser.</p>
              </div>
              <button onClick={onClearCache} className="bg-white border border-indigo-100 text-[10px] font-black uppercase text-indigo-600 px-6 py-3 rounded-2xl hover:bg-indigo-100 transition-colors shadow-sm">Tøm cache 🗑️</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && (window as any).MathJax) {
      const timeout = setTimeout(() => {
        (window as any).MathJax.typesetPromise([containerRef.current]).catch((err: any) => console.warn("MathJax error:", err));
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [content]);

  return (
    <div 
      ref={containerRef} 
      className={`whitespace-pre-wrap leading-relaxed prose prose-slate max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br/>') }}
    />
  );
};

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [currentStep, setCurrentStep] = useState<'setup' | 'review' | 'rubric' | 'results'>('setup');
  // Endret standardvisning og rekkefølge i tråd med brukerønske
  const [resultsSubView, setResultsSubView] = useState<'group' | 'heatmap' | 'individual'>('group');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [reviewCandidateId, setReviewCandidateId] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<{ type: string | null; current: number; total: number; statusText: string }>({ type: null, current: 0, total: 0, statusText: '' });
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
  const [editingCriterionIndex, setEditingCriterionIndex] = useState<number | null>(null);
  const [isEditingSolution, setIsEditingSolution] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [cacheCount, setCacheCount] = useState<number>(0);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { 
    if (view === 'dashboard') {
      loadAllProjects();
      updateCacheStats();
    }
  }, [view]);

  const updateCacheStats = async () => {
    const stats = await getCacheStats();
    setCacheCount(stats.count);
  };

  const loadAllProjects = async () => {
    const all = await getAllProjects();
    setProjects(all.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const updateActiveProject = async (updates: Partial<Project>) => {
    setActiveProject(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates, updatedAt: Date.now() };
      saveProject(updated).catch(err => console.error("Error saving project:", err));
      return updated;
    });
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    let allNewPages: Page[] = [];
    for (const file of Array.from(files)) {
      const split = await splitA3IfNecessary(file);
      allNewPages = [...allNewPages, ...split];
    }
    // Viser spinner ved å sette rubricStatus til loading umiddelbart
    setRubricStatus({ loading: true, text: 'Analyserer oppgavefiler...' });
    const updatedTaskFiles = [...(activeProject.taskFiles || []), ...allNewPages];
    updateActiveProject({ taskFiles: updatedTaskFiles });
    try {
        await handleGenerateRubric(updatedTaskFiles);
    } catch (err) {
        console.error("Oppgaveanalyse feilet:", err);
    } finally {
        setRubricStatus({ loading: false, text: '' });
    }
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const existingHashes = new Set([
      ...(activeProject.candidates.flatMap(c => c.pages.map(p => p.contentHash))),
      ...(activeProject.unprocessedPages?.map(p => p.contentHash) || [])
    ]);
    let allNewFiles: File[] = Array.from(files);
    let processedPages: Page[] = [];
    for (const file of allNewFiles) {
      const split = await splitA3IfNecessary(file);
      const uniqueSplit = split.filter(p => !existingHashes.has(p.contentHash));
      processedPages = [...processedPages, ...uniqueSplit];
    }
    const pagesWithCacheStatus = await Promise.all(processedPages.map(async p => {
      const cachedData = await getFromGlobalCache(p.contentHash);
      return cachedData ? { ...p, status: 'completed' as const, transcription: cachedData[0]?.fullText || "", part: cachedData[0]?.part, isCached: true } : p;
    }));
    const updatedUnprocessed = [...(activeProject.unprocessedPages || []), ...pagesWithCacheStatus];
    setActiveProject(prev => { if (!prev) return null; return { ...prev, unprocessedPages: updatedUnprocessed }; });
    const needsProcessing = pagesWithCacheStatus.filter(p => !p.isCached);
    if (needsProcessing.length > 0) startProcessingQueue(needsProcessing);
    pagesWithCacheStatus.filter(p => p.isCached).forEach(async p => {
        const cachedData = await getFromGlobalCache(p.contentHash);
        integrateResultsIntoActiveProject(p, cachedData);
    });
    updateCacheStats();
  };

  const integrateResultsIntoActiveProject = (page: Page, results: any) => {
    setActiveProject(prev => {
      if (!prev) return null;
      let currentCandidates = [...(prev.candidates || [])];
      const resultsArray = Array.isArray(results) ? results : [results];
      resultsArray.forEach((res: any) => {
        const cId = res.candidateId || "Ukjent";
        let cand = currentCandidates.find(c => c.id === cId);
        const newPage: Page = { ...page, id: Math.random().toString(36).substring(7), candidateId: cId, part: res.part, pageNumber: res.pageNumber, transcription: res.fullText, identifiedTasks: res.tasks?.map((t: any) => t.taskNum) || [], status: 'completed' as const };
        if (!cand) {
          cand = { id: cId, name: `Kandidat ${cId}`, status: 'completed', pages: [newPage], structuredAnswers: { parts: {} } };
          currentCandidates.push(cand);
        } else if (!cand.pages.some(existingP => existingP.contentHash === page.contentHash)) {
            cand.pages = [...cand.pages, newPage].sort((a,b) => (a.part||"").localeCompare(b.part||"") || (a.pageNumber||0)-(b.pageNumber||0));
        }
        if (cand && !cand.structuredAnswers) cand.structuredAnswers = { parts: {} };
        res.tasks?.forEach((t: any) => {
          const partName = res.part || "Generell";
          if (cand && cand.structuredAnswers) {
            if (!cand.structuredAnswers.parts[partName]) cand.structuredAnswers.parts[partName] = {};
            if (!cand.structuredAnswers.parts[partName][t.taskNum]) cand.structuredAnswers.parts[partName][t.taskNum] = { subtasks: {} };
            cand.structuredAnswers.parts[partName][t.taskNum].subtasks[t.subTask || 'default'] = t.text;
          }
        });
      });
      const newUnprocessed = prev.unprocessedPages?.filter(p => p.id !== page.id) || [];
      const updated = { ...prev, candidates: currentCandidates, unprocessedPages: newUnprocessed, updatedAt: Date.now() };
      saveProject(updated);
      return updated;
    });
  };

  const startProcessingQueue = async (pagesToProcess: Page[]) => {
    const queue = [...pagesToProcess];
    const processItem = async () => {
      if (queue.length === 0) return;
      const page = queue.shift()!;
      setActiveProject(prev => ({ ...prev!, unprocessedPages: prev!.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'processing' } : p) }));
      try {
        const results = await transcribeAndAnalyzeImage(page);
        await saveToGlobalCache(page.contentHash, results);
        integrateResultsIntoActiveProject(page, results);
        updateCacheStats();
      } catch (err) {
        setActiveProject(prev => ({ ...prev!, unprocessedPages: prev!.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'error' } : p) }));
      }
      await processItem();
    };
    await Promise.all([processItem(), processItem()]);
  };

  const handleGenerateRubric = async (files?: Page[]) => {
    const targetFiles = files || activeProject?.taskFiles;
    if (!activeProject || !targetFiles || targetFiles.length === 0) return;
    setRubricStatus({ loading: true, text: 'Oppdaterer rettemanual...' });
    try {
      const samples = activeProject.candidates.slice(0, 5).map(c => c.pages.map(p => p.transcription).join("\n"));
      const newRubric = await generateRubricFromTaskAndSamples(targetFiles, activeProject.taskDescription, samples);
      updateActiveProject({ rubric: newRubric });
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const performEvaluation = async () => {
    if (!activeProject?.rubric) return;
    const targets = activeProject.candidates.filter(c => c.status !== 'evaluated');
    setProcessStatus({ type: 'Vurdering', current: 0, total: targets.length, statusText: 'Starter...' });
    for (let i = 0; i < targets.length; i++) {
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Vurderer ${targets[i].name}...` }));
      const evalRes = await evaluateCandidate(targets[i], activeProject.rubric!, activeProject.taskDescription);
      updateActiveProject({ candidates: activeProject.candidates.map(c => c.id === targets[i].id ? { ...c, evaluation: evalRes, status: 'evaluated' } : c) });
    }
    setProcessStatus({ type: null, current: 0, total: 0, statusText: '' });
  };

  const groupedCriteria = useMemo(() => {
    if (!activeProject?.rubric) return {};
    return activeProject.rubric.criteria.reduce((acc: Record<string, RubricCriterion[]>, curr) => {
      const part = curr.part || "Generell";
      if (!acc[part]) acc[part] = [];
      acc[part].push(curr);
      return acc;
    }, {});
  }, [activeProject?.rubric]);

  const stats = useMemo(() => {
    if (!activeProject) return null;
    const evaluated = activeProject.candidates.filter(c => c.status === 'evaluated');
    if (evaluated.length === 0) return null;
    const taskStats: any = {};
    const candidateTasks: any = {};
    evaluated.forEach(c => {
      candidateTasks[c.id] = {};
      c.evaluation?.taskBreakdown.forEach(t => {
        const key = `${t.part}: ${t.taskName}`;
        if (!taskStats[key]) taskStats[key] = { total: 0, max: 0, count: 0, part: t.part };
        taskStats[key].total += t.score;
        taskStats[key].max += t.max;
        taskStats[key].count++;
        candidateTasks[c.id][key] = t.score;
      });
    });
    return { taskStats, allTaskNames: Object.keys(taskStats).sort(), candidateTasks, avgScore: evaluated.reduce((acc, c) => acc + (c.evaluation?.score || 0), 0) / evaluated.length };
  }, [activeProject]);

  const splitA3IfNecessary = async (file: File): Promise<Page[]> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Full = e.target?.result as string;
        const base64Data = base64Full.split(',')[1];
        const contentHash = generateHash(base64Data.substring(0, 5000)); 
        if (!file.type.startsWith('image/')) {
          resolve([{ id: Math.random().toString(36).substring(7), fileName: file.name, imagePreview: '', base64Data, contentHash, mimeType: file.type, status: 'pending' }]);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const aspect = img.width / img.height;
          if (aspect > 1.3) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve([]);
            canvas.width = img.width / 2; canvas.height = img.height;
            ctx.drawImage(img, 0, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
            const left = canvas.toDataURL('image/jpeg', 0.85);
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
            const right = canvas.toDataURL('image/jpeg', 0.85);
            resolve([
              { id: Math.random().toString(36).substring(7), fileName: `${file.name} (Del 1)`, imagePreview: left, base64Data: left.split(',')[1], contentHash: generateHash(left.substring(50, 1000)), mimeType: 'image/jpeg', status: 'pending' },
              { id: Math.random().toString(36).substring(7), fileName: `${file.name} (Del 2)`, imagePreview: right, base64Data: right.split(',')[1], contentHash: generateHash(right.substring(50, 1000)), mimeType: 'image/jpeg', status: 'pending' }
            ]);
          } else {
            resolve([{ id: Math.random().toString(36).substring(7), fileName: file.name, imagePreview: base64Full, base64Data, contentHash, mimeType: file.type, status: 'pending' }]);
          }
        };
        img.src = base64Full;
      };
      reader.readAsDataURL(file);
    });
  };

  if (view === 'dashboard') {
    return (
      <div className="p-10 max-w-6xl mx-auto">
        <header className="flex justify-between items-start mb-16">
          <div><h1 className="text-4xl font-black text-slate-900">Vurderingsportal</h1><p className="text-slate-400 font-bold text-xs uppercase mt-2">Dine prosjekter</p></div>
          <div className="flex gap-4">
            <button onClick={() => setShowSettings(true)} className="w-14 h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
            <button onClick={() => { setView('editor'); setCurrentStep('setup'); setActiveProject({ id: Math.random().toString(36).substring(7), name: `Ny vurdering ${new Date().toLocaleDateString()}`, createdAt: Date.now(), updatedAt: Date.now(), taskDescription: '', taskFiles: [], candidates: [], unprocessedPages: [], rubric: null, status: 'draft' }); }} className="bg-indigo-600 text-white px-8 py-4 rounded-[20px] font-black shadow-xl hover:bg-indigo-700 transition-all text-sm">Ny vurdering</button>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">{projects.map(p => (<div key={p.id} onClick={() => { setActiveProject(p); setView('editor'); }} className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-100 cursor-pointer hover:border-indigo-400 hover:shadow-2xl transition-all"><h3 className="font-black text-xl text-slate-800 mb-2">{p.name}</h3><p className="text-[10px] font-bold text-slate-400 uppercase">{p.candidates.length} kandidater</p></div>))}</div>
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} cacheCount={cacheCount} onClearCache={() => {}} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
        <button onClick={() => setView('dashboard')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">← Oversikt</button>
        <div className="flex gap-2">{steps.map(s => (<button key={s.id} onClick={() => setCurrentStep(s.id as any)} className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${currentStep === s.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>{s.icon} {s.label}</button>))}</div>
        <button onClick={() => setConfirmModal({ isOpen: true, title: "Slette?", message: "Vil du slette dette prosjektet?", onConfirm: async () => { await deleteProject(activeProject!.id); setView('dashboard'); setConfirmModal(null); } })} className="text-[10px] font-black text-rose-300 uppercase">Slett ✕</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        {currentStep === 'setup' && (
          <div className="p-10 max-w-5xl mx-auto space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100">
                <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-[0.2em] mb-8">1. Oppgave / Fasit</h3>
                <input type="file" multiple onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:bg-indigo-50 file:text-indigo-700 file:border-0 hover:file:bg-indigo-100" />
                <div className="mt-6 space-y-2">
                  {activeProject?.taskFiles.map(f => (
                    <div key={f.id} className="text-[10px] font-bold bg-slate-50 p-3 rounded-xl border flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {rubricStatus.loading && <Spinner />}
                        {f.fileName}
                      </div>
                      <button onClick={() => updateActiveProject({ taskFiles: activeProject!.taskFiles.filter(i => i.id !== f.id) })}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100">
                <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-[0.2em] mb-8">2. Elevbesvarelser</h3>
                <input type="file" multiple onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:bg-emerald-50 file:text-emerald-700 file:border-0 hover:file:bg-emerald-100" />
                <div className="mt-6 space-y-2">{activeProject?.unprocessedPages?.map(p => (<div key={p.id} className="text-[10px] font-bold bg-slate-50 p-3 rounded-xl border flex justify-between">{p.status === 'processing' ? <Spinner /> : p.fileName} {p.isCached && '⚡'}</div>))}</div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="flex h-full">
            <aside className="w-80 bg-white border-r overflow-y-auto p-6 sticky top-0 h-[calc(100vh-64px)] custom-scrollbar">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Kandidater & Oppgaver</h4>
              <div className="space-y-4">
                <button onClick={() => setReviewCandidateId(null)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${!reviewCandidateId ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>Alle ({activeProject?.candidates.length})</button>
                {activeProject?.candidates.map(c => (
                  <button key={c.id} onClick={() => setReviewCandidateId(c.id)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex flex-col items-start gap-2 border ${reviewCandidateId === c.id ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 border-transparent'}`}>
                    <div className="flex justify-between w-full"><span>{c.name || c.id}</span> <span className="text-[9px] opacity-70">{c.pages.length} s.</span></div>
                    <div className="flex flex-wrap gap-1">
                        {Object.entries(c.structuredAnswers?.parts || {}).map(([part, tasks]) => (
                            <div key={part} className="flex flex-wrap gap-1 border-t border-white/20 pt-1 w-full">
                                <span className="text-[8px] font-black uppercase opacity-60 w-full">{part}</span>
                                {Object.keys(tasks).map(t => (
                                    <span key={t} className={`px-1.5 py-0.5 rounded text-[8px] font-black ${reviewCandidateId === c.id ? 'bg-white/20' : 'bg-slate-100'}`}>Oppg {t}</span>
                                ))}
                            </div>
                        ))}
                    </div>
                  </button>
                ))}
              </div>
            </aside>
            <div className="flex-1 p-10 max-w-5xl mx-auto space-y-12">
                {(reviewCandidateId ? activeProject?.candidates.filter(c => c.id === reviewCandidateId) : activeProject?.candidates)?.map(c => (
                  <div key={c.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden mb-12">
                    <div className="px-10 py-6 bg-slate-50 border-b flex justify-between items-center">
                        <input type="text" value={c.name} onChange={(e) => updateActiveProject({ candidates: activeProject!.candidates.map(cand => cand.id === c.id ? { ...cand, name: e.target.value } : cand) })} className="bg-transparent font-black text-xl text-slate-800 border-none outline-none focus:ring-0" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {c.id}</span>
                    </div>
                    <div className="divide-y border-slate-100">
                      {c.pages.map(p => (
                           <div key={p.id} className="flex flex-col h-[600px] border-t border-slate-50 overflow-hidden">
                              <div className="h-[300px] bg-slate-900 flex items-center justify-center p-4 relative shrink-0">
                                 <img src={p.imagePreview} className="max-h-full max-w-full object-contain" />
                                 <div className="absolute top-4 left-4 bg-black/60 text-white text-[9px] font-black px-3 py-1.5 rounded-xl uppercase">{p.part || 'Ukjent Del'} • Side {p.pageNumber}</div>
                              </div>
                              <div className="flex-1 flex overflow-hidden">
                                <div className="w-1/2 p-6 border-r flex flex-col">
                                  <label className="text-[9px] font-black uppercase text-slate-400 mb-2">Transkribert tekst</label>
                                  <textarea 
                                    value={p.transcription} 
                                    onChange={e => updateActiveProject({ candidates: activeProject!.candidates.map(cand => cand.id === c.id ? { ...cand, pages: cand.pages.map(page => page.id === p.id ? { ...page, transcription: e.target.value } : page) } : cand) })} 
                                    className="w-full flex-1 bg-slate-50 rounded-2xl p-4 text-[11px] font-mono leading-relaxed border-none outline-none custom-scrollbar resize-none" 
                                  />
                                </div>
                                <div className="w-1/2 p-6 overflow-y-auto bg-white flex flex-col">
                                  <label className="text-[9px] font-black uppercase text-indigo-400 mb-2">Forhåndsvisning (LaTeX)</label>
                                  <div className="flex-1 p-2">
                                    <LatexRenderer content={p.transcription || ""} className="text-xs" />
                                  </div>
                                </div>
                              </div>
                           </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {currentStep === 'rubric' && (
          <div className="p-4 md:p-10 max-w-6xl mx-auto no-print space-y-12">
            {rubricStatus.loading ? (
              <div className="bg-white p-20 rounded-[60px] shadow-sm border border-slate-100 text-center">
                <div className="flex justify-center mb-8"><Spinner size="w-12 h-12" /></div>
                <p className="text-slate-400 font-black italic uppercase tracking-widest text-xs">{rubricStatus.text}</p>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="flex justify-between items-end">
                   <div>
                     <h2 className="text-4xl font-black text-slate-900 tracking-tight">Rettemanual</h2>
                     <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mt-3">Totalt {activeProject?.rubric?.totalMaxPoints || 0} poeng</p>
                   </div>
                   <button onClick={() => handleGenerateRubric()} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Regenerer 🔄</button>
                </div>

                {Object.entries(groupedCriteria).map(([partName, criteria]) => (
                  <section key={partName} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <h3 className="text-xl font-black text-slate-800 shrink-0">{partName}</h3>
                      <div className="h-0.5 flex-1 bg-slate-200/50 rounded-full" />
                    </div>
                    
                    <div className="bg-white border border-slate-100 rounded-[35px] overflow-hidden shadow-sm">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50/50 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                          <tr>
                            <th className="px-8 py-4 w-1/4">Oppgave</th>
                            <th className="px-8 py-4">Kriterie / Tema</th>
                            <th className="px-8 py-4 text-right w-32">Maks Poeng</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs">
                          {criteria.map((c, idx) => {
                            const originalIndex = activeProject!.rubric!.criteria.findIndex(oc => oc === c);
                            const isExpanded = editingCriterionIndex === originalIndex;
                            return (
                              <React.Fragment key={idx}>
                                <tr 
                                  className={`border-t border-slate-50 cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}
                                  onClick={() => {
                                    setEditingCriterionIndex(isExpanded ? null : originalIndex);
                                    setIsEditingSolution(false);
                                  }}
                                >
                                  <td className="px-8 py-5 font-black text-slate-800">{c.name}</td>
                                  <td className="px-8 py-5 font-bold text-slate-500 uppercase tracking-tight">{c.tema}</td>
                                  <td className="px-8 py-5 text-right font-black text-indigo-600 text-lg">{c.maxPoints}</td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={3} className="px-8 py-8 bg-white border-t border-slate-100">
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in duration-300">
                                        <div className="space-y-6">
                                          <div className="flex justify-between items-center">
                                            <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Løsningsforslag (Fasit)</h5>
                                            <button 
                                              onClick={(e) => { e.stopPropagation(); setIsEditingSolution(!isEditingSolution); }}
                                              className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all ${isEditingSolution ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                            >
                                              {isEditingSolution ? 'Lagre ✓' : 'Rediger ✎'}
                                            </button>
                                          </div>
                                          {isEditingSolution ? (
                                            <div className="space-y-4">
                                              <textarea 
                                                className="w-full h-48 bg-slate-50 border-2 border-indigo-100 rounded-[25px] p-6 text-[11px] font-mono leading-relaxed outline-none custom-scrollbar resize-none"
                                                value={c.suggestedSolution}
                                                onChange={e => {
                                                  const nc = [...activeProject!.rubric!.criteria];
                                                  nc[originalIndex].suggestedSolution = e.target.value;
                                                  updateActiveProject({ rubric: { ...activeProject!.rubric!, criteria: nc } });
                                                }}
                                              />
                                              <div className="p-6 bg-indigo-50/30 rounded-[25px] border border-indigo-100/50">
                                                <label className="text-[8px] font-black uppercase text-indigo-400 mb-2 block tracking-widest">Forhåndsvisning</label>
                                                <LatexRenderer content={c.suggestedSolution} className="text-xs" />
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="p-8 bg-slate-50/50 rounded-[35px] border border-slate-100 min-h-[150px]">
                                              <LatexRenderer content={c.suggestedSolution} className="text-xs" />
                                            </div>
                                          )}
                                        </div>

                                        <div className="space-y-8">
                                          <div className="space-y-6">
                                            <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Vurderingsguide</h5>
                                            <div className="bg-white p-8 rounded-[35px] border border-slate-100 shadow-sm space-y-6">
                                              <div className="text-sm font-bold text-slate-700 italic border-l-4 border-indigo-200 pl-6">
                                                <LatexRenderer content={c.description} />
                                              </div>
                                              <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Maks Poeng</span>
                                                <input 
                                                  type="number" 
                                                  className="w-20 text-center font-black text-indigo-600 bg-indigo-50 rounded-xl py-2 outline-none border-2 border-transparent focus:border-indigo-200 transition-all"
                                                  value={c.maxPoints}
                                                  onChange={e => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    const nc = [...activeProject!.rubric!.criteria];
                                                    nc[originalIndex].maxPoints = val;
                                                    updateActiveProject({ rubric: { ...activeProject!.rubric!, criteria: nc } });
                                                  }}
                                                />
                                              </div>
                                            </div>
                                          </div>

                                          {c.commonErrors && c.commonErrors.length > 0 && (
                                            <div className="space-y-4">
                                              <h5 className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Vanlige Feilkilder</h5>
                                              <div className="bg-rose-50/20 rounded-[35px] border border-rose-100 p-8 space-y-4">
                                                {c.commonErrors.map((err, eIdx) => (
                                                  <div key={eIdx} className="flex justify-between items-start gap-4">
                                                    <div className="flex gap-3">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-300 mt-2 shrink-0" />
                                                      <p className="text-xs font-bold text-rose-800 leading-relaxed"><LatexRenderer content={err.error} /></p>
                                                    </div>
                                                    <span className="font-black text-rose-500 text-xs shrink-0 whitespace-nowrap">-{err.deduction}p</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {currentStep === 'results' && (
          <div className="p-10 max-w-6xl mx-auto space-y-10">
            <div className="flex justify-between items-center no-print">
               <div className="flex bg-white p-1 rounded-2xl border shadow-sm">
                  {/* Oppdatert navn og rekkefølge: Oppsummering, Tabell, Individuell */}
                  <button onClick={() => setResultsSubView('group')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${resultsSubView === 'group' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Oppsummering</button>
                  <button onClick={() => setResultsSubView('heatmap')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${resultsSubView === 'heatmap' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Tabell</button>
                  <button onClick={() => setResultsSubView('individual')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${resultsSubView === 'individual' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Individuell</button>
               </div>
               <div className="flex gap-4">
                  {resultsSubView === 'individual' && activeProject?.candidates.length! > 0 && (
                    <select className="bg-white border rounded-2xl px-6 py-3 text-sm font-black shadow-sm outline-none" value={selectedCandidateId || ''} onChange={e => setSelectedCandidateId(e.target.value)}>
                       <option value="">Velg kandidat</option>
                       {activeProject?.candidates.map(c => <option key={c.id} value={c.id}>{c.name || `ID: ${c.id}`}</option>)}
                    </select>
                  )}
                  <button onClick={performEvaluation} className="bg-white border-2 border-indigo-100 px-8 py-3 rounded-2xl text-[10px] font-black uppercase shadow-sm hover:bg-indigo-50 text-indigo-600 transition-all">🤖 Kjør Vurdering</button>
               </div>
            </div>

            {resultsSubView === 'group' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 <div className="bg-white p-10 rounded-[40px] border shadow-sm"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Gjennomsnitt poeng</h4><p className="text-4xl font-black text-indigo-600">{stats.avgScore.toFixed(1)} <span className="text-sm text-slate-300">/ {activeProject?.rubric?.totalMaxPoints}</span></p></div>
                 <div className="bg-white p-10 rounded-[40px] border shadow-sm"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Vurderte elever</h4><p className="text-4xl font-black text-indigo-600">{activeProject?.candidates.filter(c => c.status === 'evaluated').length} <span className="text-sm text-slate-300">av {activeProject?.candidates.length}</span></p></div>
                 <div className="bg-white p-10 rounded-[40px] border shadow-sm"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Beste oppgave</h4><p className="text-lg font-black text-emerald-600 line-clamp-1">{Object.entries(stats.taskStats).sort((a: any, b: any) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0]?.[0] || '-'}</p></div>
              </div>
            )}

            {resultsSubView === 'heatmap' && stats && (
              <div className="bg-white p-12 rounded-[50px] border shadow-sm overflow-x-auto">
                <h3 className="text-xl font-black mb-10">Poengoversikt (Tabell)</h3>
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 font-black text-[10px] uppercase text-slate-400 sticky left-0 bg-slate-50 z-10">Navn / ID</th>
                      {stats.allTaskNames.map(tn => (<th key={tn} className="px-3 py-4 font-black text-[10px] uppercase text-slate-400 text-center tracking-tighter">{tn}</th>))}
                      <th className="px-6 py-4 font-black text-[10px] uppercase text-indigo-600 text-right">Sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProject?.candidates.map(c => (
                      <tr key={c.id} className="border-b border-slate-50 group hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-black text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10">{c.name || c.id}</td>
                        {stats.allTaskNames.map(tn => {
                          const score = stats.candidateTasks[c.id]?.[tn];
                          const max = stats.taskStats[tn].max / stats.taskStats[tn].count;
                          const pct = score !== undefined ? score / max : null;
                          let colorClass = "bg-slate-50 text-slate-200";
                          if (pct === 1) colorClass = "bg-emerald-50 text-emerald-600";
                          else if (pct !== null && pct > 0.5) colorClass = "bg-amber-50 text-amber-600";
                          else if (pct !== null && pct > 0) colorClass = "bg-orange-50 text-orange-600";
                          else if (pct !== null) colorClass = "bg-rose-50 text-rose-600";
                          return <td key={tn} className={`px-2 py-4 text-center font-bold text-xs transition-colors ${colorClass}`}>{score !== undefined ? score.toLocaleString('no-NO') : '-'}</td>;
                        })}
                        <td className="px-6 py-4 text-right font-black text-indigo-700">{c.evaluation?.score || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {resultsSubView === 'individual' && selectedCandidateId && activeProject?.candidates.find(c => c.id === selectedCandidateId)?.evaluation && (
                <div className="animate-in fade-in slide-in-from-right-6 duration-700">
                   <div className="bg-white p-16 md:p-24 rounded-[70px] border shadow-sm relative overflow-hidden">
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10 mb-24">
                          <div>
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Elevvurdering</h4>
                             <h2 className="text-5xl font-black text-slate-900 leading-tight">{activeProject.candidates.find(c => c.id === selectedCandidateId)?.name || `Kandidat ${selectedCandidateId}`}</h2>
                             <div className="mt-6 flex items-center gap-3"><span className="bg-indigo-600 text-white px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100">Karakter {activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.grade}</span></div>
                          </div>
                          <div className="text-right"><div className="text-[120px] font-black text-indigo-700 leading-none tracking-tighter">{activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.score.toLocaleString('no-NO')}<span className="text-3xl text-slate-200 ml-4 font-normal">/ {activeProject.rubric?.totalMaxPoints}</span></div></div>
                       </div>
                       <div className="border-l-4 border-indigo-600 pl-10 py-1"><h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-6">Tilbakemelding</h4><div className="text-2xl font-medium text-slate-700 leading-relaxed italic pr-4"><LatexRenderer content={activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.feedback || ''} /></div></div>
                   </div>
                </div>
            )}
          </div>
        )}
      </main>

      {processStatus.type && (<div className="fixed bottom-12 right-12 bg-slate-900 text-white p-10 rounded-[45px] shadow-2xl flex items-center gap-10 z-[100] animate-in slide-in-from-right-12"><Spinner color="text-indigo-400" /><div className="flex flex-col"><span className="text-[10px] font-black uppercase text-indigo-400 mb-1">{processStatus.type}</span><span className="text-base font-bold text-slate-200">{processStatus.statusText}</span></div></div>)}
      <Modal isOpen={!!confirmModal} {...(confirmModal || { title: "", message: "", onConfirm: () => {}, onCancel: () => {} })} onCancel={() => setConfirmModal(null)} />
    </div>
  );
};

export default App;
