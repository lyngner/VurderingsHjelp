
export interface TaskContent {
  subtasks: Record<string, string>; // Deloppgave -> Råtekst
}

export interface CandidateHierarchy {
  tasks: Record<string, TaskContent>; // Oppgave -> TaskContent
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
  pageNumber?: number;
  identifiedTasks?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  // Flag to indicate if the page results were retrieved from local cache
  isCached?: boolean;
}

export interface TaskEvaluation {
  taskName: string;
  score: number;
  max: number;
  tema: string;
  comment: string;
}

export interface Candidate {
  id: string;
  name: string; 
  pages: Page[];
  structuredAnswers?: CandidateHierarchy; // "Clean JSON" hierarkiet
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
  description: string;
  suggestedSolution: string;
  maxPoints: number;
  tema: string;
  commonErrors: CommonError[]; // Nytt felt for vanlige feil
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
}
