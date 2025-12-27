
import React, { useState, useEffect, useMemo } from 'react';
import { Project } from './types';
import { saveProject, getAllProjects, deleteProject as deleteProjectFromStorage } from './services/storageService';
import { useProjectProcessor } from './hooks/useProjectProcessor';

// Komponenter
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
  
  // Bruker den nye hooken for all tung logikk
  const {
    processingCount,
    rubricStatus,
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleEvaluateAll,
    handleGenerateRubric,
    updateActiveProject
  } = useProjectProcessor(activeProject, setActiveProject);

  const [selectedResultCandidateId, setSelectedResultCandidateId] = useState<string | null>(null);
  const [selectedReviewCandidateId, setSelectedReviewCandidateId] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState('');

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

  const handleDeleteProject = async (id: string) => {
    await deleteProjectFromStorage(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const filteredCandidates = useMemo(() => {
    if (!activeProject?.candidates) return [];
    return activeProject.candidates.filter(c => !reviewFilter || c.name.toLowerCase().includes(reviewFilter.toLowerCase()));
  }, [activeProject, reviewFilter]);

  if (view === 'dashboard') {
    return (
      <Dashboard 
        projects={projects} 
        onSelectProject={(p) => { setActiveProject(p); setView('editor'); }} 
        onCreateProject={createNewProject}
        onDeleteProject={handleDeleteProject}
      />
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
          {processingCount > 0 ? `Prosesserer ${processingCount} sider...` : rubricStatus.text}
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {activeProject && (
          <>
            {currentStep === 'setup' && <SetupStep activeProject={activeProject} isProcessing={processingCount > 0} rubricStatus={rubricStatus} handleTaskFileSelect={handleTaskFileSelect} handleGenerateRubric={() => handleGenerateRubric()} handleCandidateFileSelect={handleCandidateFileSelect} updateActiveProject={updateActiveProject} />}
            {currentStep === 'review' && <ReviewStep activeProject={activeProject} selectedReviewCandidateId={selectedReviewCandidateId} setSelectedReviewCandidateId={(id) => setSelectedReviewCandidateId(id)} reviewFilter={reviewFilter} setReviewFilter={setReviewFilter} filteredCandidates={filteredCandidates} currentReviewCandidate={activeProject.candidates.find(c => c.id === selectedReviewCandidateId) || null} rotatePage={(id) => {}} setActiveProject={setActiveProject} />}
            {currentStep === 'rubric' && <RubricStep activeProject={activeProject} handleGenerateRubric={() => handleGenerateRubric()} rubricStatus={rubricStatus} />}
            {currentStep === 'results' && <ResultsStep activeProject={activeProject} selectedResultCandidateId={selectedResultCandidateId} setSelectedResultCandidateId={setSelectedResultCandidateId} handleEvaluateAll={handleEvaluateAll} handleGenerateRubric={() => handleGenerateRubric()} rubricStatus={rubricStatus} />}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
