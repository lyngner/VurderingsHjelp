
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Page, Candidate, Rubric, Project, TaskEvaluation, CandidateHierarchy, CommonError, RubricCriterion } from './types';
import { transcribeAndAnalyzeImage, generateRubricFromTaskAndSamples, evaluateCandidate, analyzeTextContent } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject, getCacheStats, clearGlobalCache } from './services/storageService';
import mammoth from 'mammoth';
import JSZip from 'jszip';

if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[3000] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-10 space-y-8 animate-in zoom-in-95 duration-200">
        <div className="text-center space-y-4">
          <h3 className="text-2xl font-black text-slate-800">{title}</h3>
          <p className="text-slate-500 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-4">
          <button onClick={onCancel} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors">Avbryt</button>
          <button onClick={onConfirm} className="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100">Bekreft</button>
        </div>
      </div>
    </div>
  );
};

const TaskAnalysisChart: React.FC<{ project: Project }> = ({ project }) => {
  const analysisData = useMemo(() => {
    if (!project.rubric || project.candidates.length === 0) return [];
    const evaluated = project.candidates.filter(c => c.status === 'evaluated');
    if (evaluated.length === 0) return [];

    return project.rubric.criteria.map(crit => {
      let totalScore = 0;
      let count = 0;
      evaluated.forEach(cand => {
        const task = cand.evaluation?.taskBreakdown.find(t => t.taskName === crit.name);
        if (task) {
          totalScore += (task.score / task.max) * 100;
          count++;
        }
      });
      return {
        name: crit.name,
        percentage: count > 0 ? Math.round(totalScore / count) : 0
      };
    });
  }, [project]);

  if (analysisData.length === 0) return null;

  return (
    <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm mt-8 animate-in fade-in slide-in-from-bottom duration-500">
      <h3 className="text-xl font-black text-slate-800 mb-8">Oppgaveanalyse (%)</h3>
      <div className="relative h-80 flex items-end gap-3 border-b-2 border-slate-100 pb-2 overflow-x-auto custom-scrollbar">
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] font-black text-slate-300 pointer-events-none pr-4">
          <span>100</span><span>80</span><span>60</span><span>40</span><span>20</span><span>0</span>
        </div>
        <div className="absolute inset-0 pl-10 pointer-events-none flex flex-col justify-between py-1">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="w-full h-px bg-slate-50" />)}
        </div>
        <div className="flex-1 flex items-end justify-around pl-10 min-w-[600px] h-full">
          {analysisData.map((data, i) => (
            <div key={i} className="flex flex-col items-center group relative flex-1 h-full justify-end">
              <div 
                className={`w-full max-w-[48px] rounded-t-xl transition-all duration-700 ease-out ${data.percentage < 70 ? 'bg-amber-400' : 'bg-[#2dd4bf]'} group-hover:brightness-95 group-hover:-translate-y-1 cursor-help shadow-lg`}
                style={{ height: `${data.percentage}%` }}
              >
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-10 shadow-xl">
                  {data.percentage}% Snitt
                </div>
              </div>
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 rotate-45 origin-left text-[11px] font-black text-slate-400 whitespace-nowrap group-hover:text-indigo-600 transition-colors">
                {data.name}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="h-16"></div> 
    </div>
  );
};

const getHeatmapColor = (score: number, max: number) => {
  const ratio = score / max;
  if (ratio >= 0.85) return 'bg-emerald-100 text-emerald-700';
  if (ratio >= 0.7) return 'bg-teal-50 text-teal-600';
  if (ratio >= 0.5) return 'bg-amber-50 text-amber-600';
  if (ratio >= 0.3) return 'bg-orange-50 text-orange-600';
  return 'bg-rose-50 text-rose-600';
};

const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const processedHtml = useMemo(() => {
    if (!content) return "";
    return content.split('\n').map(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return "<br/>";
      const hasMath = /[=^+\-*/]|ln|lg|log|lim|sin|cos|tan|\\|\[|\]|root|int|[0-9][a-z]/i.test(trimmedLine);
      if (hasMath) {
        let cleanLine = trimmedLine.replace(/\$/g, "");
        cleanLine = cleanLine
          .replace(/=>/g, '\\Rightarrow ')
          .replace(/->/g, '\\to ')
          .replace(/\*/g, '\\cdot ')
          .replace(/\^(\d+)/g, '^{$1}')
          .replace(/lim\s+([a-z])\s*->\s*(-?\d+|inf)/gi, '\\lim_{$1 \\to $2}');
        const prefixMatch = cleanLine.match(/^(\s*[0-9a-zA-Z]+\s*[).]\s*)(.*)$/);
        if (prefixMatch) return `<div>${prefixMatch[1]}<span class="math-inline">$${prefixMatch[2]}$</span></div>`;
        return `<div><span class="math-inline">$${cleanLine}$</span></div>`;
      }
      return `<div>${line}</div>`;
    }).join('');
  }, [content]);

  useEffect(() => {
    if (containerRef.current && (window as any).MathJax) {
      setTimeout(() => { (window as any).MathJax.typesetPromise([containerRef.current]).catch(() => {}); }, 50);
    }
  }, [processedHtml]);

  return <div ref={containerRef} className={`leading-relaxed prose prose-slate max-w-none break-words ${className}`} dangerouslySetInnerHTML={{ __html: processedHtml }} />;
};

const PageDetailView: React.FC<{ page: Page; onClose: () => void; onUpdate: (updates: Partial<Page>) => void }> = ({ page, onClose, onUpdate }) => {
  return (
    <div className="fixed inset-0 bg-white z-[2000] flex flex-col animate-in slide-in-from-bottom duration-300">
      <header className="h-16 border-b flex items-center justify-between px-8 shrink-0 bg-white">
        <div className="flex items-center gap-4">
           <span className="bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Kandidat {page.candidateId}</span>
           <h2 className="font-black text-slate-800">Side {page.pageNumber}</h2>
        </div>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors font-black">✕</button>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 bg-slate-50 flex items-center justify-center p-8 border-r overflow-hidden">
            <div style={{ transform: `rotate(${page.rotation || 0}deg) scale(${page.zoom || 1})` }} className="transition-transform duration-300">
              <img src={page.imagePreview} className="max-h-full max-w-full object-contain shadow-2xl rounded-lg" alt="Zoomed view" />
            </div>
        </div>
        <div className="w-1/2 flex flex-col overflow-y-auto custom-scrollbar p-12 bg-white space-y-12">
           <section>
              <label className="text-[10px] font-black uppercase text-slate-400 mb-4 block tracking-widest">Korrektur (Råtekst)</label>
              <textarea value={page.transcription} onChange={e => onUpdate({ transcription: e.target.value })} className="w-full min-h-[300px] bg-slate-50 rounded-[30px] p-8 text-sm font-mono border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 transition-all resize-none" />
           </section>
           <section className="pb-20">
              <label className="text-[10px] font-black uppercase text-indigo-400 mb-4 block tracking-widest">Ferdigvisning</label>
              <div className="p-8 rounded-[30px] border border-indigo-50 bg-indigo-50/10 min-h-[300px]">
                <LatexRenderer content={page.transcription || ""} className="text-base text-slate-700" />
              </div>
           </section>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'dashboard' | 'editor' | 'settings'>('dashboard');
  const [currentStep, setCurrentStep] = useState<'setup' | 'review' | 'rubric' | 'results'>('setup');
  const [resultsSubView, setResultsSubView] = useState<'individual' | 'summary'>('individual');
  const [reviewCandidateId, setReviewCandidateId] = useState<string | null>(null);
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [detailPage, setDetailPage] = useState<Page | null>(null);
  const [selectedResultCandidateId, setSelectedResultCandidateId] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ count: number }>({ count: 0 });
  const [isEditingRubric, setIsEditingRubric] = useState(false);

  useEffect(() => { if (activeProject) saveProject(activeProject); }, [activeProject]);
  useEffect(() => { if (view === 'dashboard' || view === 'settings') { loadAllProjects(); getCacheStats().then(setCacheStats); } }, [view]);

  const stats = useMemo(() => {
    if (!activeProject || activeProject.candidates.length === 0) return null;
    const evaluated = activeProject.candidates.filter(c => c.status === 'evaluated');
    const total = activeProject.candidates.length;
    const count = evaluated.length;
    const totalScore = evaluated.reduce((acc, c) => acc + (c.evaluation?.score || 0), 0);
    const maxPossible = activeProject.rubric?.totalMaxPoints || 1;
    
    return {
      avgScore: count > 0 ? (totalScore / count).toFixed(1) : "0",
      avgPercent: count > 0 ? Math.round((totalScore / (count * maxPossible)) * 100) : 0,
      count,
      total
    };
  }, [activeProject]);

  const loadAllProjects = async () => {
    const all = await getAllProjects();
    setProjects(all.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const updateActiveProject = (updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  };

  const processIncomingFile = async (file: File): Promise<Page[]> => {
    return new Promise(async (resolve) => {
      if (file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pagesPromises: Promise<Page>[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            pagesPromises.push((async () => {
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height; canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport }).promise;
              const base64 = canvas.toDataURL('image/jpeg', 0.85);
              return {
                id: Math.random().toString(36).substring(7),
                fileName: `${file.name} (Side ${i})`,
                imagePreview: base64,
                base64Data: base64.split(',')[1],
                contentHash: generateHash(base64.substring(50, 2000)),
                mimeType: 'image/jpeg',
                status: 'pending',
                rotation: 0, zoom: 1
              };
            })());
          }
          resolve(await Promise.all(pagesPromises));
          return;
        } catch (e) { console.error(e); resolve([]); }
      }

      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);
          let extraText = "";
          const headerFooterFiles = Object.keys(zip.files).filter(n => n.startsWith('word/header') || n.startsWith('word/footer'));
          for (const fileName of headerFooterFiles) {
            const content = await zip.files[fileName].async("string");
            const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (text) extraText += `\n[HEADER/FOOTER: ${text}]\n`;
          }
          const result = await mammoth.extractRawText({ arrayBuffer });
          const fullText = extraText + "\n" + result.value;
          const canvas = document.createElement('canvas');
          canvas.width = 800; canvas.height = 1000;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,800,1000);
            ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,800,50);
            ctx.fillStyle = '#334155'; ctx.font = 'bold 16px Inter';
            ctx.fillText(file.name.substring(0, 45), 40, 32);
            ctx.font = '14px Courier New';
            const lines = fullText.split('\n').filter(l => l.trim()).slice(0, 45);
            lines.forEach((l, idx) => ctx.fillText(l.substring(0, 80), 40, 90 + (idx * 20)));
          }
          const base64 = canvas.toDataURL('image/jpeg');
          resolve([{
            id: Math.random().toString(36).substring(7),
            fileName: file.name,
            imagePreview: base64,
            base64Data: base64.split(',')[1],
            contentHash: generateHash(fullText.substring(0, 1000)),
            mimeType: 'image/jpeg',
            status: 'pending', 
            transcription: fullText,
            rotation: 0, zoom: 1
          }]);
          return;
        } catch (e) { resolve([]); }
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Full = e.target?.result as string;
        const base64Data = base64Full.split(',')[1];
        const contentHash = generateHash(base64Data.substring(0, 5000));
        if (!file.type.startsWith('image/')) { resolve([]); return; }
        const img = new Image();
        img.onload = () => {
          if (img.width / img.height > 1.3) {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); if (!ctx) return resolve([]);
            canvas.width = img.width / 2; canvas.height = img.height;
            ctx.drawImage(img, 0, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height); const left = canvas.toDataURL('image/jpeg', 0.85);
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height); const right = canvas.toDataURL('image/jpeg', 0.85);
            resolve([{ id: Math.random().toString(36).substring(7), fileName: `${file.name} (Del 1)`, imagePreview: left, base64Data: left.split(',')[1], contentHash: generateHash(left.substring(50, 1000)), mimeType: 'image/jpeg', status: 'pending', rotation: 0, zoom: 1 }, { id: Math.random().toString(36).substring(7), fileName: `${file.name} (Del 2)`, imagePreview: right, base64Data: right.split(',')[1], contentHash: generateHash(right.substring(50, 1000)), mimeType: 'image/jpeg', status: 'pending', rotation: 0, zoom: 1 }]);
          } else { resolve([{ id: Math.random().toString(36).substring(7), fileName: file.name, imagePreview: base64Full, base64Data, contentHash, mimeType: file.type, status: 'pending', rotation: 0, zoom: 1 }]); }
        };
        img.src = base64Full;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleTaskFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    setRubricStatus({ loading: true, text: 'Laster opp filer...' });
    let allNewPages: Page[] = [];
    for (const file of Array.from(files)) { allNewPages = [...allNewPages, ...(await processIncomingFile(file))]; }
    updateActiveProject({ taskFiles: [...(activeProject.taskFiles || []), ...allNewPages] });
    try {
        const samples = activeProject.candidates.slice(0, 5).map(c => c.pages.map(p => p.transcription).join("\n"));
        const newRubric = await generateRubricFromTaskAndSamples(allNewPages, activeProject.taskDescription, samples);
        updateActiveProject({ rubric: newRubric, name: activeProject.name.startsWith("Ny") ? newRubric.title : activeProject.name });
    } catch (err) {
      console.error("Manualgenerering feilet:", err);
    } finally { setRubricStatus({ loading: false, text: '' }); }
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    const currentHashes = new Set([...activeProject.candidates.flatMap(c => c.pages.map(p => p.contentHash)), ...(activeProject.unprocessedPages?.map(p => p.contentHash) || [])]);
    let newPages: Page[] = [];
    for (const file of Array.from(files)) {
      const processed = await processIncomingFile(file);
      processed.forEach(p => { if (!currentHashes.has(p.contentHash)) newPages.push(p); });
    }
    if (newPages.length > 0) {
        updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...newPages] });
        startProcessingQueue(newPages);
    }
  };

  const startProcessingQueue = async (pagesToProcess: Page[]) => {
    const queue = [...pagesToProcess];
    const processNext = async () => {
      if (queue.length === 0) return;
      const page = queue.shift()!;
      setActiveProject(prev => ({ ...prev!, unprocessedPages: prev!.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'processing' } : p) }));
      try {
        const results = page.transcription ? await analyzeTextContent(page.transcription) : await transcribeAndAnalyzeImage(page);
        integrateResultsIntoActiveProject(page, results);
        await processNext();
      } catch (err) {
        console.error("Prosessering feilet for side:", page.fileName, err);
        setActiveProject(prev => ({ ...prev!, unprocessedPages: prev!.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'error' } : p) }));
        await processNext();
      }
    };
    await processNext();
  };

  const integrateResultsIntoActiveProject = (page: Page, results: any) => {
    setActiveProject(prev => {
      if (!prev) return null;
      let cands = [...(prev.candidates || [])];
      const resArr = Array.isArray(results) ? results : [results];
      resArr.forEach((res: any) => {
        const cId = res.candidateId || "Ukjent";
        let cand = cands.find(c => c.id === cId);
        const newPage: Page = { ...page, id: Math.random().toString(36).substring(7), candidateId: cId, part: res.part, pageNumber: res.pageNumber, transcription: res.fullText || page.transcription, status: 'completed' as const };
        if (!cand) {
          cand = { id: cId, name: `Kandidat ${cId}`, status: 'completed', pages: [newPage] };
          cands.push(cand);
        } else if (!cand.pages.some(p => p.contentHash === page.contentHash)) {
          cand.pages = [...cand.pages, newPage].sort((a,b) => (a.pageNumber||0)-(b.pageNumber||0));
        }
      });
      return { ...prev, candidates: cands, unprocessedPages: prev.unprocessedPages?.filter(p => p.id !== page.id) || [] };
    });
  };

  const handlePageUpdate = (cId: string, pId: string, updates: Partial<Page>) => {
    if (!activeProject) return;
    updateActiveProject({ candidates: activeProject.candidates.map(c => c.id === cId ? { ...c, pages: c.pages.map(p => p.id === pId ? { ...p, ...updates } : p) } : c) });
    if (detailPage?.id === pId) setDetailPage(prev => prev ? { ...prev, ...updates } : null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
        <div className="flex items-center gap-6">
          <button onClick={() => setView('dashboard')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">← Oversikt</button>
        </div>
        <div className="flex gap-2">{steps.map(s => (<button key={s.id} onClick={() => setCurrentStep(s.id as any)} className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${currentStep === s.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>{s.icon} {s.label}</button>))}</div>
        <button onClick={() => setConfirmModal({ isOpen: true, title: "Slette?", message: "Vil du slette dette prosjektet?", onConfirm: async () => { await deleteProject(activeProject!.id); setView('dashboard'); setConfirmModal(null); } })} className="text-[10px] font-black text-rose-300 uppercase">Slett ✕</button>
      </header>

      {rubricStatus.loading && (
        <div className="bg-indigo-600 text-white px-8 py-2 flex items-center justify-center gap-4 animate-in slide-in-from-top">
            <Spinner color="text-white" />
            <span className="text-[10px] font-black uppercase tracking-widest">{rubricStatus.text}</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {currentStep === 'setup' && (
          <div className="p-10 max-w-5xl mx-auto space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100 min-h-[400px]">
                <h3 className="font-black text-[10px] uppercase text-slate-400 mb-8 tracking-widest">1. Oppgave / Fasit</h3>
                <div className="relative group">
                  <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="border-2 border-dashed border-slate-100 rounded-[30px] p-12 text-center group-hover:border-indigo-200 transition-colors">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Dra filer hit eller klikk</p>
                    <p className="text-[9px] text-slate-300 mt-2">Støtter PDF, Word og Bilder</p>
                  </div>
                </div>
                <div className="mt-8 space-y-2">{activeProject?.taskFiles?.map(f => (<div key={f.id} className="text-[10px] font-bold bg-slate-50 p-3 rounded-xl border flex justify-between items-center animate-in fade-in"><span>{f.fileName}</span><button onClick={() => updateActiveProject({ taskFiles: activeProject!.taskFiles.filter(i => i.id !== f.id) })}>✕</button></div>))}</div>
              </div>
              
              <div className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100 min-h-[400px]">
                <h3 className="font-black text-[10px] uppercase text-slate-400 mb-8 tracking-widest">2. Elevbesvarelser</h3>
                <div className="relative group">
                  <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="border-2 border-dashed border-slate-100 rounded-[30px] p-12 text-center group-hover:border-emerald-200 transition-colors">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Dra elevbesvarelser hit</p>
                    <p className="text-[9px] text-slate-300 mt-2">Opptil 50 filer samtidig</p>
                  </div>
                </div>
                <div className="mt-8 space-y-2">
                    {activeProject?.unprocessedPages?.map(p => (
                      <div key={p.id} className={`text-[10px] font-bold p-3 rounded-xl border flex justify-between items-center ${p.status === 'error' ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                        <div className="flex items-center gap-2">
                          {p.status === 'processing' ? <Spinner /> : p.status === 'error' ? '✕' : '•'}
                          <span className="truncate max-w-[150px]">{p.fileName}</span>
                        </div>
                        {p.status === 'error' && <button onClick={() => startProcessingQueue([p])} className="bg-rose-600 text-white px-3 py-1 rounded-lg text-[8px] uppercase font-black">Prøv på nytt</button>}
                      </div>
                    ))}
                    {activeProject?.candidates?.map(c => (<div key={c.id} className="text-[10px] font-bold bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-emerald-700 flex justify-between items-center animate-in slide-in-from-right"><span>{c.name} ({c.pages.length} sider)</span><span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase">Klar</span></div>))}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="flex h-full min-h-[calc(100vh-64px)] overflow-hidden">
            <aside className="w-64 bg-white border-r overflow-y-auto p-4 shrink-0">
              <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4">Kandidater</h4>
              <div className="space-y-2">
                <button onClick={() => setReviewCandidateId(null)} className={`w-full text-left px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all ${!reviewCandidateId ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}>Alle</button>
                {activeProject?.candidates.map(c => (<button key={c.id} onClick={() => setReviewCandidateId(c.id)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all border ${reviewCandidateId === c.id ? 'bg-indigo-600 border-indigo-700 text-white' : 'text-slate-500 hover:bg-slate-50 border-transparent'}`}>{c.name}</button>))}
              </div>
            </aside>
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6">
                {(reviewCandidateId ? activeProject?.candidates?.filter(c => c.id === reviewCandidateId) : activeProject?.candidates)?.map(c => (
                  <div key={c.id} className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden mb-12">
                    <div className="px-10 py-5 bg-white border-b flex justify-between items-center">
                        <div className="flex items-center gap-4"><span className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-xs">{c.name.substring(0,2)}</span><span className="font-black text-xl text-slate-800">{c.name}</span></div>
                        <span className="text-[10px] font-black text-slate-300 uppercase">Sider: {c.pages.length}</span>
                    </div>
                    {c.pages.map(p => (
                      <div key={p.id} className="flex h-[800px] border-t border-slate-100">
                        <div className="w-1/2 bg-slate-50 flex flex-col items-center justify-center relative group p-8">
                          <div className="flex gap-4 absolute top-6 right-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handlePageUpdate(c.id, p.id, { rotation: ((p.rotation || 0) + 90) % 360 })} className="bg-white text-slate-700 w-10 h-10 rounded-full shadow-lg flex items-center justify-center border hover:bg-slate-50">🔄</button>
                              <div className="bg-white px-4 py-2 rounded-2xl shadow-lg border flex items-center gap-2"><span className="text-[8px] font-black uppercase text-slate-400">Zoom</span><input type="range" min="0.5" max="3" step="0.1" value={p.zoom || 1} onChange={(e) => handlePageUpdate(c.id, p.id, { zoom: parseFloat(e.target.value) })} className="w-24 h-1 bg-indigo-100 rounded-lg appearance-none cursor-pointer" /></div>
                          </div>
                          <div style={{ transform: `rotate(${p.rotation || 0}deg) scale(${p.zoom || 1})` }} className="transition-transform duration-300 h-full w-full flex items-center justify-center">{p.imagePreview ? <img src={p.imagePreview} className="max-h-full max-w-full object-contain" /> : <Spinner />}</div>
                          <div className="absolute top-6 left-6 bg-white/80 backdrop-blur-md text-slate-800 text-[9px] font-black px-4 py-2 rounded-2xl border border-slate-200 uppercase">{p.part || 'Del 1'} • Side {p.pageNumber}</div>
                          <button onClick={() => setDetailPage(p)} className="absolute bottom-6 right-6 bg-indigo-600 text-white text-[10px] font-black px-6 py-3 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all uppercase">Forstørr 🔍</button>
                        </div>
                        <div className="w-1/2 flex flex-col h-full bg-white border-l border-slate-200">
                          <div className="h-1/2 p-8 border-b border-slate-100 flex flex-col"><label className="text-[10px] font-black uppercase text-slate-400 mb-4 block">Transkribert</label><textarea value={p.transcription} onChange={e => handlePageUpdate(c.id, p.id, { transcription: e.target.value })} className="w-full flex-1 bg-slate-50 rounded-[25px] p-6 text-[12px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-indigo-100 resize-none" /></div>
                          <div className="h-1/2 p-8 flex flex-col overflow-y-auto"><label className="text-[10px] font-black uppercase text-indigo-400 mb-4 block">Matte-visning</label><div className="p-6 rounded-[25px] border border-indigo-50 bg-indigo-50/5 flex-1 overflow-y-auto"><LatexRenderer content={p.transcription || ""} className="text-sm text-slate-700" /></div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        )}

        {currentStep === 'results' && (
          <div className="flex h-full min-h-[calc(100vh-64px)] overflow-hidden">
             <aside className="w-80 bg-white border-r overflow-y-auto p-6 shrink-0">
               <div className="flex bg-slate-50 p-1.5 rounded-2xl mb-8">
                    <button onClick={() => setResultsSubView('individual')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-xl ${resultsSubView === 'individual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Individuelt</button>
                    <button onClick={() => setResultsSubView('summary')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-xl ${resultsSubView === 'summary' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Gruppesnitt</button>
               </div>
               {resultsSubView === 'individual' && activeProject?.candidates.map(c => (
                 <button key={c.id} onClick={() => setSelectedResultCandidateId(c.id)} className={`w-full text-left p-4 mb-3 rounded-2xl border ${selectedResultCandidateId === c.id ? 'bg-indigo-600 text-white shadow-lg border-indigo-700' : 'bg-white border-slate-100 hover:border-indigo-200'}`}><div className="flex justify-between items-center mb-1"><span className="font-black text-sm">{c.name}</span><span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${selectedResultCandidateId === c.id ? 'bg-white/20' : 'bg-slate-100'}`}>{c.evaluation?.score || 0} p</span></div><div className="text-[9px] font-bold uppercase opacity-60">Karakter: {c.evaluation?.grade || '-'}</div></button>
               ))}
               {resultsSubView === 'summary' && stats && (
                  <div className="space-y-6">
                    <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-xl shadow-indigo-100"><p className="text-[8px] font-black uppercase opacity-60">Snitt Poengsum</p><div className="text-4xl font-black mt-2">{stats.avgScore}</div><p className="text-[9px] font-bold mt-2 opacity-80">{stats.avgPercent}% av totalt</p></div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100"><p className="text-[8px] font-black uppercase text-slate-400">Fremgang</p><div className="text-xl font-black mt-2 text-slate-700">{stats.count} / {stats.total}</div><div className="w-full h-1 bg-slate-200 rounded-full mt-4 overflow-hidden"><div className="h-full bg-emerald-500" style={{width: `${(stats.count/stats.total)*100}%`}} /></div></div>
                  </div>
               )}
             </aside>
             <div className="flex-1 overflow-y-auto bg-slate-50/50 p-12">
                {resultsSubView === 'summary' ? (
                   <div className="max-w-6xl mx-auto space-y-12">
                        <header><h2 className="text-3xl font-black text-slate-800">Gruppestatistikk</h2><p className="text-slate-400 text-xs font-bold uppercase mt-2">Oversikt over klassens prestasjoner</p></header>
                        {activeProject && <TaskAnalysisChart project={activeProject} />}
                        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-x-auto mt-12">
                            <table className="w-full border-collapse">
                                <thead><tr className="bg-slate-50/50"><th className="p-6 text-left text-[10px] font-black uppercase text-slate-400 border-b border-r border-slate-100 sticky left-0 bg-slate-50">Kandidat</th>{activeProject?.rubric?.criteria.map((c, i) => (<th key={i} className="p-6 text-center text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 min-w-[100px]">{c.name}</th>))}<th className="p-6 text-center text-[10px] font-black uppercase text-indigo-400 border-b border-slate-100">SUM</th></tr></thead>
                                <tbody>{activeProject?.candidates.map(cand => (<tr key={cand.id} className="hover:bg-slate-50/30 transition-colors"><td className="p-6 font-black text-sm text-slate-700 border-r border-slate-100 sticky left-0 bg-white">{cand.name}</td>{activeProject?.rubric?.criteria.map((crit, idx) => { const ev = cand.evaluation?.taskBreakdown.find(t => t.taskName === crit.name); return (<td key={idx} className="p-2 border-r border-slate-50">{ev ? <div className={`w-full py-4 rounded-xl text-center font-black text-xs ${getHeatmapColor(ev.score, ev.max)}`}>{ev.score}</div> : <div className="w-full py-4 rounded-xl text-center bg-slate-50 text-slate-300 font-black text-[10px]">-</div>}</td>); })}<td className="p-6 text-center font-black text-indigo-600 bg-indigo-50/20">{cand.evaluation?.score || 0}</td></tr>))}</tbody>
                            </table>
                        </div>
                   </div>
                ) : selectedResultCandidateId ? (
                   <div className="max-w-4xl mx-auto space-y-10">
                        <header className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100 flex justify-between items-center"><div><h2 className="text-3xl font-black text-slate-800">{activeProject?.candidates.find(c => c.id === selectedResultCandidateId)?.name}</h2><p className="text-slate-400 font-bold uppercase text-[10px] mt-2">Pedagogisk Vurdering</p></div><div className="text-center"><div className="text-5xl font-black text-indigo-600">{activeProject?.candidates.find(c => c.id === selectedResultCandidateId)?.evaluation?.grade}</div><div className="text-[9px] font-black uppercase text-slate-400 mt-2">Karakter</div></div></header>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white p-10 rounded-[50px] border border-slate-100"><h3 className="font-black text-[10px] uppercase text-slate-400 mb-6">Tilbakemelding</h3><p className="text-slate-700 text-sm italic">"{activeProject?.candidates.find(c => c.id === selectedResultCandidateId)?.evaluation?.feedback}"</p></div>
                            <div className="bg-indigo-600 p-10 rounded-[50px] text-white"><h3 className="font-black text-[10px] uppercase text-indigo-200 mb-6">Vekstpunkter</h3><ul className="space-y-4">{activeProject?.candidates.find(c => c.id === selectedResultCandidateId)?.evaluation?.vekstpunkter?.map((v, i) => (<li key={i} className="flex gap-4 text-sm font-bold"><span className="opacity-40">0{i+1}</span><span>{v}</span></li>))}</ul></div>
                        </div>
                   </div>
                ) : <div className="h-full flex items-center justify-center text-slate-300 font-black uppercase text-sm">Velg kandidat</div>}
             </div>
          </div>
        )}
      </main>
      <Modal isOpen={!!confirmModal} title={confirmModal?.title || ""} message={confirmModal?.message || ""} onConfirm={() => confirmModal?.onConfirm()} onCancel={() => setConfirmModal(null)} />
      {detailPage && <PageDetailView page={detailPage} onClose={() => setDetailPage(null)} onUpdate={(upd) => handlePageUpdate(detailPage.candidateId!, detailPage.id, upd)} />}
    </div>
  );
};
export default App;
