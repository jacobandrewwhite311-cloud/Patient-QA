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

export type ChatResponseStatus = 'answered' | 'blocked' | 'not_found' | 'ambiguous';

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  confidence: ConfidenceLevel;
  request_id?: string;
  ambiguous?: boolean;
  matches?: Array<{ patient_id: string; first_name: string; last_name: string }>;
  /** Classification of the response, independent of (AI-rephrased) answer text. */
  status?: ChatResponseStatus;
}

export interface JwtPayload {
  cohort: Cohort;
  sub: string;
}

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  'I cannot find a matching patient in your cohort, or I cannot answer this question based on the available records.';

export const CANNOT_DETERMINE_PATIENT_MESSAGE =
  'I cannot determine which patient you are referring to. Please specify a patient by full name or ID.';

export const SAFE_SECURITY_RESPONSE =
  'Request denied. Access is restricted to authorized patient records within the active cohort.';
