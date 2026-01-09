
import React, { useState, useEffect, useMemo } from 'react';
import { Project, Candidate, IdentifiedTask } from './types';
import { saveProject, getAllProjects, deleteProject as deleteProjectFromStorage, loadFullProject, saveCandidate, deleteMedia, deleteCandidate } from './services/storageService';
import { useProjectProcessor } from './hooks/useProjectProcessor';

import { Dashboard } from './components/Dashboard';
import { SetupStep } from './components/SetupStep';
import { ReviewStep } from './components/ReviewStep';
import { RubricStep } from './components/RubricStep';
import { ResultsStep } from './components/ResultsStep';

if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// v8.9.36: Renamed 'Oppsett' to 'Innlasting' and reordered steps
const steps = [
  { id: 'setup', label: 'Innlasting', icon: '📥' },
  { id: 'rubric', label: 'Rettemanual', icon: '📋' },
  { id: 'review', label: 'Kontroll', icon: '🔍' },
  { id: 'results', label: 'Resultat', icon: '🏆' },
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
    activePageId,
    rubricStatus,
    useFlashFallback,
    setUseFlashFallback,
    etaSeconds,
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleEvaluateAll,
    handleBatchEvaluation,
    handleEvaluateCandidate,
    handleGenerateRubric,
    handleRegenerateCriterion,
    handleRegeneratePage,
    handleRetryPage,
    handleSmartCleanup,
    updateActiveProject,
    handleSkipFile,
    handleRetryFailed,
    handleDeleteUnprocessedPage
  } = useProjectProcessor(activeProject, setActiveProject);

  const [selectedResultCandidateId, setSelectedResultCandidateId] = useState<string | null>(null);
  const [selectedReviewCandidateId, setSelectedReviewCandidateId] = useState<string | null>(null);
  const [jumpToTask, setJumpToTask] = useState<{ id: string, part: 1 | 2 } | null>(null);
  const [reviewFilter, setReviewFilter] = useState('');

  // Auto-trigger logic moved to useProjectProcessor in v8.9.44

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
    if (activeProject && activeProject.id === id) {
      setActiveProject(null);
    }
    await deleteProjectFromStorage(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const handleRenameProject = async (id: string, newName: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    const updated = { ...project, name: newName, updatedAt: Date.now() };
    // saveProject handles updates to metadata store without overwriting candidates if candidates array is missing/empty in the object passed
    await saveProject(updated);
    setProjects(prev => prev.map(p => p.id === id ? updated : p).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  };

  const handleRotatePage = (pageId: string) => {
    setActiveProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map(c => {
          if (!c.pages.some(p => p.id === pageId)) return c;
          const updated = {
            ...c,
            pages: c.pages.map(p => p.id === pageId ? { ...p, rotation: ((p.rotation || 0) + 90) % 360 } : p)
          };
          saveCandidate(updated);
          return updated;
        })
      };
    });
  };

  const handleDeletePage = async (candidateId: string, pageId: string) => {
    await deleteMedia(pageId);
    setActiveProject(prev => {
      if (!prev) return null;
      const updatedCandidates = prev.candidates.map(c => {
        if (c.id !== candidateId) return c;
        const remainingPages = c.pages.filter(p => p.id !== pageId);
        if (remainingPages.length === 0) return null;
        const updatedCand = { ...c, pages: remainingPages };
        return updatedCand;
      }).filter((c): c is Candidate => c !== null);
      return { ...prev, candidates: updatedCandidates };
    });
  };

  const handleUpdatePageNumber = (candidateId: string, pageId: string, newNum: number) => {
    setActiveProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map(c => {
          if (c.id !== candidateId) return c;
          const updated = { ...c, pages: c.pages.map(p => p.id === pageId ? { ...p, pageNumber: newNum } : p) };
          saveCandidate(updated);
          return updated;
        })
      };
    });
  };

  const handleUpdatePageTasks = (candidateId: string, pageId: string, taskString: string) => {
    const tasks: IdentifiedTask[] = taskString.split(/,| /).map(s => s.trim()).filter(s => s.length > 0).map(s => {
      const match = s.match(/^(\d+)([a-zA-Z]*)$/);
      if (match) {
        return { taskNumber: match[1], subTask: match[2].toLowerCase() };
      }
      return null;
    }).filter((t): t is IdentifiedTask => t !== null);

    setActiveProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map(c => {
          if (c.id !== candidateId) return c;
          const updated = { ...c, pages: c.pages.map(p => p.id === pageId ? { ...p, identifiedTasks: tasks } : p) };
          saveCandidate(updated);
          return updated;
        })
      };
    });
  };

  const handleNavigateToCandidate = (id: string) => {
    setSelectedReviewCandidateId(id);
    setCurrentStep('review');
  };

  const handleNavigateToTask = (candidateId: string, taskId: string, part: 1 | 2) => {
    setSelectedReviewCandidateId(candidateId);
    setJumpToTask({ id: taskId, part });
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
      if (aIsUnknown && !bIsUnknown) return 1;
      if (!aIsUnknown && bIsUnknown) return -1;
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeProject, reviewFilter]);

  const openKeySelector = async () => {
    if ((window as any).aistudio && typeof (window as any).aistudio.openSelectKey === 'function') {
      await (window as any).aistudio.openSelectKey();
    } else {
      window.open('https://ai.google.dev/gemini-api/docs/billing', '_blank');
    }
  };

  if (view === 'dashboard') {
    return (
      <Dashboard 
        projects={projects} 
        onSelectProject={handleSelectProject} 
        onCreateProject={createNewProject} 
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
        <button onClick={() => setView('dashboard')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">← Oversikt</button>
        <div className="flex gap-2">{steps.map(s => (<button key={s.id} onClick={() => setCurrentStep(s.id as any)} className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${currentStep === s.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>{s.icon} {s.label}</button>))}</div>
        <div className="w-8"></div> 
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
                activePageId={activePageId}
                rubricStatus={rubricStatus} 
                useFlashFallback={useFlashFallback}
                setUseFlashFallback={setUseFlashFallback}
                etaSeconds={etaSeconds}
                handleTaskFileSelect={handleTaskFileSelect} 
                handleGenerateRubric={() => handleGenerateRubric()} 
                handleCandidateFileSelect={handleCandidateFileSelect} 
                handleRetryPage={handleRetryPage} 
                updateActiveProject={updateActiveProject} 
                onNavigateToCandidate={handleNavigateToCandidate} 
                handleSkipFile={handleSkipFile}
                handleRetryFailed={handleRetryFailed}
                handleDeleteUnprocessedPage={handleDeleteUnprocessedPage}
              />
            )}
            {currentStep === 'review' && (
              <ReviewStep 
                activeProject={activeProject} 
                selectedReviewCandidateId={selectedReviewCandidateId} 
                setSelectedReviewCandidateId={(id) => setSelectedReviewCandidateId(id)} 
                reviewFilter={reviewFilter} 
                setReviewFilter={setReviewFilter} 
                filteredCandidates={filteredCandidates} 
                currentReviewCandidate={activeProject.candidates.find(c => c.id === selectedReviewCandidateId) || null} 
                rotatePage={handleRotatePage} 
                deletePage={handleDeletePage} 
                updatePageNumber={handleUpdatePageNumber} 
                updatePageTasks={handleUpdatePageTasks}
                setActiveProject={setActiveProject} 
                handleSmartCleanup={handleSmartCleanup} 
                isCleaning={rubricStatus.loading} 
                handleRegeneratePage={handleRegeneratePage}
                initialTaskFilter={jumpToTask} 
              />
            )}
            {currentStep === 'rubric' && <RubricStep activeProject={activeProject} handleGenerateRubric={() => handleGenerateRubric()} rubricStatus={rubricStatus} updateActiveProject={updateActiveProject} handleRegenerateCriterion={handleRegenerateCriterion} />}
            {currentStep === 'results' && (
              <ResultsStep 
                activeProject={activeProject} 
                selectedResultCandidateId={selectedResultCandidateId} 
                setSelectedResultCandidateId={setSelectedResultCandidateId} 
                handleEvaluateAll={handleEvaluateAll} 
                handleBatchEvaluation={handleBatchEvaluation}
                handleEvaluateCandidate={handleEvaluateCandidate} 
                handleGenerateRubric={() => handleGenerateRubric()} 
                rubricStatus={rubricStatus}
                onNavigateToReview={handleNavigateToCandidate}
                onNavigateToTask={handleNavigateToTask}
                updateActiveProject={updateActiveProject}
                progress={{
                    batchTotal,
                    batchCompleted,
                    currentAction,
                    etaSeconds
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
