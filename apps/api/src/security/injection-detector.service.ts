import { Injectable, OnModuleInit } from '@nestjs/common';
import { RetrievalService } from '../retrieval/retrieval.service';

export interface InjectionCheckResult {
  blocked: boolean;
  injectionAttempt: boolean;
  cohortViolation: boolean;
  reason?: string;
}

const INJECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i, reason: 'instruction_override' },
  { pattern: /disregard\s+(your\s+)?(rules|instructions|guidelines)/i, reason: 'instruction_override' },
  { pattern: /you\s+are\s+now\s+/i, reason: 'role_override' },
  { pattern: /(show|reveal|print|display)\s+(the\s+)?(system\s+)?prompt/i, reason: 'prompt_exfiltration' },
  { pattern: /what\s+(are|is)\s+your\s+(system\s+)?(instructions|prompt)/i, reason: 'prompt_exfiltration' },
  { pattern: /(list|enumerate|show)\s+(all\s+)?patients/i, reason: 'enumeration' },
  { pattern: /every\s+patient\s+in\s+(group\s+)?[ab]/i, reason: 'enumeration' },
  { pattern: /patients?\s+in\s+(the\s+)?(other\s+)?group/i, reason: 'cross_group' },
  { pattern: /(access|retrieve|get)\s+.*group\s+[ab]/i, reason: 'cross_group' },
  { pattern: /OPENAI_API_KEY|DATABASE_URL|process\.env/i, reason: 'env_exfiltration' },
  { pattern: /sudo\s+mode|developer\s+mode|jailbreak/i, reason: 'jailbreak' },
];

@Injectable()
export class InjectionDetectorService implements OnModuleInit {
  private crossGroupNames: Map<string, string> = new Map();

  constructor(private readonly retrieval: RetrievalService) {}

  async onModuleInit() {
    const patients = await this.retrieval.getAllPatientNames();
    for (const p of patients) {
      this.crossGroupNames.set(p.name.toLowerCase(), p.group);
    }
  }

  async check(
    message: string,
    sessionCohort: string,
  ): Promise<InjectionCheckResult> {
    for (const { pattern, reason } of INJECTION_PATTERNS) {
      if (pattern.test(message)) {
        const cohortViolation = reason === 'cross_group' || reason === 'enumeration';
        return {
          blocked: true,
          injectionAttempt: true,
          cohortViolation,
          reason,
        };
      }
    }

    const lower = message.toLowerCase();
    for (const [name, group] of this.crossGroupNames.entries()) {
      if (lower.includes(name) && group !== sessionCohort) {
        return {
          blocked: true,
          injectionAttempt: true,
          cohortViolation: true,
          reason: 'cross_group_patient_reference',
        };
      }
    }

    const mentionsOtherGroup =
      (sessionCohort === 'A' && /\bgroup\s+b\b/i.test(message)) ||
      (sessionCohort === 'B' && /\bgroup\s+a\b/i.test(message));

    if (mentionsOtherGroup) {
      return {
        blocked: true,
        injectionAttempt: true,
        cohortViolation: true,
        reason: 'explicit_other_group',
      };
    }

    const otherCohortHit = await this.retrieval.findPatientInOtherCohort(
      message,
      sessionCohort,
    );
    if (otherCohortHit) {
      const inSessionCohort = await this.retrieval.resolvePatient(message, sessionCohort);
      if (!inSessionCohort.match) {
        return {
          blocked: true,
          injectionAttempt: true,
          cohortViolation: true,
          reason: 'cross_cohort_patient_only',
        };
      }
    }

    return { blocked: false, injectionAttempt: false, cohortViolation: false };
  }
}
