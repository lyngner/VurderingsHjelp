
export interface Page {
  id: string;
  fileName: string;
  imagePreview: string;
  base64Data: string;
  mimeType: string;
  transcription?: string;
  candidateId?: string;
  pageNumber?: number;
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
  };
  status: 'pending' | 'processing' | 'completed' | 'evaluated';
}

export interface Rubric {
  title: string;
  criteria: {
    name: string;
    description: string;
    maxPoints: number;
  }[];
  totalMaxPoints: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  taskDescription: string;
  taskFiles: Page[]; // Selve prøven (bilder/skann)
  candidates: Candidate[];
  rubric: Rubric | null;
  status: 'draft' | 'analyzing' | 'reviewing' | 'completed';
}
