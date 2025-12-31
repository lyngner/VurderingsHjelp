
import React, { useState, useEffect, useMemo } from 'react';
import { Project, Candidate } from './types';
import { saveProject, getAllProjects, deleteProject as deleteProjectFromStorage, loadFullProject } from './services/storageService';
import { useProjectProcessor } from './hooks/useProjectProcessor';

import { Dashboard } from './components/Dashboard';
import { SetupStep } from './components/SetupStep';
import { ReviewStep } from './components/ReviewStep';
import { RubricStep } from './components/RubricStep';
import { ResultsStep } from './components/ResultsStep';

if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

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
  
  const {
    processingCount,
    batchTotal,
    batchCompleted,
    currentAction,
    rubricStatus,
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleEvaluateAll,
    handleGenerateRubric,
    handleRetryPage,
    handleSmartCleanup,
    updateActiveProject
  } = useProjectProcessor(activeProject, setActiveProject);

  const [selectedResultCandidateId, setSelectedResultCandidateId] = useState<string | null>(null);
  const [selectedReviewCandidateId, setSelectedReviewCandidateId] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState('');

  useEffect(() => {
    if (activeProject && activeProject.taskFiles.length > 0 && !activeProject.rubric && !rubricStatus.loading && processingCount === 0) {
      const timer = setTimeout(() => {
        handleGenerateRubric();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeProject?.taskFiles, activeProject?.rubric, rubricStatus.loading, processingCount]);

  useEffect(() => {
    getAllProjects().then(all => {
      setProjects(all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    });
  }, [activeProject, view]);

  useEffect(() => { 
    if (activeProject) saveProject(activeProject);
  }, [activeProject]);

  const createNewProject = () => {
    const newProj: Project = { 
      id: Math.random().toString(36).substring(7), 
      name: "Ny vurdering " + new Date().toLocaleDateString(), 
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

  const handleSelectProject = async (p: Project) => {
    const fullProject = await loadFullProject(p.id);
    if (fullProject) {
      setActiveProject(fullProject);
      setView('editor');
    }
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProjectFromStorage(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const handleRotatePage = (pageId: string) => {
    setActiveProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map(c => ({
          ...c,
          pages: c.pages.map(p => p.id === pageId ? { ...p, rotation: ((p.rotation || 0) + 90) % 360 } : p)
        }))
      };
    });
  };

  const handleDeletePage = (candidateId: string, pageId: string) => {
    setActiveProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map(c => {
          if (c.id !== candidateId) return c;
          const remainingPages = c.pages.filter(p => p.id !== pageId);
          return { ...c, pages: remainingPages };
        }).filter(c => c.pages.length > 0)
      };
    });
  };

  const handleUpdatePageNumber = (candidateId: string, pageId: string, newNum: number) => {
    setActiveProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map(c => {
          if (c.id !== candidateId) return c;
          return { ...c, pages: c.pages.map(p => p.id === pageId ? { ...p, pageNumber: newNum } : p) };
        })
      };
    });
  };

  const handleNavigateToCandidate = (id: string) => {
    setSelectedReviewCandidateId(id);
    setCurrentStep('review');
  };

  const filteredCandidates = useMemo(() => {
    if (!activeProject?.candidates) return [];
    let list = activeProject.candidates.filter(c => !reviewFilter || c.name.toLowerCase().includes(reviewFilter.toLowerCase()));
    return [...list].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aIsUnknown = aName.includes("ukjent");
      const bIsUnknown = bName.includes("ukjent");
      const aIsEmpty = a.pages.every(p => !p.transcription || p.transcription.includes("Ingen tekst"));
      const bIsEmpty = b.pages.every(p => !p.transcription || p.transcription.includes("Ingen tekst"));
      if ((aIsUnknown || aIsEmpty) && !(bIsUnknown || bIsEmpty)) return 1;
      if (!(aIsUnknown || aIsEmpty) && (bIsUnknown || bIsEmpty)) return -1;
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeProject, reviewFilter]);

  if (view === 'dashboard') {
    return (
      <Dashboard projects={projects} onSelectProject={handleSelectProject} onCreateProject={createNewProject} onDeleteProject={handleDeleteProject} />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
        <button onClick={() => setView('dashboard')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">← Oversikt</button>
        <div className="flex gap-2">{steps.map(s => (<button key={s.id} onClick={() => setCurrentStep(s.id as any)} className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${currentStep === s.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>{s.icon} {s.label}</button>))}</div>
        <div className="w-20"></div>
      </header>

      {(rubricStatus.loading || processingCount > 0) && (
        <div className="bg-indigo-600 text-white py-2 text-center text-[10px] font-black uppercase tracking-widest animate-pulse">
          {processingCount > 0 ? `Prosesserer ${processingCount} filer...` : rubricStatus.text}
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {activeProject && (
          <>
            {currentStep === 'setup' && (
              <SetupStep 
                activeProject={activeProject} 
                isProcessing={processingCount > 0} 
                batchTotal={batchTotal} 
                batchCompleted={batchCompleted} 
                currentAction={currentAction}
                rubricStatus={rubricStatus} 
                handleTaskFileSelect={handleTaskFileSelect} 
                handleGenerateRubric={() => handleGenerateRubric()} 
                handleCandidateFileSelect={handleCandidateFileSelect} 
                handleRetryPage={handleRetryPage} 
                updateActiveProject={updateActiveProject} 
                onNavigateToCandidate={handleNavigateToCandidate} 
              />
            )}
            {currentStep === 'review' && (
              <ReviewStep activeProject={activeProject} selectedReviewCandidateId={selectedReviewCandidateId} setSelectedReviewCandidateId={(id) => setSelectedReviewCandidateId(id)} reviewFilter={reviewFilter} setReviewFilter={setReviewFilter} filteredCandidates={filteredCandidates} currentReviewCandidate={activeProject.candidates.find(c => c.id === selectedReviewCandidateId) || null} rotatePage={handleRotatePage} deletePage={handleDeletePage} updatePageNumber={handleUpdatePageNumber} setActiveProject={setActiveProject} handleSmartCleanup={handleSmartCleanup} isCleaning={rubricStatus.loading} />
            )}
            {currentStep === 'rubric' && <RubricStep activeProject={activeProject} handleGenerateRubric={() => handleGenerateRubric()} rubricStatus={rubricStatus} updateActiveProject={updateActiveProject} />}
            {currentStep === 'results' && <ResultsStep activeProject={activeProject} selectedResultCandidateId={selectedResultCandidateId} setSelectedResultCandidateId={setSelectedResultCandidateId} handleEvaluateAll={handleEvaluateAll} handleGenerateRubric={() => handleGenerateRubric()} rubricStatus={rubricStatus} />}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
