
import { useState } from 'react';
import { Project, Page, Candidate } from '../types';
import { processFileToImages } from '../services/fileService';
import { 
  transcribeAndAnalyzeImage, 
  analyzeTextContent, 
  generateRubricFromTaskAndSamples, 
  evaluateCandidate 
} from '../services/geminiService';

export const useProjectProcessor = (
  activeProject: Project | null, 
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>
) => {
  const [processingCount, setProcessingCount] = useState(0);
  const [rubricStatus, setRubricStatus] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });

  const updateActiveProject = (updates: Partial<Project>) => {
    setActiveProject(prev => prev ? { ...prev, ...updates, updatedAt: Date.now() } : null);
  };

  const handleGenerateRubric = async (overrideProject?: Project) => {
    const proj = overrideProject || activeProject;
    if (!proj || (proj.taskFiles?.length || 0) === 0) return;
    setRubricStatus({ loading: true, text: 'Genererer rettemanual...' });
    try {
      const rubric = await generateRubricFromTaskAndSamples(proj.taskFiles, "", []);
      updateActiveProject({ rubric });
    } catch (e) {
      console.error(e);
    } finally {
      setRubricStatus({ loading: false, text: '' });
    }
  };

  const integratePageResult = (page: Page, results: any) => {
    setActiveProject(prev => {
      if (!prev) return null;
      let cands = [...(prev.candidates || [])];
      const resArr = Array.isArray(results) ? results : [results];
      resArr.forEach((res: any) => {
        const cId = String(res.candidateId || "Ukjent");
        let candIndex = cands.findIndex(c => c.id === cId);
        const newPage: Page = { ...page, candidateId: cId, part: res.part, pageNumber: res.pageNumber, transcription: res.fullText || page.transcription, status: 'completed' };
        if (candIndex === -1) {
          cands.push({ id: cId, name: `Kandidat ${cId}`, status: 'completed', pages: [newPage] });
        } else {
          cands[candIndex] = { ...cands[candIndex], pages: [...cands[candIndex].pages, newPage] };
        }
      });
      return { ...prev, candidates: cands, unprocessedPages: (prev.unprocessedPages || []).filter(p => p.id !== page.id) };
    });
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
      await handleGenerateRubric(updatedProject);
      
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
    for (const file of fileList) {
      const pages = await processFileToImages(file);
      allNewPages = [...allNewPages, ...pages];
    }
    
    updateActiveProject({ unprocessedPages: [...(activeProject.unprocessedPages || []), ...allNewPages] });
    setProcessingCount(prev => prev + allNewPages.length);

    allNewPages.forEach(async (page) => {
      try {
        const res = page.mimeType === 'text/plain' ? await analyzeTextContent(page.transcription!) : await transcribeAndAnalyzeImage(page);
        integratePageResult(page, res);
      } catch (e) {
        console.error(e);
      } finally {
        setProcessingCount(prev => Math.max(0, prev - 1));
      }
    });
  };

  const handleEvaluateAll = async () => {
    if (!activeProject?.rubric) return;
    setRubricStatus({ loading: true, text: 'Vurderer besvarelser...' });
    try {
      const cands = [...(activeProject.candidates || [])];
      for (let i = 0; i < cands.length; i++) {
        const evalRes = await evaluateCandidate(cands[i], activeProject.rubric, "");
        cands[i] = { ...cands[i], evaluation: evalRes, status: 'evaluated' };
        setActiveProject(prev => prev ? { ...prev, candidates: [...cands] } : null);
      }
    } catch (e) { console.error(e); } finally { setRubricStatus({ loading: false, text: '' }); }
  };

  return {
    processingCount,
    rubricStatus,
    handleTaskFileSelect,
    handleCandidateFileSelect,
    handleEvaluateAll,
    handleGenerateRubric,
    updateActiveProject
  };
};
