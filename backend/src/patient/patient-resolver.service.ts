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
  | 'single_name'
  | 'descriptive_attributes'
  | 'session_context'
  | 'pronoun_unresolved'
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

/**
 * Words that must never be treated as part of a patient name. Without this,
 * a sentence-leading verb/question word pairs with the real first name
 * (e.g. "Does Adolfo" in "Does Adolfo Ricker have allergies?") and consumes it,
 * so the real "Adolfo Ricker" pair is never tried. Patient names in the dataset
 * are distinctive enough that collisions with these words are not a concern.
 */
const STOPWORDS = new Set([
  // articles / determiners / pronouns
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'their', 'theirs', 'they',
  'them', 'he', 'she', 'him', 'her', 'hers', 'his', 'its', 'it', 'my', 'our',
  // question / auxiliary / verb words
  'what', 'who', 'whom', 'whose', 'which', 'when', 'where', 'why', 'how',
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
  'do', 'does', 'did', 'has', 'have', 'had',
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
  'show', 'tell', 'give', 'list', 'find', 'get', 'fetch', 'display', 'provide',
  'taking', 'take', 'assigned', 'documented', 'available', 'currently',
  // prepositions / conjunctions / fillers
  'about', 'for', 'with', 'of', 'to', 'in', 'on', 'at', 'by', 'and', 'or',
  'any', 'all', 'me', 'please', 'currently',
  // clinical / field nouns (never part of a name)
  'patient', 'patients', 'first', 'last', 'name', 'named',
  'medication', 'medications', 'medicine', 'drug', 'drugs', 'prescription',
  'allergy', 'allergies', 'allergic',
  'condition', 'conditions', 'diagnosis', 'diagnoses', 'diagnosed',
  'observation', 'observations', 'vital', 'vitals', 'reading', 'readings',
  'blood', 'sugar', 'pressure', 'heart', 'rate', 'temperature', 'oxygen', 'pain',
  'gender', 'sex', 'dob', 'birth', 'date', 'born',
  'room', 'bed', 'unit', 'floor', 'ward',
  'admission', 'admitted', 'discharge', 'discharged', 'status', 'active',
  'inactive', 'deceased', 'latest', 'recent', 'current',
]);

/**
 * Plural / non-specific pronouns — never bind to session context (even after a
 * named patient was discussed). Clinicians must name the patient or use he/she.
 */
const PLURAL_PRONOUN_PATTERNS: RegExp[] = [
  /\b(?:they|them|their|theirs)\b/i,
];

/**
 * Singular pronouns and explicit patient back-references — may resolve to the
 * last patient in this session when no name or ID appears in the question.
 */
const SESSION_PRONOUN_PATTERNS: RegExp[] = [
  /\b(?:this|that|the)\s+patient\b/i,
  /\b(?:he|she|him|her|his|hers)\b/i,
];

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

    // Plural pronouns (they/their/...) never inherit session — user must be explicit.
    if (this.hasPluralPronounReference(normalized)) {
      return { status: 'not_found', method: 'pronoun_unresolved' };
    }

    // Singular pronouns (he/she/...) or "this patient" may follow a prior named patient.
    if (this.hasSessionPronounReference(normalized)) {
      const bySessionPronoun = await this.resolveBySessionContext(sessionLastPatientId, cohort);
      if (bySessionPronoun !== null) return bySessionPronoun;
      return { status: 'not_found', method: 'pronoun_unresolved' };
    }

    // A single proper-noun reference ("Adolfo", "Ricker") — resolve it as a
    // first OR last name before falling back to attribute search.
    const bySingleName = await this.resolveBySingleName(normalized, cohort);
    if (bySingleName !== null) return bySingleName;

    const byAttributes = await this.resolveByDescriptiveAttributes(normalized, cohort);
    if (byAttributes !== null) return byAttributes;

    const bySession = await this.resolveBySessionContext(sessionLastPatientId, cohort);
    if (bySession !== null) return bySession;

    if (this.lacksIdentifiablePatient(normalized)) {
      return { status: 'not_found', method: 'pronoun_unresolved' };
    }

    return { status: 'not_found', method: 'safe_fallback' };
  }

  private hasPluralPronounReference(query: string): boolean {
    return PLURAL_PRONOUN_PATTERNS.some((pattern) => pattern.test(query));
  }

  private hasSessionPronounReference(query: string): boolean {
    return SESSION_PRONOUN_PATTERNS.some((pattern) => pattern.test(query));
  }

  /** Clinical question about a patient record with no name, ID, or session context. */
  private isPatientScopedClinicalQuery(query: string): boolean {
    return /\b(medication|medications|medicine|drugs?|prescription|allerg|condition|diagnos|observation|vitals?|room|bed|unit|floor|ward|admission|discharg|status|dosage|dob|birth|gender|ethnicity|blood\s*(?:sugar|pressure)|heart\s*rate|temperature|oxygen)\b/i.test(
      query,
    );
  }

  /**
   * True when the user asks about patient-specific data but provides no way to
   * identify which patient (no UUID, name tokens, or explicit name labels).
   */
  private lacksIdentifiablePatient(query: string): boolean {
    if (UUID_REGEX.test(query)) return false;

    if (this.extractExplicitFullNameCandidates(query).length > 0) return false;

    const capitalizedNameTokens = this.nameTokens(query).filter(
      (t) => this.isCapitalized(t.raw) && !STOPWORDS.has(t.clean.toLowerCase()),
    );
    if (capitalizedNameTokens.length > 0) return false;

    const firstOnly = query.match(/(?:first\s+name|patient)\s+([A-Za-z][A-Za-z'-]+)/i);
    if (firstOnly && !STOPWORDS.has(firstOnly[1].toLowerCase())) return false;

    const lastOnly = query.match(/(?:last\s+name)\s+([A-Za-z][A-Za-z'-]+)/i);
    if (lastOnly && !STOPWORDS.has(lastOnly[1].toLowerCase())) return false;

    return this.hasPluralPronounReference(query) || this.isPatientScopedClinicalQuery(query);
  }

  /**
   * Resolve a bare first- or last-name reference (no full pair). A clinician
   * commonly types "What meds is Adolfo on?" or "Tell me about Ricker". Each
   * capitalized, non-stopword token is matched against first AND last name;
   * a single hit resolves, multiple hits disambiguate.
   */
  private async resolveBySingleName(
    query: string,
    cohort: Cohort,
  ): Promise<PatientResolutionResult | null> {
    const tokens = this.nameTokens(query).filter(
      (t) => this.isCapitalized(t.raw) && !STOPWORDS.has(t.clean.toLowerCase()),
    );
    if (tokens.length === 0) return null;

    const byId = new Map<string, PatientMatch>();
    for (const token of tokens) {
      const [byFirst, byLast] = await Promise.all([
        this.patientRepository.findByFirstNameAndCohort(token.clean, cohort),
        this.patientRepository.findByLastNameAndCohort(token.clean, cohort),
      ]);
      for (const p of [...(byFirst ?? []), ...(byLast ?? [])]) {
        byId.set(p.patientId, this.toMatch(p));
      }
    }

    const matches = [...byId.values()];
    if (matches.length === 0) return null;
    return this.withMethod(this.fromMatches(matches), 'single_name');
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

  /**
   * Produce "first last" candidates from the query using OVERLAPPING adjacent
   * token pairs. Overlap (rather than non-overlapping regex matches) is what
   * lets "Adolfo Ricker" still be tried after a leading word like "Does" — the
   * old non-overlapping scan consumed "Does Adolfo" and never reached the real
   * name. Stopword tokens are dropped before pairing. Pairs where both tokens
   * are capitalized (proper nouns) are tried first.
   */
  private extractExplicitFullNameCandidates(query: string): Array<[string, string]> {
    const candidates: Array<[string, string]> = [];
    const seen = new Set<string>();

    const addCandidate = (firstName: string, lastName: string, capitalized: boolean) => {
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
      if (seen.has(key)) return;
      if (STOPWORDS.has(firstName.toLowerCase()) || STOPWORDS.has(lastName.toLowerCase())) return;
      seen.add(key);
      candidates.push([firstName, lastName, capitalized] as unknown as [string, string]);
    };

    // Highest priority: an explicit "full name / patient name <First> <Last>" label.
    const explicitLabel = query.match(
      /(?:full\s+name|patient\s+name|patient\s+named)\s+([A-Za-z][A-Za-z'-]+)\s+([A-Za-z][A-Za-z'-]+)/i,
    );
    if (explicitLabel) addCandidate(explicitLabel[1], explicitLabel[2], true);

    const tokens = this.nameTokens(query);
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      const capitalized = this.isCapitalized(a.raw) && this.isCapitalized(b.raw);
      addCandidate(a.clean, b.clean, capitalized);
    }

    // Try capitalized proper-noun pairs before all-lowercase ones.
    return (candidates as unknown as Array<[string, string, boolean]>)
      .sort((x, y) => Number(y[2]) - Number(x[2]))
      .map(([first, last]) => [first, last] as [string, string]);
  }

  /** Split a query into name-shaped tokens, stripping punctuation and possessives. */
  private nameTokens(query: string): Array<{ raw: string; clean: string }> {
    return query
      .split(/\s+/)
      .map((rawToken) => {
        const raw = rawToken.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '');
        const clean = raw.replace(/'s$/i, '').replace(/['-]+$/g, '');
        return { raw, clean };
      })
      .filter((t) => /^[A-Za-z][A-Za-z'-]*$/.test(t.clean) && t.clean.length >= 2);
  }

  private isCapitalized(word: string): boolean {
    return /^[A-Z][a-z'-]*$/.test(word);
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
    if (firstOnly && !STOPWORDS.has(firstOnly[1].toLowerCase())) {
      signals.push({ type: 'first_name', value: firstOnly[1] });
    }

    const lastOnly = query.match(/(?:last\s+name)\s+([A-Za-z][A-Za-z'-]+)/i);
    if (lastOnly && !STOPWORDS.has(lastOnly[1].toLowerCase())) {
      signals.push({ type: 'last_name', value: lastOnly[1] });
    }

    if (!firstOnly) {
      const tellMeAbout = query.match(/\b(?:about|for)\s+patient\s+([A-Za-z][A-Za-z'-]+)\b/i);
      if (tellMeAbout && !STOPWORDS.has(tellMeAbout[1].toLowerCase())) {
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
