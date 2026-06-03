import { Injectable } from '@nestjs/common';
import { PatientRepository } from './patient.repository';
import { SessionContextService } from './session-context.service';
import { Cohort } from '../common/types';

export interface PatientMatch {
  patientId: string;
  firstName: string;
  lastName: string;
  cohort: Cohort;
}

export type ResolutionMethod =
  | 'explicit_id'
  | 'explicit_full_name'
  | 'descriptive_attributes'
  | 'session_context'
  | 'safe_fallback';

export interface PatientResolutionResult {
  status: 'resolved' | 'ambiguous' | 'not_found';
  patient?: PatientMatch;
  matches?: PatientMatch[];
  method?: ResolutionMethod;
}

export interface PatientResolutionContext {
  sessionId: string;
  sessionLastPatientId?: string | null;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'about',
  'are',
  'for',
  'give',
  'how',
  'is',
  'me',
  'patient',
  'show',
  'tell',
  'the',
  'their',
  'they',
  'what',
  'who',
  'with',
  'first',
  'last',
  'name',
]);

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Patient Resolver Agent — resolves a user question to a cohort-scoped patient ID.
 *
 * User Question
 *   ↓
 * Patient Resolver Agent (priority order)
 *   1. Explicit patient ID
 *   2. Explicit full name
 *   3. Descriptive attributes (gender, DOB, status, clinical keywords, partial names)
 *   4. Session last patient
 *   5. Safe fallback
 *   ↓
 * Resolved Patient ID → Retrieval Layer → LLM Answer → Citations
 */
@Injectable()
export class PatientResolverService {
  constructor(
    private readonly patientRepository: PatientRepository,
    private readonly sessionContext: SessionContextService,
  ) {}

  async resolve(
    query: string,
    cohort: Cohort,
    context: PatientResolutionContext,
  ): Promise<PatientResolutionResult> {
    const normalized = query.trim();
    const sessionLastPatientId =
      context.sessionLastPatientId ??
      this.sessionContext.getLastPatientId(context.sessionId, cohort);

    const byId = await this.resolveByExplicitId(normalized, cohort);
    if (byId !== null) return byId;

    const byFullName = await this.resolveByExplicitFullName(normalized, cohort);
    if (byFullName !== null) return byFullName;

    const byAttributes = await this.resolveByDescriptiveAttributes(normalized, cohort);
    if (byAttributes !== null) return byAttributes;

    const bySession = await this.resolveBySessionContext(sessionLastPatientId, cohort);
    if (bySession !== null) return bySession;

    return { status: 'not_found', method: 'safe_fallback' };
  }

  /** Priority 1: explicit patient UUID in the query. */
  private async resolveByExplicitId(
    query: string,
    cohort: Cohort,
  ): Promise<PatientResolutionResult | null> {
    const uuidMatch = query.match(UUID_REGEX);
    if (!uuidMatch) return null;

    const patient = await this.patientRepository.findByIdAndCohort(uuidMatch[0], cohort);
    if (!patient) {
      return { status: 'not_found', method: 'explicit_id' };
    }
    return {
      status: 'resolved',
      patient: this.toMatch(patient),
      method: 'explicit_id',
    };
  }

  /** Priority 2: explicit first + last name (both required). */
  private async resolveByExplicitFullName(
    query: string,
    cohort: Cohort,
  ): Promise<PatientResolutionResult | null> {
    const candidates = this.extractExplicitFullNameCandidates(query);
    if (candidates.length === 0) return null;

    for (const [firstName, lastName] of candidates) {
      const matches = await this.patientRepository.findByFullNameAndCohort(
        firstName,
        lastName,
        cohort,
      );
      if (matches.length > 0) {
        return this.withMethod(this.fromMatches(matches), 'explicit_full_name');
      }
    }

    return { status: 'not_found', method: 'explicit_full_name' };
  }

  private extractExplicitFullNameCandidates(query: string): Array<[string, string]> {
    const candidates: Array<[string, string]> = [];
    const seen = new Set<string>();

    const addCandidate = (firstName: string, lastName: string) => {
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
      if (seen.has(key)) return;
      if (STOPWORDS.has(firstName.toLowerCase()) || STOPWORDS.has(lastName.toLowerCase())) return;
      seen.add(key);
      candidates.push([firstName, lastName]);
    };

    const explicitLabel = query.match(
      /(?:full\s+name|patient\s+name)\s+([A-Za-z][A-Za-z'-]+)\s+([A-Za-z][A-Za-z'-]+)/i,
    );
    if (explicitLabel) addCandidate(explicitLabel[1], explicitLabel[2]);

    for (const match of query.matchAll(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g)) {
      addCandidate(match[1], match[2]);
    }

    for (const match of query.matchAll(/\b([A-Za-z][A-Za-z'-]+)\s+([A-Za-z][A-Za-z'-]+)\b/g)) {
      addCandidate(match[1], match[2]);
    }

    return candidates;
  }

  /** Priority 3: gender, DOB, status, clinical keywords, or partial name signals. */
  private async resolveByDescriptiveAttributes(
    query: string,
    cohort: Cohort,
  ): Promise<PatientResolutionResult | null> {
    const signals = this.extractDescriptiveSignals(query);
    if (signals.length === 0) return null;

    let candidateIds: Set<string> | null = null;

    for (const signal of signals) {
      const patients = await this.patientsForSignal(signal, cohort);
      const ids = new Set(patients.map((p) => p.patientId));
      candidateIds = candidateIds === null ? ids : this.intersectSets(candidateIds, ids);
      if (candidateIds.size === 0) {
        return this.withMethod({ status: 'not_found' }, 'descriptive_attributes');
      }
    }

    const matches = await this.patientRepository.findByIdsAndCohort([...candidateIds!], cohort);
    return this.withMethod(this.fromMatches(matches), 'descriptive_attributes');
  }

  /** Priority 4: reuse the last successfully resolved patient in this session. */
  private async resolveBySessionContext(
    sessionLastPatientId: string | null | undefined,
    cohort: Cohort,
  ): Promise<PatientResolutionResult | null> {
    if (!sessionLastPatientId) return null;

    const patient = await this.patientRepository.findByIdAndCohort(sessionLastPatientId, cohort);
    if (!patient) return null;

    return {
      status: 'resolved',
      patient: this.toMatch(patient),
      method: 'session_context',
    };
  }

  private extractDescriptiveSignals(
    query: string,
  ): Array<
    | { type: 'first_name'; value: string }
    | { type: 'last_name'; value: string }
    | { type: 'gender'; value: string }
    | { type: 'birth_year'; value: number }
    | { type: 'status'; value: string }
    | { type: 'condition'; value: string }
    | { type: 'allergy'; value: string }
    | { type: 'medication'; value: string }
  > {
    const signals: ReturnType<typeof this.extractDescriptiveSignals> = [];

    const firstOnly = query.match(/(?:first\s+name|patient)\s+([A-Za-z][A-Za-z'-]+)/i);
    if (firstOnly) {
      signals.push({ type: 'first_name', value: firstOnly[1] });
    }

    const lastOnly = query.match(/(?:last\s+name)\s+([A-Za-z][A-Za-z'-]+)/i);
    if (lastOnly) {
      signals.push({ type: 'last_name', value: lastOnly[1] });
    }

    if (!firstOnly) {
      const tellMeAbout = query.match(/\b(?:about|for)\s+patient\s+([A-Za-z][A-Za-z'-]+)\b/i);
      if (tellMeAbout) {
        signals.push({ type: 'first_name', value: tellMeAbout[1] });
      }
    }

    const genderMatch = query.match(/\b(male|female|man|woman)\b/i);
    if (genderMatch) {
      const token = genderMatch[1].toLowerCase();
      const gender = token === 'male' || token === 'man' ? 'male' : 'female';
      signals.push({ type: 'gender', value: gender });
    }

    const birthYearMatch =
      query.match(/\bborn(?:\s+in)?\s+(19|20)\d{2}\b/i) ??
      query.match(/\b(?:dob|date of birth)[:\s]+(19|20)\d{2}\b/i);
    if (birthYearMatch) {
      const year = Number(birthYearMatch[0].match(/(19|20)\d{2}/)?.[0]);
      if (year) signals.push({ type: 'birth_year', value: year });
    }

    const statusMatch = query.match(/\b(active|inactive|deceased|discharged)\b/i);
    if (statusMatch) {
      signals.push({ type: 'status', value: statusMatch[1] });
    }

    const conditionMatch = query.match(
      /\b(?:with|has|diagnosed with|condition[s]?\s+(?:of|include[s]?)?)\s+([A-Za-z][A-Za-z0-9\s'-]{2,40})/i,
    );
    if (conditionMatch) {
      signals.push({ type: 'condition', value: conditionMatch[1].trim() });
    }

    const allergyMatch = query.match(
      /\b(?:allerg(?:y|ic)\s+to|allerg(?:y|ies)\s+(?:to|include[s]?)?)\s+([A-Za-z][A-Za-z0-9\s'-]{2,40})/i,
    );
    if (allergyMatch) {
      signals.push({ type: 'allergy', value: allergyMatch[1].trim() });
    }

    const medicationMatch = query.match(
      /\b(?:taking|on|prescribed|medication[s]?\s+(?:include[s]?|of)?)\s+([A-Za-z][A-Za-z0-9\s'-]{2,40})/i,
    );
    if (medicationMatch && !/patient|name|cohort/i.test(medicationMatch[1])) {
      signals.push({ type: 'medication', value: medicationMatch[1].trim() });
    }

    return signals;
  }

  private async patientsForSignal(
    signal: ReturnType<typeof this.extractDescriptiveSignals>[number],
    cohort: Cohort,
  ) {
    switch (signal.type) {
      case 'first_name':
        return this.patientRepository.findByFirstNameAndCohort(signal.value, cohort);
      case 'last_name':
        return this.patientRepository.findByLastNameAndCohort(signal.value, cohort);
      case 'gender':
        return this.patientRepository.findByGenderAndCohort(signal.value, cohort);
      case 'birth_year':
        return this.patientRepository.findByBirthYearAndCohort(signal.value, cohort);
      case 'status':
        return this.patientRepository.findByStatusAndCohort(signal.value, cohort);
      case 'condition':
        return this.patientRepository.findByConditionKeywordAndCohort(signal.value, cohort);
      case 'allergy':
        return this.patientRepository.findByAllergyKeywordAndCohort(signal.value, cohort);
      case 'medication':
        return this.patientRepository.findByMedicationKeywordAndCohort(signal.value, cohort);
      default:
        return [];
    }
  }

  private intersectSets(a: Set<string>, b: Set<string>): Set<string> {
    return new Set([...a].filter((id) => b.has(id)));
  }

  private withMethod(
    result: PatientResolutionResult,
    method: ResolutionMethod,
  ): PatientResolutionResult {
    return { ...result, method };
  }

  private fromMatches(
    matches: Array<{ patientId: string; firstName: string; lastName: string; cohort: string }> | undefined,
  ): PatientResolutionResult {
    if (!matches || matches.length === 0) {
      return { status: 'not_found' };
    }
    if (matches.length === 1) {
      return { status: 'resolved', patient: this.toMatch(matches[0]) };
    }
    return {
      status: 'ambiguous',
      matches: matches.map((m) => this.toMatch(m)),
    };
  }

  private toMatch(patient: {
    patientId: string;
    firstName: string;
    lastName: string;
    cohort: string;
  }): PatientMatch {
    return {
      patientId: patient.patientId,
      firstName: patient.firstName,
      lastName: patient.lastName,
      cohort: patient.cohort as Cohort,
    };
  }
}
