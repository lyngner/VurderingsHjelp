
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Page, Candidate, Rubric, Project, TaskEvaluation, CandidateHierarchy, CommonError } from './types';
import { transcribeAndAnalyzeImage, generateRubricFromTaskAndSamples, evaluateCandidate } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject, getFromGlobalCache, saveToGlobalCache, getCacheStats, clearGlobalCache } from './services/storageService';

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
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed max-w-sm">Disse dataene lagres kun i din nettleser (IndexedDB) og brukes for å unngå unødvendig API-bruk ved gjenbruk av bilder.</p>
              </div>
              <button onClick={onClearCache} className="bg-white border border-indigo-100 text-[10px] font-black uppercase text-indigo-600 px-6 py-3 rounded-2xl hover:bg-indigo-100 transition-colors shadow-sm">Tøm cache 🗑️</button>
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Personvern & GDPR</h3>
            <div className="space-y-4 text-sm leading-relaxed text-slate-600">
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                <p className="font-bold text-slate-900 mb-2">Ingen lagring i skyen</p>
                <p>Denne applikasjonen sender kun bilder til Google Gemini API for analyse. Ingen elevdata lagres på våre servere eller i skyen. Alt av prosjektdata og resultater lagres lokalt på din maskin.</p>
              </div>
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                <p className="font-bold text-slate-900 mb-2">Bruk av KI</p>
                <p>Appen bruker Gemini 2.5 og 3. Ved bruk av betalt API-nøkkel via Google Cloud brukes ikke dataene dine til å trene Googles modeller. Du som lærer har alltid det siste ansvaret for vurderingen ("Human-in-the-loop").</p>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Teknisk informasjon</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 border rounded-3xl bg-slate-50/30">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Database</p>
                <p className="text-xs font-bold">IndexedDB (v2)</p>
              </div>
              <div className="p-6 border rounded-3xl bg-slate-50/30">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">KI Modeller</p>
                <p className="text-xs font-bold">Gemini 3 Flash & Pro</p>
              </div>
            </div>
          </section>
        </div>
        
        <div className="p-8 bg-slate-50 border-t text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ElevVurdering PRO • Versjon 2.0.4</p>
        </div>
      </div>
    </div>
  );
};

const generateHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

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

const LatexRenderer: React.FC<{ content: string }> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current && (window as any).MathJax) {
      (window as any).MathJax.typesetPromise([containerRef.current]).catch(console.warn);
    }
  }, [content]);
  return <div ref={containerRef} className="whitespace-pre-wrap leading-relaxed">{content}</div>;
};

const RadarChart: React.FC<{ data: { label: string; value: number }[]; size?: number }> = ({ data, size = 300 }) => {
  const radius = size / 3;
  const centerX = size / 2;
  const centerY = size / 2;
  const points = data.length || 3;
  
  const polygonPoints = useMemo(() => {
    if (!data.length) return "";
    return data.map((d, i) => {
      const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
      const x = centerX + radius * d.value * Math.cos(angle);
      const y = centerY + radius * d.value * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');
  }, [data, centerX, centerY, radius, points]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto overflow-visible">
      {[0.2, 0.4, 0.6, 0.8, 1].map((r, i) => (
        <circle key={i} cx={centerX} cy={centerY} r={radius * r} fill="none" stroke="#F1F5F9" strokeWidth="1" strokeDasharray={i === 4 ? "" : "4 4"} />
      ))}
      {data.map((d, i) => {
        const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const lx = centerX + (radius + 20) * Math.cos(angle);
        const ly = centerY + (radius + 20) * Math.sin(angle);
        return (
          <g key={i}>
            <line x1={centerX} y1={centerY} x2={x} y2={y} stroke="#F1F5F9" strokeWidth="1" />
            <text x={lx} y={ly} textAnchor="middle" fontSize="8" fontWeight="700" fill="#94A3B8" className="uppercase tracking-tighter">{d.label}</text>
          </g>
        );
      })}
      {polygonPoints && <polygon points={polygonPoints} fill="rgba(79, 70, 229, 0.15)" stroke="#4F46E5" strokeWidth="2" />}
    </svg>
  );
};

const PrintReport: React.FC<{ project: Project; stats: any }> = ({ project, stats }) => {
  if (!project) return null;

  return (
    <div className="print-only p-8 text-slate-900 bg-white min-h-screen">
      <header className="mb-12 border-b-2 border-slate-900 pb-8">
        <h1 className="text-4xl font-black mb-2">{project.name}</h1>
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Sluttrapport for Vurdering • {new Date().toLocaleDateString('no-NO')}</p>
        <div className="mt-8 grid grid-cols-3 gap-8">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Antall kandidater</p>
            <p className="text-2xl font-black">{project.candidates.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Gjennomsnittsscore</p>
            <p className="text-2xl font-black">{stats ? Math.round(stats.avgScore) : '-'} / {project.rubric?.totalMaxPoints}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Vurderingsgrunnlag</p>
            <p className="text-sm font-bold">{project.rubric?.title}</p>
          </div>
        </div>
      </header>

      <section className="mb-16 print-avoid-break">
        <h2 className="text-2xl font-black mb-6">Gruppeanalyse</h2>
        {stats && (
          <div className="space-y-4">
            {stats.allTaskNames.map((tn: string) => {
              const s = stats.taskStats[tn];
              const pct = (s.total / s.max) * 100;
              return (
                <div key={tn} className="flex items-center gap-4">
                  <div className="w-40 text-xs font-black uppercase text-slate-500 truncate">{tn}</div>
                  <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden border">
                    <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }}></div>
                  </div>
                  <div className="w-12 text-xs font-black text-right">{Math.round(pct)}%</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {stats && (
        <section className="mb-16 print-avoid-break">
          <h2 className="text-2xl font-black mb-6">Resultatmatrise (Heatmap)</h2>
          <table className="w-full text-[10px] border">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 font-black text-left">Navn / ID</th>
                {stats.allTaskNames.map((tn: string) => (
                  <th key={tn} className="p-2 font-black text-center">{tn}</th>
                ))}
                <th className="p-2 font-black text-right">Sum</th>
              </tr>
            </thead>
            <tbody>
              {project.candidates.map(c => (
                <tr key={c.id}>
                  <td className="p-2 font-black border">{c.name || c.id}</td>
                  {stats.allTaskNames.map((tn: string) => {
                    const score = stats.candidateTasks[c.id]?.[tn];
                    const max = stats.taskStats[tn].max / stats.taskStats[tn].count;
                    const pct = score !== undefined ? score / max : null;
                    let color = "#f8fafc"; // slate-50
                    if (pct === 1) color = "#ecfdf5"; // emerald-50
                    else if (pct !== null && pct > 0.5) color = "#fffbeb"; // amber-50
                    else if (pct !== null && pct > 0) color = "#fff7ed"; // orange-50
                    else if (pct !== null) color = "#fff1f2"; // rose-50
                    return (
                      <td key={tn} className="p-2 text-center border font-bold" style={{ backgroundColor: color }}>
                        {score !== undefined ? score : '-'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-black border">{c.evaluation?.score || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="print-break-before">
        <h2 className="text-2xl font-black mb-12">Individuelle elevrapporter</h2>
        {project.candidates.filter(c => c.status === 'evaluated').map(c => (
          <div key={c.id} className="print-break-after p-8 border-2 border-slate-200 rounded-3xl mb-12">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-3xl font-black">{c.name || `Kandidat ${c.id}`}</h3>
                <p className="text-sm font-bold text-indigo-600 uppercase tracking-widest mt-2">Score: {c.evaluation?.score} / {project.rubric?.totalMaxPoints} • Karakter: {c.evaluation?.grade}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase text-slate-400">ID: {c.id}</p>
                <p className="text-xs font-bold">{new Date(project.updatedAt).toLocaleDateString('no-NO')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-12 mb-12">
              <div className="space-y-8">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4">Tilbakemelding</h4>
                  <div className="text-sm leading-relaxed italic border-l-4 border-indigo-600 pl-6 bg-slate-50/50 py-4">
                    <LatexRenderer content={c.evaluation?.feedback || ''} />
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4">Vekstpunkter</h4>
                  <ul className="space-y-2">
                    {c.evaluation?.vekstpunkter?.map((v, i) => (
                      <li key={i} className="text-xs font-medium flex gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                        <LatexRenderer content={v} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="scale-75 origin-center border rounded-full p-4">
                  <RadarChart size={280} data={
                    Object.keys(project.rubric?.criteria.reduce((acc: any, curr) => {
                      const t = curr.tema || "Annet";
                      acc[t] = 0; return acc;
                    }, {}) || {}).map(tema => {
                      const tasksInTema = c.evaluation?.taskBreakdown.filter(t => t.tema === tema) || [];
                      const sum = tasksInTema.reduce((a, b) => a + b.score, 0);
                      const max = tasksInTema.reduce((a, b) => a + b.max, 0);
                      return { label: tema, value: max > 0 ? sum / max : 0 };
                    })
                  } />
                </div>
              </div>
            </div>

            <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4">Oppgaveoversikt</h4>
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Oppgave</th>
                  <th className="p-3 text-left">Kommentar</th>
                  <th className="p-3 text-right">Poeng</th>
                </tr>
              </thead>
              <tbody>
                {c.evaluation?.taskBreakdown.map((t, i) => (
                  <tr key={i}>
                    <td className="p-3 font-bold border-b">{t.taskName}</td>
                    <td className="p-3 text-slate-600 border-b italic">{t.comment}</td>
                    <td className="p-3 text-right font-black border-b">{t.score} / {t.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [currentStep, setCurrentStep] = useState<'setup' | 'review' | 'rubric' | 'results'>('setup');
  const [resultsSubView, setResultsSubView] = useState<'individual' | 'group' | 'heatmap'>('individual');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [reviewCandidateId, setReviewCandidateId] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<{ type: string | null; current: number; total: number; statusText: string }>({ type: null, current: 0, total: 0, statusText: '' });
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
  const [editingCriterionIndex, setEditingCriterionIndex] = useState<number | null>(null);
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

  const handleClearCache = async () => {
    if (confirm("Er du sikker på at du vil tømme hele den globale bilde-cachen? Dette betyr at alle bilder må analyseres på nytt ved neste opplasting.")) {
      await clearGlobalCache();
      updateCacheStats();
    }
  };

  const updateActiveProject = async (updates: Partial<Project>) => {
    setActiveProject(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates, updatedAt: Date.now() };
      saveProject(updated).catch(err => console.error("Error saving project:", err));
      return updated;
    });
  };

  const handleCandidateNameChange = (candId: string, newName: string) => {
    if (!activeProject) return;
    const updatedCandidates = activeProject.candidates.map(c => 
      c.id === candId ? { ...c, name: newName } : c
    );
    updateActiveProject({ candidates: updatedCandidates });
  };

  const handleRemoveUnprocessedPage = (pageId: string) => {
    if (!activeProject) return;
    const updated = activeProject.unprocessedPages?.filter(p => p.id !== pageId) || [];
    updateActiveProject({ unprocessedPages: updated });
  };

  const handleRemoveCandidate = (candId: string) => {
    if (!activeProject) return;
    const updated = activeProject.candidates.filter(c => c.id !== candId);
    updateActiveProject({ candidates: updated });
  };

  const handleDeleteProject = async () => {
    if (!activeProject) return;
    setConfirmModal({
      isOpen: true,
      title: "Slette prosjekt?",
      message: "Er du sikker på at du vil slette hele dette vurderingsprosjektet? Dette vil fjerne alle transkripsjoner og vurderinger for dette prosjektet permanent.",
      onConfirm: async () => {
        await deleteProject(activeProject.id);
        setConfirmModal(null);
        setView('dashboard');
        loadAllProjects();
      }
    });
  };

  const handleTaskFileSelect = async (files: FileList) => {
    let allNewPages: Page[] = [];
    for (const file of Array.from(files)) {
      const split = await splitA3IfNecessary(file);
      allNewPages = [...allNewPages, ...split];
    }
    updateActiveProject({ taskFiles: [...(activeProject?.taskFiles || []), ...allNewPages] });
  };

  const handleCandidateFileSelect = async (files: FileList) => {
    if (!activeProject) return;
    
    const existingHashes = new Set([
      ...(activeProject.candidates.flatMap(c => c.pages.map(p => p.contentHash))),
      ...(activeProject.unprocessedPages?.map(p => p.contentHash) || [])
    ]);

    let allNewPages: Page[] = [];
    for (const file of Array.from(files)) {
      const split = await splitA3IfNecessary(file);
      const uniqueSplit = split.filter(p => !existingHashes.has(p.contentHash));
      allNewPages = [...allNewPages, ...uniqueSplit];
    }

    if (allNewPages.length === 0 && Array.from(files).length > 0) {
      alert("Alle disse filene er allerede lastet opp.");
      return;
    }

    const pagesWithCacheStatus = await Promise.all(allNewPages.map(async p => {
      const cachedData = await getFromGlobalCache(p.contentHash);
      return cachedData ? { ...p, status: 'completed' as const, transcription: cachedData.fullText || (Array.isArray(cachedData) ? cachedData[0].fullText : ""), isCached: true } : p;
    }));

    const updatedUnprocessed = [...(activeProject.unprocessedPages || []), ...pagesWithCacheStatus];
    setActiveProject(prev => {
      if (!prev) return null;
      const updated = { ...prev, unprocessedPages: updatedUnprocessed };
      saveProject(updated);
      return updated;
    });
    
    const needsProcessing = pagesWithCacheStatus.filter(p => !p.isCached);
    if (needsProcessing.length > 0) {
      startProcessingQueue(needsProcessing);
    }
    
    const alreadyCached = pagesWithCacheStatus.filter(p => p.isCached);
    for (const p of alreadyCached) {
        const cachedData = await getFromGlobalCache(p.contentHash);
        integrateResultsIntoActiveProject(p, cachedData);
    }
    updateCacheStats();
  };

  const handleRetryProcessing = (page: Page) => {
    if (!activeProject) return;
    setActiveProject(prev => {
        if (!prev) return null;
        return { 
          ...prev, 
          unprocessedPages: prev.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'pending' as const } : p) 
        };
    });
    startProcessingQueue([page]);
  };

  const integrateResultsIntoActiveProject = (page: Page, results: any) => {
    setActiveProject(prev => {
      if (!prev) return null;
      let currentCandidates = [...(prev.candidates || [])];
      const resultsArray = Array.isArray(results) ? results : [results];

      resultsArray.forEach((res: any) => {
        const cId = res.candidateId || "Ukjent";
        let cand = currentCandidates.find(c => c.id === cId);
        const newPage: Page = { 
          ...page, 
          id: Math.random().toString(36).substring(7), 
          candidateId: cId, 
          pageNumber: res.pageNumber, 
          transcription: res.fullText, 
          identifiedTasks: res.tasks?.map((t: any) => t.taskNum) || [],
          status: 'completed' as const 
        };

        if (!cand) {
          cand = { id: cId, name: `Kandidat ${cId}`, status: 'completed', pages: [newPage], structuredAnswers: { tasks: {} } };
          currentCandidates.push(cand);
        } else if (!cand.pages.some(existingP => existingP.contentHash === page.contentHash)) {
            cand.pages = [...cand.pages, newPage].sort((a,b) => (a.pageNumber||0)-(b.pageNumber||0));
        }

        if (cand && !cand.structuredAnswers) cand.structuredAnswers = { tasks: {} };
        res.tasks?.forEach((t: any) => {
          if (cand && cand.structuredAnswers && !cand.structuredAnswers.tasks[t.taskNum]) {
            cand.structuredAnswers.tasks[t.taskNum] = { subtasks: {} };
          }
          if (cand && cand.structuredAnswers) {
            cand.structuredAnswers.tasks[t.taskNum].subtasks[t.subTask || 'default'] = t.text;
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
    const CONCURRENCY = 2; 
    const queue = [...pagesToProcess];
    
    const processItem = async () => {
      if (queue.length === 0) return;
      const page = queue.shift()!;
      
      setActiveProject(prev => {
        if (!prev) return null;
        return { ...prev, unprocessedPages: prev.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'processing' } : p) };
      });

      try {
        const results = await transcribeAndAnalyzeImage(page);
        await saveToGlobalCache(page.contentHash, results);
        integrateResultsIntoActiveProject(page, results);
        updateCacheStats();
      } catch (err: any) {
        console.error("Feil ved prosessering av side:", err);
        setActiveProject(prev => {
          if (!prev) return null;
          return { 
            ...prev, 
            unprocessedPages: prev.unprocessedPages?.map(p => p.id === page.id ? { ...p, status: 'error' } : p) 
          };
        });
      }
      await processItem();
    };

    const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(null).map(() => processItem());
    await Promise.all(workers);
  };

  const performEvaluation = async () => {
    if (!activeProject?.rubric) return;
    const targets = activeProject.candidates.filter(c => c.status !== 'evaluated');
    if (targets.length === 0) {
      alert("Alle kandidater er allerede vurdert.");
      return;
    }
    setProcessStatus({ type: 'Vurdering', current: 0, total: targets.length, statusText: 'Starter...' });
    for (let i = 0; i < targets.length; i++) {
      setProcessStatus(p => ({ ...p, current: i + 1, statusText: `Vurderer ${targets[i].name}...` }));
      try {
        const evalRes = await evaluateCandidate(targets[i], activeProject.rubric!, activeProject.taskDescription);
        setActiveProject(prev => {
          if (!prev) return null;
          const updated = { ...prev, candidates: prev.candidates.map(c => c.id === targets[i].id ? { ...c, evaluation: evalRes, status: 'evaluated' as any } : c), updatedAt: Date.now() };
          saveProject(updated);
          return updated;
        });
      } catch (err) {
        console.error("Vurderingsfeil:", err);
      }
    }
    setProcessStatus({ type: null, current: 0, total: 0, statusText: '' });
    setResultsSubView('individual');
    if (!selectedCandidateId && activeProject.candidates.length > 0) setSelectedCandidateId(activeProject.candidates[0].id);
  };

  const handleGenerateRubric = async () => {
    if (!activeProject || activeProject.taskFiles.length === 0) {
      alert("Last opp oppgave/fasit-filer først.");
      return;
    }
    setRubricStatus({ loading: true, text: 'Analyserer oppgaver og genererer rettemanual...' });
    try {
      const samples = activeProject.candidates
        .slice(0, 10) 
        .map(c => `Kandidat ${c.id} (${c.name}):\n${c.pages.map(p => p.transcription).join("\n")}`)
        .filter(t => t && t.trim().length > 0);

      const newRubric = await generateRubricFromTaskAndSamples(
        activeProject.taskFiles,
        activeProject.taskDescription,
        samples
      );
      updateActiveProject({ rubric: newRubric });
    } catch (err) {
      console.error("Feil ved generering av manual:", err);
      alert("Kunne ikke generere rettemanual automatisk.");
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const stats = useMemo(() => {
    if (!activeProject) return null;
    const evaluated = activeProject.candidates.filter(c => c.status === 'evaluated');
    if (evaluated.length === 0) return null;
    const taskStats: Record<string, { total: number; max: number; count: number; tema: string }> = {};
    const candidateTasks: Record<string, Record<string, number>> = {};
    evaluated.forEach(c => {
      candidateTasks[c.id] = {};
      c.evaluation?.taskBreakdown.forEach(t => {
        if (!taskStats[t.taskName]) taskStats[t.taskName] = { total: 0, max: 0, count: 0, tema: t.tema };
        taskStats[t.taskName].total += t.score;
        taskStats[t.taskName].max += t.max;
        taskStats[t.taskName].count++;
        candidateTasks[c.id][t.taskName] = t.score;
      });
    });
    const allTaskNames = Object.keys(taskStats).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
    return { taskStats, allTaskNames, candidateTasks, evaluatedCount: evaluated.length, avgScore: evaluated.reduce((acc, c) => acc + (c.evaluation?.score || 0), 0) / evaluated.length };
  }, [activeProject]);

  const filteredCandidatesForReview = useMemo(() => {
    if (!activeProject) return [];
    if (!reviewCandidateId) return activeProject.candidates;
    return activeProject.candidates.filter(c => c.id === reviewCandidateId);
  }, [activeProject, reviewCandidateId]);

  const radarData = useMemo(() => {
    if (!activeProject) return [];
    const candId = selectedCandidateId || activeProject.candidates[0]?.id;
    const cand = activeProject.candidates.find(c => c.id === candId);
    if (!cand?.evaluation?.taskBreakdown) return [];
    const themes: Record<string, { sum: number, max: number }> = {};
    cand.evaluation.taskBreakdown.forEach(t => {
      const tema = t.tema || "Annet";
      if (!themes[tema]) themes[tema] = { sum: 0, max: 0 };
      themes[tema].sum += t.score;
      themes[tema].max += t.max;
    });
    return Object.keys(themes).map(k => ({ label: k, value: themes[k].max > 0 ? themes[k].sum / themes[k].max : 0 }));
  }, [activeProject, selectedCandidateId]);

  if (view === 'dashboard') {
    return (
      <div className="p-10 max-w-6xl mx-auto animate-in fade-in duration-700">
        <header className="flex justify-between items-start mb-16">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Vurderingsportal</h1>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2">Dine prosjekter i minnet</p>
          </div>
          <div className="flex gap-4">
             <button onClick={() => setShowSettings(true)} className="w-14 h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
             </button>
             <button onClick={() => { setView('editor'); setCurrentStep('setup'); setActiveProject({ id: Math.random().toString(36).substring(7), name: `Ny vurdering ${new Date().toLocaleDateString()}`, createdAt: Date.now(), updatedAt: Date.now(), taskDescription: '', taskFiles: [], candidates: [], unprocessedPages: [], rubric: null, status: 'draft' }); }} className="bg-indigo-600 text-white px-8 py-4 rounded-[20px] font-black shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 text-sm">Ny vurdering</button>
          </div>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {projects.map(p => {
            const evaluated = p.candidates.filter(c => c.status === 'evaluated').length;
            const total = p.candidates.length;
            const progress = total > 0 ? (evaluated / total) * 100 : 0;
            return (
              <div key={p.id} onClick={() => { setActiveProject(p); setView('editor'); setCurrentStep(total > 0 ? (evaluated > 0 ? 'results' : 'review') : 'setup'); }} className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-100 cursor-pointer hover:border-indigo-400 hover:shadow-2xl transition-all group relative">
                <button onClick={(e) => { 
                  e.stopPropagation(); 
                  setConfirmModal({ isOpen: true, title: "Slette prosjekt?", message: "Er du sikker på at du vil slette dette prosjektet permanent?", onConfirm: () => { deleteProject(p.id).then(loadAllProjects); setConfirmModal(null); } });
                }} className="absolute top-6 right-6 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                <div className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-4 flex justify-between">
                   <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                   {evaluated > 0 && <span className="text-emerald-500">✔ Fullført</span>}
                </div>
                <h3 className="font-black text-xl text-slate-800 mb-2 truncate pr-6">{p.name}</h3>
                <div className="mt-6 space-y-4">
                   <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-widest">
                      <span>{total} kandidater</span>
                      <span>{Math.round(progress)}% vurdert</span>
                   </div>
                   <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                   </div>
                </div>
              </div>
            );
          })}
        </div>

        <SettingsModal 
          isOpen={showSettings} 
          onClose={() => setShowSettings(false)} 
          cacheCount={cacheCount} 
          onClearCache={handleClearCache} 
        />
        
        <Modal isOpen={!!confirmModal} {...(confirmModal || { title: "", message: "", onConfirm: () => {}, onCancel: () => {} })} onCancel={() => setConfirmModal(null)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
        <button onClick={() => setView('dashboard')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600">← Oversikt</button>
        <div className="flex gap-2">
          {steps.map(s => (
            <button key={s.id} onClick={() => setCurrentStep(s.id as any)} className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${currentStep === s.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-400 hover:bg-slate-50'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <button onClick={handleDeleteProject} className="text-[10px] font-black text-rose-300 uppercase tracking-widest hover:text-rose-600 transition-colors">Slett prosjekt ✕</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        {currentStep === 'setup' && (
          <div className="p-4 md:p-10 max-w-5xl mx-auto space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100">
                <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-[0.2em] mb-8">1. Oppgave / Fasit</h3>
                <input type="file" multiple onChange={e => e.target.files && handleTaskFileSelect(e.target.files)} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mb-8" />
                <div className="space-y-3">
                  {activeProject?.taskFiles?.map(f => (
                    <div key={f.id} className="text-xs font-bold bg-slate-50 p-4 rounded-2xl border flex justify-between items-center group">
                      <span className="truncate pr-4 text-slate-600">{f.fileName}</span>
                      <button onClick={() => updateActiveProject({ taskFiles: activeProject?.taskFiles.filter(i => i.id !== f.id) })} className="text-slate-200 group-hover:text-red-500 transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white p-10 rounded-[50px] shadow-sm border border-slate-100">
                <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-[0.2em] mb-8">2. Elevbesvarelser</h3>
                <input type="file" multiple onChange={e => e.target.files && handleCandidateFileSelect(e.target.files)} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 mb-8" />
                <div className="space-y-3">
                  {activeProject?.unprocessedPages?.map(p => (
                    <div key={p.id} className={`text-xs font-bold p-4 rounded-2xl border flex justify-between items-center group ${p.status === 'error' ? 'bg-rose-50 border-rose-200' : p.isCached ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-200'}`}>
                      <span className={`truncate pr-4 flex items-center gap-2 ${p.status === 'error' ? 'text-rose-700' : p.isCached ? 'text-indigo-700' : 'text-slate-400'}`}>
                        {p.status === 'error' && <span className="text-rose-500">⚠️</span>}
                        {p.isCached && <span className="mr-1">⚡</span>}
                        {p.fileName}
                      </span>
                      <div className="flex items-center gap-2">
                        {p.status === 'error' ? (
                          <>
                            <button onClick={() => handleRetryProcessing(p)} title="Prøv på nytt" className="bg-rose-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-rose-700 transition-colors">Retry</button>
                            <button onClick={() => handleRemoveUnprocessedPage(p.id)} className="text-rose-300 hover:text-rose-600 transition-colors p-1">✕</button>
                          </>
                        ) : (
                          <>
                            <span className={`text-[9px] px-3 py-1 rounded-full uppercase ${p.isCached ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                              {p.isCached ? 'Gjenbrukt' : (p.status === 'processing' ? 'Analyserer...' : 'Venter...')}
                            </span>
                            <button onClick={() => handleRemoveUnprocessedPage(p.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">✕</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {activeProject?.candidates.map(c => (
                    <div key={c.id} className="text-xs font-bold p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100/50 flex justify-between items-center group">
                      <div className="flex flex-col">
                        <span className="text-emerald-700 font-black">{c.name || `Kandidat ${c.id}`}</span>
                        <span className="text-[8px] text-emerald-500 uppercase">ID: {c.id}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[9px] bg-emerald-100 px-3 py-1 rounded-full text-emerald-700">{c.pages.length} sider</span>
                        <button onClick={() => handleRemoveCandidate(c.id)} className="text-emerald-200 hover:text-red-500 transition-colors p-1">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {currentStep === 'review' && (
          <div className="flex h-full no-print">
            <aside className="w-64 bg-white border-r overflow-y-auto p-6 hidden md:block sticky top-0 h-[calc(100vh-64px)]">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Kandidater</h4>
              <div className="space-y-2">
                <button onClick={() => setReviewCandidateId(null)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${!reviewCandidateId ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>Alle ({activeProject?.candidates.length})</button>
                {activeProject?.candidates.map(c => (
                  <button key={c.id} onClick={() => setReviewCandidateId(c.id)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex flex-col items-start ${reviewCandidateId === c.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <span className="truncate w-full">{c.name || c.id}</span>
                    <span className="text-[8px] opacity-50 uppercase tracking-widest">ID: {c.id}</span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="flex-1 p-4 md:p-10 space-y-10">
              <div className="max-w-4xl mx-auto space-y-10">
                {filteredCandidatesForReview.map(c => (
                  <div key={c.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden mb-12">
                    <div className="px-10 py-8 bg-slate-50 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                       <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-md">Navn</span>
                            <input 
                              type="text" 
                              value={c.name} 
                              onChange={(e) => handleCandidateNameChange(c.id, e.target.value)}
                              placeholder="Kandidatnavn..."
                              className="bg-transparent font-black text-2xl text-slate-800 border-none outline-none focus:ring-0 w-full hover:bg-slate-100/50 transition-colors p-1 rounded-lg"
                            />
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">System ID: {c.id}</span>
                            <div className="flex gap-2">{Object.keys(c.structuredAnswers?.tasks || {}).map(t => (<span key={t} className="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Oppg {t}</span>))}</div>
                          </div>
                       </div>
                    </div>
                    <div className="divide-y border-slate-50">
                       {c.pages.map(p => (
                         <div key={p.id} className="flex flex-col lg:flex-row h-auto lg:h-[400px]">
                            <div className="lg:w-1/2 bg-slate-900 border-r relative flex items-center justify-center p-4 min-h-[300px]">
                               <img src={p.imagePreview} className="max-h-full max-w-full object-contain" />
                               <div className="absolute top-4 left-4 bg-black/60 backdrop-blur text-white text-[9px] font-black px-3 py-1.5 rounded-xl uppercase">Side {p.pageNumber}</div>
                            </div>
                            <div className="lg:w-1/2 flex flex-col p-8 gap-6 overflow-hidden bg-white">
                               <textarea value={p.transcription} onChange={e => {
                                    const nc = activeProject!.candidates.map(cand => cand.id === c.id ? { ...cand, pages: cand.pages.map(page => page.id === p.id ? { ...page, transcription: e.target.value } : page) } : cand);
                                    updateActiveProject({ candidates: nc });
                                 }} className="flex-1 bg-slate-50 rounded-[24px] p-6 text-[11px] font-mono leading-relaxed border-none outline-none focus:ring-2 focus:ring-indigo-100 transition-all custom-scrollbar resize-none h-48 lg:h-full" />
                               <div className="h-24 overflow-y-auto text-[10px] text-indigo-500 bg-indigo-50/50 p-4 rounded-[20px] font-medium custom-scrollbar border border-indigo-100/30"><LatexRenderer content={p.transcription || ""} /></div>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {currentStep === 'rubric' && (
          <div className="p-4 md:p-10 max-w-6xl mx-auto space-y-10 no-print">
            {rubricStatus.loading ? (
              <div className="bg-white p-20 rounded-[60px] shadow-sm border border-slate-100 text-center animate-in fade-in zoom-in-95">
                <div className="flex justify-center mb-8"><Spinner size="w-12 h-12" /></div>
                <p className="text-slate-400 font-black italic uppercase tracking-widest text-xs">{rubricStatus.text}</p>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-[60px] shadow-sm border border-slate-100">
                <div className="flex justify-between items-end mb-12">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">{activeProject?.rubric?.title || "Settes opp..."}</h2>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mt-3">{activeProject?.rubric?.totalMaxPoints || 0} poeng totalt</p>
                  </div>
                  <button onClick={handleGenerateRubric} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">🔄 {activeProject?.rubric ? "Oppdater med elevarbeid" : "Opprett manual"}</button>
                </div>
                {activeProject?.rubric && (
                  <div className="overflow-hidden border border-slate-50 rounded-[35px]">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-10 py-6 w-32">Oppgave</th>
                          <th className="px-10 py-6">Kriterie & Feilkilder</th>
                          <th className="px-10 py-6 w-24 text-center">Poeng</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {activeProject?.rubric?.criteria.map((c, idx) => (
                          <React.Fragment key={idx}>
                            <tr className="border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => setEditingCriterionIndex(editingCriterionIndex === idx ? null : idx)}>
                              <td className="px-10 py-6 align-top">
                                <div className="space-y-2">
                                  <span className="font-black text-slate-900">{c.name}</span>
                                  <div className="bg-indigo-50 text-indigo-600 text-[9px] font-black px-2 py-1 rounded-md uppercase w-fit">{c.tema}</div>
                                </div>
                              </td>
                              <td className="px-10 py-6">
                                <div className="space-y-4">
                                  <div className="font-bold text-slate-700">{c.description}</div>
                                  {c.commonErrors && c.commonErrors.length > 0 && (
                                    <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl space-y-2">
                                      <h5 className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-2">Vanlige feilkilder / Misoppfatninger:</h5>
                                      <ul className="space-y-2">
                                        {c.commonErrors.map((err, eIdx) => (
                                          <li key={eIdx} className="text-xs text-rose-700 flex justify-between gap-4">
                                            <span>• {err.error}</span>
                                            <span className="font-black shrink-0 text-rose-400">-{err.deduction}p</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-2 pt-2">
                                     {activeProject.candidates
                                      .filter(cand => cand.status === 'evaluated')
                                      .map(cand => {
                                        const score = cand.evaluation?.taskBreakdown.find(t => t.taskName === c.name)?.score;
                                        if (score === undefined) return null;
                                        return (
                                          <div key={cand.id} title={cand.name || cand.id} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border ${score === c.maxPoints ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : score === 0 ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                                            {cand.name ? cand.name.split(' ')[0] : cand.id}: {score}p
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </td>
                              <td className="px-10 py-6 text-center align-top" onClick={e => e.stopPropagation()}>
                                <input type="number" className="w-16 text-center font-black text-indigo-600 bg-indigo-50/30 border-none rounded-xl py-1.5 focus:ring-1 focus:ring-indigo-200 outline-none" value={c.maxPoints} onChange={e => {
                                    const nc = [...activeProject!.rubric!.criteria];
                                    nc[idx].maxPoints = parseInt(e.target.value) || 0;
                                    updateActiveProject({ rubric: { ...activeProject!.rubric!, criteria: nc } });
                                }} />
                              </td>
                            </tr>
                            {editingCriterionIndex === idx && (
                              <tr className="bg-slate-50/20">
                                <td colSpan={3} className="px-12 py-10">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                      <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Løsningsforslag (Fasit)</h4>
                                        <textarea className="w-full h-56 bg-white border border-slate-200 rounded-[30px] p-8 text-xs leading-relaxed outline-none focus:border-indigo-200 transition-all custom-scrollbar shadow-inner" value={c.suggestedSolution} onChange={e => {
                                            const nc = [...activeProject!.rubric!.criteria];
                                            nc[idx].suggestedSolution = e.target.value;
                                            updateActiveProject({ rubric: { ...activeProject!.rubric!, criteria: nc } });
                                        }} />
                                      </div>
                                      <div className="p-8 bg-white rounded-[30px] border border-slate-100 text-xs custom-scrollbar h-56 overflow-y-auto shadow-sm mt-8">
                                        <LatexRenderer content={c.suggestedSolution} />
                                      </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {currentStep === 'results' && (
          <div className="p-4 md:p-10 max-w-6xl mx-auto space-y-10 pb-20 no-print">
            <div className="flex justify-between items-center no-print">
               <div className="flex bg-white p-1 rounded-2xl border shadow-sm">
                  <button onClick={() => setResultsSubView('individual')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${resultsSubView === 'individual' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Individuell</button>
                  <button onClick={() => setResultsSubView('group')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${resultsSubView === 'group' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Gruppestats</button>
                  <button onClick={() => setResultsSubView('heatmap')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${resultsSubView === 'heatmap' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Varmekart</button>
               </div>
               <div className="flex gap-4">
                  {resultsSubView === 'individual' && activeProject?.candidates.length! > 0 && (
                    <select className="bg-white border rounded-2xl px-6 py-3 text-sm font-black shadow-sm outline-none" value={selectedCandidateId || ''} onChange={e => setSelectedCandidateId(e.target.value)}>
                       <option value="">Velg kandidat</option>
                       {activeProject?.candidates.map(c => <option key={c.id} value={c.id}>{c.name || `ID: ${c.id}`}</option>)}
                    </select>
                  )}
                  <button onClick={performEvaluation} className="bg-white border-2 border-indigo-100 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-indigo-50 text-indigo-600 transition-all">🤖 Oppdater Vurdering</button>
                  <button onClick={() => window.print()} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">🖨️ Lag PDF Rapport</button>
               </div>
            </div>
            {resultsSubView === 'heatmap' && stats && (
              <div className="bg-white p-12 rounded-[50px] border shadow-sm overflow-x-auto animate-in fade-in zoom-in-95">
                <h3 className="text-xl font-black mb-10">Varmekart / Poengoversikt</h3>
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
                          return <td key={tn} className={`px-2 py-4 text-center font-bold text-xs transition-colors ${colorClass}`}>{pct === 1 ? '★' : (score !== undefined ? score.toLocaleString('no-NO') : '-')}</td>;
                        })}
                        <td className="px-6 py-4 text-right font-black text-indigo-700">{c.evaluation?.score || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {resultsSubView === 'group' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4">
                 <div className="bg-white p-12 rounded-[50px] border shadow-sm">
                    <h3 className="text-xl font-black mb-10">Oppgaveanalyse (%)</h3>
                    <div className="space-y-6">
                       {stats.allTaskNames.map(tn => {
                          const s = stats.taskStats[tn];
                          const pct = (s.total / s.max) * 100;
                          return (
                            <div key={tn} className="space-y-2">
                               <div className="flex justify-between text-[10px] font-black uppercase tracking-widest"><span className="text-slate-400">{tn} ({s.tema})</span><span className={pct > 70 ? 'text-emerald-500' : pct > 40 ? 'text-amber-500' : 'text-rose-500'}>{Math.round(pct)}%</span></div>
                                <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden"><div className={`h-full transition-all duration-1000 ${pct > 70 ? 'bg-emerald-500' : pct > 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }}></div></div>
                            </div>
                          );
                       })}
                    </div>
                 </div>
                 <div className="bg-white p-12 rounded-[50px] border shadow-sm flex flex-col justify-center items-center text-center">
                    <div className="text-[100px] font-black text-indigo-600 leading-none mb-4">{Math.round(stats.avgScore)}</div>
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] mb-10">Snittpoeng ({stats.evaluatedCount} vurdert)</div>
                 </div>
              </div>
            )}
            {resultsSubView === 'individual' && (
              <div className="animate-in fade-in slide-in-from-right-6 duration-700">
                 {selectedCandidateId && activeProject?.candidates.find(c => c.id === selectedCandidateId)?.evaluation ? (
                    <div className="bg-white p-16 md:p-24 rounded-[70px] border shadow-sm relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-50/30 rounded-full -translate-y-1/2 translate-x-1/2 -z-1" />
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10 mb-24">
                          <div>
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Elevvurdering</h4>
                             <h2 className="text-5xl font-black text-slate-900 leading-tight">{activeProject.candidates.find(c => c.id === selectedCandidateId)?.name || `Kandidat ${selectedCandidateId}`}</h2>
                             <div className="mt-6 flex items-center gap-3"><span className="bg-indigo-600 text-white px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100">Karakter {activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.grade}</span><span className="text-slate-200 font-black px-2">/</span><span className="text-slate-400 text-xs font-bold uppercase tracking-widest">{activeProject.rubric?.title}</span></div>
                          </div>
                          <div className="text-right"><div className="text-[120px] font-black text-indigo-700 leading-none tracking-tighter">{activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.score.toLocaleString('no-NO')}<span className="text-3xl text-slate-200 ml-4 font-normal">/ {activeProject.rubric?.totalMaxPoints}</span></div></div>
                       </div>
                       <div className="grid grid-cols-1 lg:grid-cols-12 gap-24">
                          <div className="lg:col-span-5 space-y-16">
                             <div className="border-l-4 border-indigo-600 pl-10 py-1"><h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-6">Tilbakemelding</h4><div className="text-2xl font-medium text-slate-700 leading-relaxed italic pr-4"><LatexRenderer content={activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.feedback || ''} /></div></div>
                             <div className="bg-slate-50/50 p-10 rounded-[40px] border border-slate-100">
                                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-8">Vekstpunkter</h4>
                                <ul className="space-y-6">{activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.vekstpunkter?.map((v, i) => (<li key={i} className="flex gap-5 items-start font-bold text-slate-700 text-lg"><span className="mt-2 w-2 h-2 rounded-full bg-indigo-400 shrink-0" /><LatexRenderer content={v} /></li>))}</ul>
                             </div>
                             <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-inner"><h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-12 text-center">Ferdighetsprofil</h4><RadarChart data={radarData} /></div>
                          </div>
                          <div className="lg:col-span-7">
                             <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-10 pl-6">Oppgavevisning</h4>
                             <div className="bg-white border border-slate-100 rounded-[45px] overflow-hidden shadow-sm">
                               <table className="w-full text-left border-collapse">
                                  <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400"><tr><th className="px-10 py-6 w-32">Oppgave</th><th className="px-10 py-6">Tema</th><th className="px-6 py-6 text-center w-20">Poeng</th><th className="px-10 py-6 w-24"></th></tr></thead>
                                  <tbody className="text-xs font-bold">
                                     {activeProject.candidates.find(c => c.id === selectedCandidateId)?.evaluation?.taskBreakdown.map((t, i) => (
                                       <tr key={i} className="border-b border-slate-50 group hover:bg-slate-50/30 transition-all">
                                          <td className="px-10 py-6 font-black text-slate-800 text-base">{t.taskName}</td>
                                          <td className="px-10 py-6"><div className="flex flex-col gap-1.5"><span className="text-indigo-400 font-black uppercase tracking-widest text-[8px]">{t.tema}</span><span className="text-slate-400 italic font-medium line-clamp-1">{t.comment}</span></div></td>
                                          <td className="px-6 py-6 text-center font-black text-indigo-600 text-lg">{t.score.toLocaleString('no-NO')}</td>
                                          <td className="px-10 py-6 text-right">{t.score === t.max && <span className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm">Full pott</span>}</td>
                                       </tr>
                                     ))}
                                  </tbody>
                               </table>
                             </div>
                          </div>
                       </div>
                    </div>
                 ) : (
                    <div className="p-40 text-center bg-white rounded-[70px] border border-dashed border-slate-200"><p className="text-slate-400 font-black italic uppercase tracking-widest text-xs">Velg en kandidat over for å se rapporten.</p></div>
                 )}
              </div>
            )}
          </div>
        )}
        
        {activeProject && (currentStep === 'results' || currentStep === 'rubric') && (
          <PrintReport project={activeProject} stats={stats} />
        )}
      </main>
      {processStatus.type && (<div className="fixed bottom-12 right-12 bg-slate-900 text-white p-10 rounded-[45px] shadow-2xl flex items-center gap-10 z-[100] border border-white/10 animate-in slide-in-from-right-12 no-print border-b-[8px] border-indigo-500"><Spinner color="text-indigo-400" size="w-6 h-6" /><div className="flex flex-col"><span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">PROSESSERER {processStatus.type}</span><span className="text-base font-bold text-slate-200 tracking-tight">{processStatus.statusText}</span></div></div>)}
      <Modal isOpen={!!confirmModal} {...(confirmModal || { title: "", message: "", onConfirm: () => {}, onCancel: () => {} })} onCancel={() => setConfirmModal(null)} />
    </div>
  );
};

export default App;
