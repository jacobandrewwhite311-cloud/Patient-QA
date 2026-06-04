import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ConfigService } from '@nestjs/config';
import { ExperimentAssignmentEntity } from '../database/entities';
import { ConfidenceLevel, ExperimentVariant, RetrievedRecord } from '../common/types';

export interface LangChainAnswer {
  answer: string;
  confidence: ConfidenceLevel;
  rawModelOutput: string;
  variant: ExperimentVariant;
  promptVersion: string;
}

const GROUNDING_RULES = `Use ONLY the supplied records. Never speculate or use outside knowledge.
The records describe ONE patient. The "patients" record holds demographics and
location/admission fields: dob, gender, ethnicity, status, room, bed, unit, floor,
admission_time, discharge_time. Clinical records are patient_medication,
patient_allergy, patient_condition, patient_observation.
Each observation has a typed "observation" object with type/unit/value. Map the
observation "type" to the natural term in the question:
"BloodSugar" = blood sugar/glucose, "BloodPressure" = blood pressure,
"HeartRate" = heart rate/pulse, "Temperature" = temperature,
"OxygenSaturation" = oxygen/O2 saturation, "RespiratoryRate" = respiratory rate,
"Weight" = weight, "Height" = height, "PainLevel" = pain level.
When asked for the latest/most recent reading of a type, use the observation of
that type with the most recent recorded_time and report its value and unit.

Answer the specific question asked:
- If the relevant record(s) exist, answer directly and concisely, citing the values.
- If the patient is present but the requested detail is NOT in the records (e.g. no
  allergies on file, no room recorded), reply with a full sentence stating it is not
  documented, naming the field (e.g. "No allergies are documented for this patient.").
  Do NOT say "insufficient evidence" for a patient that was found.
- Only say "insufficient evidence" when there is genuinely no patient context.
- Format dates and times in plain readable form.
The "answer" value MUST be a plain natural-language string.
Do NOT return arrays/objects in "answer" (do not paste raw records/JSON).`;

const VARIANT_A_PROMPT = `You are a clinical records assistant. Give direct, concise answers.
${GROUNDING_RULES}

Question: {question}

Records:
{records}

Respond in JSON with keys: answer, confidence (High|Medium|Low).`;

const VARIANT_B_PROMPT = `You are a healthcare QA assistant. Reason internally about the records but
never reveal your chain of thought; provide only a concise final answer.
${GROUNDING_RULES}

Question: {question}

Records:
{records}

Respond in JSON with keys: answer, confidence (High|Medium|Low).`;

const REFINE_PROMPT = `You are an editor for a clinical records assistant. Rewrite the assistant's
answer below into clear, professional, clinically-appropriate prose suitable for a clinician.

Rules:
- Preserve ALL facts EXACTLY: patient names, numbers, dates, units, values, and
  medication/condition/allergy/observation names. Do not add, remove, infer, or
  reorder any clinical information.
- Keep it concise (1-3 sentences) with a neutral, professional tone.
- If the answer says information is not documented/unavailable, that no patient was
  found, that the patient is undeterminable, or that multiple patients match,
  preserve that exact meaning and phrase it courteously.
- Output ONLY the rewritten answer: no preamble, no greetings, no sign-offs, no quotes.

Question: {question}
Answer: {answer}

Rewritten:`;

@Injectable()
export class LangChainService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ExperimentAssignmentEntity)
    private readonly experimentRepo: Repository<ExperimentAssignmentEntity>,
  ) {}

  /**
   * Second-pass professional rephrasing of a final answer. Preserves all facts;
   * only improves tone/readability. No-op without an API key, and best-effort:
   * any failure returns the original answer unchanged.
   */
  async refineAnswer(question: string, answer: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey || !answer || !answer.trim()) {
      return answer;
    }

    try {
      const modelName = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
      const model = new ChatOpenAI({ apiKey, model: modelName, temperature: 0.2, maxTokens: 220 });
      const prompt = ChatPromptTemplate.fromTemplate(REFINE_PROMPT);
      const response = await prompt.pipe(model).invoke({ question, answer });
      const text =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
      const cleaned = text.trim().replace(/^["']|["']$/g, '').trim();
      return cleaned || answer;
    } catch {
      return answer;
    }
  }

  async getVariantForPatient(patientId: string): Promise<ExperimentVariant> {
    const existing = await this.experimentRepo.findOne({ where: { patientId } });
    if (existing) {
      return existing.variant as ExperimentVariant;
    }

    const variant = this.hashMod2(patientId);
    await this.experimentRepo.save(
      this.experimentRepo.create({
        patientId,
        variant,
        assignmentMethod: 'hash_mod_2',
      }),
    );
    return variant;
  }

  hashMod2(patientId: string): ExperimentVariant {
    let hash = 0;
    for (let i = 0; i < patientId.length; i += 1) {
      hash = (hash * 31 + patientId.charCodeAt(i)) >>> 0;
    }
    return hash % 2 === 0 ? 'A' : 'B';
  }

  async generateAnswer(
    question: string,
    records: RetrievedRecord[],
    variant: ExperimentVariant,
  ): Promise<LangChainAnswer> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const modelName = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    const recordsText = JSON.stringify(records, null, 2);
    const promptVersion = variant === 'A' ? 'variant_a_v1' : 'variant_b_v1';
    const template = variant === 'A' ? VARIANT_A_PROMPT : VARIANT_B_PROMPT;

    if (!apiKey) {
      return this.fallbackAnswer(question, records, variant, promptVersion);
    }

    const model = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature: 0,
    });

    const prompt = ChatPromptTemplate.fromTemplate(template);
    const chain = prompt.pipe(model);
    const response = await chain.invoke({ question, records: recordsText });
    const rawModelOutput =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    const parsed = this.parseModelJson(rawModelOutput, question, records);
    return {
      ...parsed,
      rawModelOutput,
      variant,
      promptVersion,
    };
  }

  private fallbackAnswer(
    question: string,
    records: RetrievedRecord[],
    variant: ExperimentVariant,
    promptVersion: string,
  ): LangChainAnswer {
    const answer = this.composeFallbackAnswer(question, records);
    return {
      answer,
      // ConfidenceService re-derives the user-facing confidence from the records
      // and question; a grounded fallback answer is High by default.
      confidence: records.some((r) => r.table === 'patients') ? 'High' : 'Low',
      rawModelOutput: `[fallback] ${answer}`,
      variant,
      promptVersion,
    };
  }

  /** Rule-based, fully grounded answer used when no OPENAI_API_KEY is configured. */
  private composeFallbackAnswer(question: string, records: RetrievedRecord[]): string {
    const q = question.toLowerCase();
    const patient = (records.find((r) => r.table === 'patients')?.data ?? {}) as Record<string, any>;
    const fullName = `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() || 'this patient';

    const medications = records.filter((r) => r.table === 'patient_medication');
    const allergies = records.filter((r) => r.table === 'patient_allergy');
    const conditions = records.filter((r) => r.table === 'patient_condition');
    const observations = records.filter((r) => r.table === 'patient_observation');

    const fmtDate = (v: unknown): string => {
      if (!v) return 'not documented';
      const s = String(v);
      return s.length >= 10 ? s.slice(0, 10) : s;
    };

    // Demographic / identity
    if (/date of birth|dob|\bborn\b|birth/.test(q)) {
      return `${fullName}'s date of birth is ${fmtDate(patient.dob)}.`;
    }
    if (/gender|sex/.test(q) && /admission|admitted/.test(q)) {
      return `${fullName} is ${patient.gender ?? 'of undocumented gender'} and was admitted on ${fmtDate(patient.admission_time)}.`;
    }
    if (/gender|sex/.test(q)) {
      return patient.gender
        ? `${fullName}'s gender is ${patient.gender}.`
        : `Gender is not documented for ${fullName}.`;
    }
    if (/ethnicity/.test(q)) {
      return patient.ethnicity
        ? `${fullName}'s ethnicity is ${patient.ethnicity}.`
        : `Ethnicity is not documented for ${fullName}.`;
    }

    // Location
    if (/\broom\b|\bbed\b|\bunit\b|\bfloor\b|\bward\b/.test(q)) {
      const loc: string[] = [];
      if (patient.room) loc.push(`room ${patient.room}`);
      if (patient.bed) loc.push(`bed ${patient.bed}`);
      if (patient.unit) loc.push(`unit ${patient.unit}`);
      if (patient.floor) loc.push(`floor ${patient.floor}`);
      return loc.length
        ? `${fullName} is assigned to ${loc.join(', ')}.`
        : `No room/location assignment is documented for ${fullName}.`;
    }

    // Admission / discharge / status
    if (/admission|admitted/.test(q)) {
      return `${fullName} was admitted on ${fmtDate(patient.admission_time)}.`;
    }
    if (/discharge|discharged/.test(q)) {
      return patient.discharge_time
        ? `${fullName} was discharged on ${fmtDate(patient.discharge_time)}.`
        : `No discharge is documented for ${fullName}.`;
    }
    if (/\bactive\b|\bstatus\b|\binactive\b|\bdeceased\b/.test(q)) {
      return `${fullName}'s status is ${patient.status ?? 'not documented'}.`;
    }

    // Clinical domains
    if (/medication|medicine|drug|prescription/.test(q)) {
      if (medications.length === 0) return `No medications are documented for ${fullName}.`;
      const names = medications
        .map((m) => (m.data.generic_name as string) || (m.data.description as string))
        .filter(Boolean)
        .slice(0, 10);
      return `${fullName} is taking: ${names.join(', ')}.`;
    }
    if (/allerg/.test(q)) {
      if (allergies.length === 0) return `No allergies are documented for ${fullName}.`;
      const names = allergies.map((a) => a.data.allergen as string).filter(Boolean);
      return `Documented allergies for ${fullName}: ${names.join(', ')}.`;
    }
    if (/condition|diagnos|icd/.test(q)) {
      if (conditions.length === 0) return `No conditions are documented for ${fullName}.`;
      const names = conditions
        .map((c) => c.data.icd_10_description as string)
        .filter(Boolean)
        .slice(0, 10);
      return `Documented diagnoses for ${fullName}: ${names.join('; ')}.`;
    }

    // Typed observations (blood sugar, blood pressure, heart rate, etc.)
    const obsType = this.matchObservationType(q);
    if (obsType) {
      const latest = this.latestObservationOfType(observations, obsType.type);
      if (!latest) return `No ${obsType.label} reading is documented for ${fullName}.`;
      const o = (latest.data.observation ?? {}) as Record<string, any>;
      const value = o?.value;
      const unit = o?.unit ? ` ${o.unit}` : '';
      return `${fullName}'s latest ${obsType.label} reading is ${value}${unit} (recorded ${fmtDate(latest.data.recorded_time)}).`;
    }
    if (/observation|vital/.test(q)) {
      if (observations.length === 0) return `No observations are documented for ${fullName}.`;
      const types = [
        ...new Set(
          observations
            .map((o) => (o.data.observation as Record<string, unknown>)?.type)
            .filter(Boolean) as string[],
        ),
      ];
      return `Available observations for ${fullName} include: ${types.join(', ')}.`;
    }

    return `Patient record found for ${fullName}. You can ask about medications, allergies, conditions, observations, demographics, location, admission, or status.`;
  }

  private matchObservationType(q: string): { type: string; label: string } | null {
    const map: Array<{ re: RegExp; type: string; label: string }> = [
      { re: /blood\s*sugar|glucose/, type: 'BloodSugar', label: 'blood sugar' },
      { re: /blood\s*pressure/, type: 'BloodPressure', label: 'blood pressure' },
      { re: /heart\s*rate|pulse/, type: 'HeartRate', label: 'heart rate' },
      { re: /temperature/, type: 'Temperature', label: 'temperature' },
      { re: /oxygen|o2|saturation/, type: 'OxygenSaturation', label: 'oxygen saturation' },
      { re: /respirator/, type: 'RespiratoryRate', label: 'respiratory rate' },
      { re: /weight/, type: 'Weight', label: 'weight' },
      { re: /height/, type: 'Height', label: 'height' },
      { re: /pain/, type: 'PainLevel', label: 'pain level' },
    ];
    return map.find((m) => m.re.test(q)) ?? null;
  }

  private latestObservationOfType(
    observations: RetrievedRecord[],
    type: string,
  ): RetrievedRecord | null {
    const matches = observations.filter(
      (o) => (o.data.observation as Record<string, unknown>)?.type === type,
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => {
      const ta = new Date(String(a.data.recorded_time ?? 0)).getTime();
      const tb = new Date(String(b.data.recorded_time ?? 0)).getTime();
      return tb - ta;
    })[0];
  }

  private parseModelJson(
    raw: string,
    question: string,
    records: RetrievedRecord[],
  ): Pick<LangChainAnswer, 'answer' | 'confidence'> {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { answer?: unknown; confidence?: string };
        const confidence = this.normalizeConfidence(parsed.confidence);
        if (parsed.answer !== undefined && parsed.answer !== null) {
          return { answer: this.coerceAnswerToString(parsed.answer), confidence };
        }
      }
    } catch {
      // fall through
    }

    if (raw.trim()) {
      return { answer: raw.trim(), confidence: 'Medium' };
    }

    return this.fallbackAnswer(question, records, 'A', 'variant_a_v1');
  }

  private coerceAnswerToString(answer: unknown): string {
    if (typeof answer === 'string') return answer;
    if (Array.isArray(answer)) {
      // Common failure mode: model returns an array of medication-like objects.
      const maybeMedLines = answer
        .filter((x) => typeof x === 'object' && x !== null)
        .map((x) => x as Record<string, unknown>)
        .map((m) => {
          const description = typeof m.description === 'string' ? m.description : undefined;
          const generic = typeof m.generic_name === 'string' ? m.generic_name : undefined;
          const strength = typeof m.strength === 'string' ? m.strength : undefined;
          const directions = typeof m.directions === 'string' ? m.directions : undefined;

          if (!description && !generic && !strength && !directions) return null;

          const namePart = [description, generic ? `(${generic})` : null].filter(Boolean).join(' ');
          const strengthPart = strength ? ` — ${strength}` : '';
          const directionsPart = directions ? ` Directions: ${directions}` : '';
          return `- ${namePart}${strengthPart}.${directionsPart}`.replace(/\.\s*\./g, '.');
        })
        .filter((line): line is string => Boolean(line));

      if (maybeMedLines.length > 0) {
        return `Here are the medications found in the record:\n${maybeMedLines.join('\n')}`;
      }
    }

    if (typeof answer === 'object' && answer !== null) {
      const m = answer as Record<string, unknown>;
      const description = typeof m.description === 'string' ? m.description : undefined;
      const generic = typeof m.generic_name === 'string' ? m.generic_name : undefined;
      const strength = typeof m.strength === 'string' ? m.strength : undefined;
      const directions = typeof m.directions === 'string' ? m.directions : undefined;

      if (description || generic || strength || directions) {
        const namePart = [description, generic ? `(${generic})` : null].filter(Boolean).join(' ');
        const strengthPart = strength ? ` — ${strength}` : '';
        const directionsPart = directions ? ` Directions: ${directions}` : '';
        return `${namePart}${strengthPart}.${directionsPart}`.replace(/\.\s*\./g, '.');
      }
    }

    try {
      return JSON.stringify(answer, null, 2);
    } catch {
      return String(answer);
    }
  }

  private normalizeConfidence(value?: string): ConfidenceLevel {
    if (!value) return 'Medium';
    const normalized = value.toLowerCase();
    if (normalized.includes('high')) return 'High';
    if (normalized.includes('low')) return 'Low';
    return 'Medium';
  }
}
