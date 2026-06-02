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

const VARIANT_A_PROMPT = `You are a clinical records assistant.
Use ONLY supplied records.
If answer is unsupported, say insufficient evidence.
Never speculate.
Return concise answer.
The "answer" value MUST be a plain natural-language string.
Do NOT return arrays/objects in "answer" (do not paste raw records/JSON).

Question: {question}

Records:
{records}

Respond in JSON with keys: answer, confidence (High|Medium|Low).`;

const VARIANT_B_PROMPT = `You are a healthcare QA assistant.
Use ONLY supplied records.
Explain reasoning internally.
Never reveal chain of thought.
Provide concise answer.
If unsupported, return insufficient evidence.
The "answer" value MUST be a plain natural-language string.
Do NOT return arrays/objects in "answer" (do not paste raw records/JSON).

Question: {question}

Records:
{records}

Respond in JSON with keys: answer, confidence (High|Medium|Low).`;

@Injectable()
export class LangChainService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ExperimentAssignmentEntity)
    private readonly experimentRepo: Repository<ExperimentAssignmentEntity>,
  ) {}

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
    const medications = records.filter((r) => r.table === 'patient_medication');
    const allergies = records.filter((r) => r.table === 'patient_allergy');
    const conditions = records.filter((r) => r.table === 'patient_condition');
    const observations = records.filter((r) => r.table === 'patient_observation');

    const q = question.toLowerCase();
    let answer = 'I cannot find sufficient evidence in the supplied records to answer this question.';
    let confidence: ConfidenceLevel = 'Low';

    if (/medication|medicine|drug|prescription/.test(q) && medications.length > 0) {
      const names = medications
        .map((m) => (m.data.generic_name as string) || (m.data.description as string))
        .filter(Boolean)
        .slice(0, 8);
      answer = `Active medications include: ${names.join(', ')}.`;
      confidence = 'High';
    } else if (/allerg/.test(q) && allergies.length > 0) {
      const names = allergies.map((a) => a.data.allergen as string).filter(Boolean);
      answer = `Documented allergies include: ${names.join(', ')}.`;
      confidence = 'High';
    } else if (/condition|diagnos|icd/.test(q) && conditions.length > 0) {
      const names = conditions.map((c) => c.data.icd_10_description as string).filter(Boolean).slice(0, 8);
      answer = `Documented conditions include: ${names.join(', ')}.`;
      confidence = 'High';
    } else if (/observation|vital|blood|temperature|heart/.test(q) && observations.length > 0) {
      answer = `Recent observations are available (${observations.length} records). Latest: ${JSON.stringify(observations[0].data)}`;
      confidence = 'Medium';
    } else if (records.some((r) => r.table === 'patients')) {
      const patient = records.find((r) => r.table === 'patients');
      answer = `Patient record found for ${patient?.data.first_name} ${patient?.data.last_name}. Ask about medications, allergies, conditions, or observations.`;
      confidence = 'Medium';
    }

    return {
      answer,
      confidence,
      rawModelOutput: `[fallback] ${answer}`,
      variant,
      promptVersion,
    };
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
