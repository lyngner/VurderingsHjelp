
export interface TaskContent {
  subtasks: Record<string, string>; // Deloppgave -> Råtekst
}

export interface CandidateHierarchy {
  parts: Record<string, Record<string, TaskContent>>; // Del (f.eks "Del 1") -> Oppgave -> TaskContent
}

export interface Page {
  id: string;
  fileName: string;
  imagePreview: string;
  base64Data: string;
  contentHash: string;
  mimeType: string;
  transcription?: string;
  candidateId?: string;
  part?: string; // F.eks. "Del 1" eller "Del 2"
  pageNumber?: number;
  identifiedTasks?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  isCached?: boolean;
  rotation?: number; // 0, 90, 180, 270 grader
  zoom?: number; // Zoom-faktor (1.0 = normal)
}

export interface TaskEvaluation {
  taskName: string;
  part: string; // Hvilken del oppgaven tilhører
  score: number;
  max: number;
  tema: string;
  comment: string;
}

export interface Candidate {
  id: string;
  name: string; 
  pages: Page[];
  structuredAnswers?: CandidateHierarchy;
  evaluation?: {
    grade: string;
    feedback: string;
    score: number;
    vekstpunkter?: string[];
    taskBreakdown: TaskEvaluation[];
  };
  status: 'pending' | 'processing' | 'completed' | 'evaluated';
}

export interface CommonError {
  error: string;
  deduction: number;
  frequency_observation: string;
}

export interface RubricCriterion {
  name: string;
  part: string; // Hvilken del kriteriet tilhører
  description: string;
  suggestedSolution: string;
  maxPoints: number;
  tema: string;
  commonErrors: CommonError[];
}

export interface Rubric {
  title: string;
  criteria: RubricCriterion[];
  totalMaxPoints: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  taskDescription: string;
  taskFiles: Page[];
  candidates: Candidate[];
  unprocessedPages?: Page[];
  rubric: Rubric | null;
  status: 'draft' | 'processing' | 'review' | 'completed';
  // Metadata for oversikt
  totalTasks?: number;
  totalParts?: number;
}
