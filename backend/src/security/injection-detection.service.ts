import { Injectable } from '@nestjs/common';

export interface InjectionDetectionResult {
  detected: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  eventType: string;
  matchedPattern?: string;
}

const HIGH_SEVERITY_PATTERNS: Array<{ pattern: RegExp; eventType: string }> = [
  { pattern: /what\s+patients\s+exist\s+in\s+group\s+b/i, eventType: 'cross_cohort_enumeration' },
  { pattern: /what\s+patients\s+exist\s+in\s+group\s+a/i, eventType: 'cross_cohort_enumeration' },
  { pattern: /patients\s+in\s+(?:group|cohort)\s+[ab]/i, eventType: 'cross_cohort_enumeration' },
  { pattern: /show\s+(?:all\s+)?patients\s+in\s+(?:group|cohort)\s+[ab]/i, eventType: 'cross_cohort_access' },
  { pattern: /reveal\s+prompt|show\s+system\s+prompt|show\s+prompt/i, eventType: 'prompt_extraction' },
  { pattern: /show\s+environment\s+variables?|reveal\s+secrets?|give\s+me\s+secrets?/i, eventType: 'environment_access' },
  { pattern: /dump\s+database|list\s+all\s+patients|show\s+all\s+patients/i, eventType: 'database_enumeration' },
];

const MEDIUM_SEVERITY_PATTERNS: Array<{ pattern: RegExp; eventType: string }> = [
  { pattern: /ignore\s+previous\s+instructions/i, eventType: 'prompt_injection' },
  { pattern: /disregard\s+(?:all\s+)?(?:prior|previous)\s+instructions/i, eventType: 'prompt_injection' },
  { pattern: /override\s+system/i, eventType: 'prompt_injection' },
];

@Injectable()
export class InjectionDetectionService {
  detect(message: string, activeCohort: string): InjectionDetectionResult {
    for (const { pattern, eventType } of HIGH_SEVERITY_PATTERNS) {
      if (pattern.test(message)) {
        return {
          detected: true,
          severity: 'HIGH',
          eventType,
          matchedPattern: pattern.source,
        };
      }
    }

    const crossCohortPattern = new RegExp(
      `(?:group|cohort)\\s+(?!${activeCohort}\\b)[AB]\\b`,
      'i',
    );
    if (crossCohortPattern.test(message)) {
      return {
        detected: true,
        severity: 'HIGH',
        eventType: 'cross_cohort_attempt',
        matchedPattern: crossCohortPattern.source,
      };
    }

    for (const { pattern, eventType } of MEDIUM_SEVERITY_PATTERNS) {
      if (pattern.test(message)) {
        return {
          detected: true,
          severity: 'MEDIUM',
          eventType,
          matchedPattern: pattern.source,
        };
      }
    }

    return { detected: false, severity: 'LOW', eventType: 'none' };
  }
}
