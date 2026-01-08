
export const SYSTEM_VERSION = "v8.9.24";

export interface IdentifiedTask {
  taskNumber: string;
  subTask: string;
}

export type PageLayout = 'A4_SINGLE' | 'A3_SPREAD';

export interface Page {
  id: string;
  fileName: string;
  imagePreview?: string;
  base64Data?: string;
  contentHash: string;
  mimeType: string;
  rawText?: string;
  transcription?: string;
  visualEvidence?: string; 
  candidateId?: string;
  part?: string;
  pageNumber?: number;
  layoutType?: PageLayout; 
  identifiedTasks?: IdentifiedTask[];
  status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
  statusLabel?: string;
  rotation?: number;
  isDigital?: boolean;
  attachedImages?: { data: string; mimeType: string }[];
}

export interface TaskEvaluation {
  taskName: string;
  taskNumber: string;
  subTask: string;
  part?: string;
  score: number;
  max: number;
  comment: string;
  tema?: string;
  reasoning?: string; // v8.1.8: Internal reasoning field for CoT
}

export interface Candidate {
  id: string;
  projectId: string;
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
  taskNumber: string;
  subTask: string;
  part?: string;
  description: string;
  suggestedSolution: string;
  commonErrors?: string; 
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
  candidateCount?: number;
  evaluatedCount?: number; 
  taskDescription: string;
  taskFiles: Page[];
  candidates: Candidate[];
  unprocessedPages?: Page[];
  rubric: Rubric | null;
  status: 'draft' | 'processing' | 'review' | 'completed';
}
