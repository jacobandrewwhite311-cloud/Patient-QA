export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface Citation {
  table: string;
  recordId: string;
  excerpt: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  confidence: ConfidenceLevel;
  meta?: {
    patientId?: string;
    variant: string;
    blocked?: boolean;
    reason?: string;
  };
}

export interface LlmStructuredAnswer {
  answer: string;
  citations: Citation[];
  confidence: ConfidenceLevel;
}
