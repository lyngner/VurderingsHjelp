
export interface Page {
  id: string;
  fileName: string;
  imagePreview: string;
  base64Data: string;
  mimeType: string;
  transcription?: string;
  candidateId?: string;
  pageNumber?: number;
  identifiedTasks?: string[];
  drawings?: string[];
  illegibleSegments?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface Candidate {
  id: string;
  name: string; 
  pages: Page[];
  combinedTranscription?: string;
  evaluation?: {
    grade: string;
    feedback: string;
    score: number;
    vekstpunkter?: string[];
    taskBreakdown?: { 
      taskName: string; 
      score: number; 
      max: number; 
      tema?: string; 
      comment: string 
    }[];
  };
  status: 'pending' | 'processing' | 'completed' | 'evaluated';
}

export interface RubricCriterion {
  name: string;
  description: string;
  suggestedSolution: string; // Flyttet hit for å vises sammen med kriteriene
  maxPoints: number;
  tema?: string;
  commonMistakes: {
    mistake: string;
    deduction: number;
    explanation: string;
  }[];
}

export interface Rubric {
  title: string;
  criteria: RubricCriterion[];
  totalMaxPoints: number;
  overview?: string; // Valgfri overordnet tekst
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  taskDescription: string;
  taskFiles: Page[];
  candidates: Candidate[];
  rubric: Rubric | null;
  status: 'draft' | 'analyzing' | 'reviewing' | 'completed';
}
