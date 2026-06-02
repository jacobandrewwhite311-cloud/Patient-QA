export type Cohort = 'A' | 'B';
export type ExperimentVariant = 'A' | 'B';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface Citation {
  table: string;
  record_id: string;
}

export interface RetrievedRecord {
  table: string;
  record_id: string;
  data: Record<string, unknown>;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  confidence: ConfidenceLevel;
  request_id?: string;
  ambiguous?: boolean;
  matches?: Array<{ patient_id: string; first_name: string; last_name: string }>;
}

export interface JwtPayload {
  cohort: Cohort;
  sub: string;
}

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  'I cannot find a matching patient in your cohort, or I cannot answer this question based on the available records.';

export const SAFE_SECURITY_RESPONSE =
  'Your request was blocked for security reasons. Please ask a question about a specific patient in your assigned cohort.';
