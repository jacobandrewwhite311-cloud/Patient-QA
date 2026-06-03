import { Injectable } from '@nestjs/common';
import { Cohort } from '../common/types';

@Injectable()
export class SessionContextService {
  private readonly lastPatientBySession = new Map<string, string>();

  private sessionKey(sessionId: string, cohort: Cohort): string {
    return `${sessionId}:${cohort}`;
  }

  getLastPatientId(sessionId: string, cohort: Cohort): string | null {
    return this.lastPatientBySession.get(this.sessionKey(sessionId, cohort)) ?? null;
  }

  setLastPatientId(sessionId: string, cohort: Cohort, patientId: string): void {
    this.lastPatientBySession.set(this.sessionKey(sessionId, cohort), patientId);
  }

  clearLastPatientId(sessionId: string, cohort: Cohort): void {
    this.lastPatientBySession.delete(this.sessionKey(sessionId, cohort));
  }
}
