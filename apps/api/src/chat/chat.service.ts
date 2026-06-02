import { Injectable } from '@nestjs/common';
import { CohortContext } from '../common/cohort-context';
import { SAFE_FALLBACK } from '../common/constants';
import { ExperimentService } from '../experiment/experiment.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { InjectionDetectorService } from '../security/injection-detector.service';
import { ChatResponse } from './chat.types';
import { LlmService } from './llm.service';
import { OutputValidatorService } from './output-validator.service';
import { RequestLogService } from './request-log.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly injectionDetector: InjectionDetectorService,
    private readonly experiment: ExperimentService,
    private readonly llm: LlmService,
    private readonly outputValidator: OutputValidatorService,
    private readonly requestLog: RequestLogService,
  ) {}

  async handleMessage(
    message: string,
    ctx: CohortContext,
  ): Promise<ChatResponse> {
    const start = Date.now();
    const variant = this.experiment.assignVariant(ctx.sessionId);
    let injectionAttempt = false;
    let cohortViolation = false;
    let resolvedPatientId: string | null = null;
    let recordsRetrieved: { table: string; recordId: string }[] = [];
    let rawModelOutput: string | null = null;

    const injectionCheck = await this.injectionDetector.check(message, ctx.group);
    injectionAttempt = injectionCheck.injectionAttempt;
    cohortViolation = injectionCheck.cohortViolation;

    if (injectionCheck.blocked) {
      const response: ChatResponse = {
        answer: SAFE_FALLBACK,
        citations: [],
        confidence: 'Low',
        meta: {
          variant,
          blocked: true,
          reason: injectionCheck.reason,
        },
      };
      await this.requestLog.log({
        sessionId: ctx.sessionId,
        cohort: ctx.group,
        promptVariant: variant,
        resolvedPatientId: null,
        recordsRetrieved: [],
        rawModelOutput: null,
        structuredResponse: response,
        injectionAttempt,
        cohortViolation,
        latencyMs: Date.now() - start,
        userMessage: message,
      });
      return this.attachDebug(response, ctx, variant, resolvedPatientId);
    }

    const resolved = await this.retrieval.resolvePatient(message, ctx.group);

    if (resolved.ambiguous || !resolved.match) {
      const response: ChatResponse = {
        answer: SAFE_FALLBACK,
        citations: [],
        confidence: 'Low',
        meta: { variant, blocked: false, reason: resolved.ambiguous ? 'ambiguous_patient' : 'no_patient' },
      };
      await this.requestLog.log({
        sessionId: ctx.sessionId,
        cohort: ctx.group,
        promptVariant: variant,
        resolvedPatientId: null,
        recordsRetrieved: [],
        rawModelOutput: null,
        structuredResponse: response,
        injectionAttempt,
        cohortViolation,
        latencyMs: Date.now() - start,
        userMessage: message,
      });
      return this.attachDebug(response, ctx, variant, null);
    }

    resolvedPatientId = resolved.match.patientId;
    const records = await this.retrieval.getPatientRecords(
      resolvedPatientId,
      ctx.group,
    );

    recordsRetrieved = records.map((r) => ({
      table: r.table,
      recordId: r.recordId,
    }));

    if (records.length === 0) {
      const response: ChatResponse = {
        answer: SAFE_FALLBACK,
        citations: [],
        confidence: 'Low',
        meta: { variant, patientId: resolvedPatientId, reason: 'no_records' },
      };
      await this.requestLog.log({
        sessionId: ctx.sessionId,
        cohort: ctx.group,
        promptVariant: variant,
        resolvedPatientId,
        recordsRetrieved,
        rawModelOutput: null,
        structuredResponse: response,
        injectionAttempt,
        cohortViolation,
        latencyMs: Date.now() - start,
        userMessage: message,
      });
      return this.attachDebug(response, ctx, variant, resolvedPatientId);
    }

    let response: ChatResponse;

    if (!process.env.OPENAI_API_KEY) {
      const allergyRecords = records.filter((r) => r.table === 'patient_allergies');
      response = {
        answer: `Found ${records.length} records for ${resolved.match.displayName}. (LLM disabled — set OPENAI_API_KEY for full answers.)`,
        citations: allergyRecords.slice(0, 3).map((r) => ({
          table: r.table,
          recordId: r.recordId,
          excerpt: r.summaryText.slice(0, 120),
        })),
        confidence: records.length >= 3 ? 'Medium' : 'Low',
        meta: { variant, patientId: resolvedPatientId },
      };
      rawModelOutput = JSON.stringify(response);
    } else {
      const { structured, raw } = await this.llm.generateAnswer(
        variant,
        message,
        resolved.match.displayName,
        records,
      );
      rawModelOutput = raw;

      const validated = this.outputValidator.validate(structured, records);
      const confidence = this.llm.computeConfidence(
        validated.citations.length,
        records.length,
        validated.confidence,
      );

      response = {
        answer: validated.answer,
        citations: validated.citations,
        confidence,
        meta: { variant, patientId: resolvedPatientId },
      };
    }

    await this.requestLog.log({
      sessionId: ctx.sessionId,
      cohort: ctx.group,
      promptVariant: variant,
      resolvedPatientId,
      recordsRetrieved,
      rawModelOutput,
      structuredResponse: response,
      injectionAttempt,
      cohortViolation,
      latencyMs: Date.now() - start,
      userMessage: message,
    });

    return this.attachDebug(response, ctx, variant, resolvedPatientId);
  }

  private attachDebug(
    response: ChatResponse,
    ctx: CohortContext,
    variant: string,
    patientId: string | null,
  ): ChatResponse {
    if (process.env.ENABLE_DEBUG === 'true') {
      return {
        ...response,
        meta: {
          ...response.meta,
          variant,
          patientId: patientId ?? undefined,
        },
      };
    }
    const { meta, ...rest } = response;
    if (meta?.blocked || meta?.reason) {
      return { ...rest, meta: { variant, blocked: meta.blocked, reason: meta.reason } };
    }
    return rest;
  }
}
