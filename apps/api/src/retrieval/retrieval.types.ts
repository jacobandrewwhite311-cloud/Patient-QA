export interface PatientMatch {
  patientId: string;
  matchType: 'uuid' | 'full_name' | 'partial_name';
  displayName: string;
}

export interface ResolvePatientResult {
  match: PatientMatch | null;
  ambiguous: boolean;
  candidates?: PatientMatch[];
}

export interface RetrievedRecord {
  table: string;
  recordId: string;
  patientId: string;
  summaryText: string;
  raw: Record<string, unknown>;
}
