
export interface Page {
  id: string;
  fileName: string;
  imagePreview: string;
  base64Data: string;
  contentHash: string;
  mimeType: string;
  transcription?: string;
  candidateId?: string;
  part?: string;
  pageNumber?: number;
  identifiedTasks?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  rotation?: number;
}

export interface TaskEvaluation {
  taskName: string;
  part?: string;
  score: number;
  max: number;
  comment: string;
  tema?: string;
}

export interface Candidate {
  id: string;
  name: string; 
  pages: Page[];
  evaluation?: {
    grade: string;
    feedback: string;
    score: number;
    vekstpunkter?: string[];
    taskBreakdown: TaskEvaluation[];
  };
  status: 'pending' | 'processing' | 'completed' | 'evaluated';
}

export interface RubricCriterion {
  name: string;
  part?: string;
  description: string;
  suggestedSolution: string;
  commonErrors?: string; // Lagt til for vanlige feil og poenggiving
  maxPoints: number;
  tema?: string;
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
