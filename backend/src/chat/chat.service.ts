import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PatientResolverService } from '../patient/patient-resolver.service';
import { SessionContextService } from '../patient/session-context.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { InjectionDetectionService } from '../security/injection-detection.service';
import { SecurityEventService } from '../security/security-event.service';
import { LangChainService } from '../langchain/langchain.service';
import { AuditService } from '../audit/audit.service';
import { ConfidenceService } from './confidence.service';
import {
  ChatResponse,
  Cohort,
  CANNOT_DETERMINE_PATIENT_MESSAGE,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  SAFE_SECURITY_RESPONSE,
} from '../common/types';

@Injectable()
export class ChatService {
  constructor(
    private readonly patientResolver: PatientResolverService,
    private readonly sessionContext: SessionContextService,
    private readonly retrievalService: RetrievalService,
    private readonly injectionDetection: InjectionDetectionService,
    private readonly securityEvents: SecurityEventService,
    private readonly langChainService: LangChainService,
    private readonly auditService: AuditService,
    private readonly confidenceService: ConfidenceService,
  ) {}

  async handleMessage(
    message: string,
    cohort: Cohort,
    sessionId = 'anonymous',
  ): Promise<ChatResponse> {
    const requestId = uuidv4();
    const detection = this.injectionDetection.detect(message, cohort);

    if (detection.detected) {
      // Category-specific safe response (falls back to the generic cohort-access
      // denial). High confidence: we are certain the request is being refused.
      const securityAnswer = detection.response ?? SAFE_SECURITY_RESPONSE;

      await this.securityEvents.logEvent({
        cohort,
        requestId,
        eventType: detection.eventType,
        severity: detection.severity,
        userQuery: message,
        details: { matchedPattern: detection.matchedPattern },
      });

      await this.auditService.logChat({
        requestId,
        cohort,
        userQuery: message,
        retrievedRecords: [],
        finalAnswer: securityAnswer,
        confidence: 'High',
        citations: [],
        injectionDetected: true,
        securityViolation: detection.severity === 'HIGH',
        rawModelOutput: null,
      });

      // Security denials are intentionally exact wording — never AI-rephrased.
      return {
        answer: securityAnswer,
        citations: [],
        confidence: 'High',
        request_id: requestId,
        status: 'blocked',
      };
    }

    const resolution = await this.patientResolver.resolve(message, cohort, {
      sessionId,
      sessionLastPatientId: this.sessionContext.getLastPatientId(sessionId, cohort),
    });

    if (resolution.status === 'ambiguous') {
      const answer = await this.langChainService.refineAnswer(
        message,
        'Multiple patients match your query. Please specify patient ID or full name to disambiguate.',
      );

      const response: ChatResponse = {
        answer,
        citations: [],
        confidence: 'Medium',
        request_id: requestId,
        ambiguous: true,
        status: 'ambiguous',
        matches: resolution.matches?.map((m) => ({
          patient_id: m.patientId,
          first_name: m.firstName,
          last_name: m.lastName,
        })),
      };

      await this.auditService.logChat({
        requestId,
        cohort,
        userQuery: message,
        retrievedRecords: [],
        finalAnswer: response.answer,
        confidence: response.confidence,
        citations: [],
      });

      return response;
    }

    if (resolution.status === 'not_found' || !resolution.patient) {
      // A pronoun reference (or other patient-scoped question with no identity)
      // and no session context is distinct from "named patient not found".
      const baseAnswer =
        resolution.method === 'pronoun_unresolved'
          ? CANNOT_DETERMINE_PATIENT_MESSAGE
          : INSUFFICIENT_EVIDENCE_MESSAGE;
      const answer =
        resolution.method === 'pronoun_unresolved'
          ? baseAnswer
          : await this.langChainService.refineAnswer(message, baseAnswer);

      await this.auditService.logChat({
        requestId,
        cohort,
        userQuery: message,
        retrievedRecords: [],
        finalAnswer: answer,
        confidence: 'Low',
        citations: [],
      });

      return {
        answer,
        citations: [],
        confidence: 'Low',
        request_id: requestId,
        status: 'not_found',
      };
    }

    const bundle = await this.retrievalService.retrievePatientBundle(
      resolution.patient.patientId,
      cohort,
    );

    if (!bundle) {
      const answer = await this.langChainService.refineAnswer(message, INSUFFICIENT_EVIDENCE_MESSAGE);

      await this.auditService.logChat({
        requestId,
        cohort,
        userQuery: message,
        retrievedRecords: [],
        finalAnswer: answer,
        confidence: 'Low',
        citations: [],
      });

      return {
        answer,
        citations: [],
        confidence: 'Low',
        request_id: requestId,
        status: 'not_found',
      };
    }

    this.retrievalService.assertCohortMatch(bundle.patient.cohort, cohort);
    this.sessionContext.setLastPatientId(sessionId, cohort, resolution.patient.patientId);

    const variant = await this.langChainService.getVariantForPatient(bundle.patient.patientId);
    const modelResult = await this.langChainService.generateAnswer(
      message,
      bundle.records,
      variant,
    );

    const confidence = this.confidenceService.compute(
      bundle.records,
      message,
      modelResult.confidence,
    );

    const rawAnswer =
      confidence === 'Low' && /insufficient evidence/i.test(modelResult.answer)
        ? INSUFFICIENT_EVIDENCE_MESSAGE
        : modelResult.answer;

    // Professional second-pass rephrasing (facts preserved). No-op without a key.
    const answer = await this.langChainService.refineAnswer(message, rawAnswer);

    const response: ChatResponse = {
      answer,
      citations: bundle.citations,
      confidence,
      request_id: requestId,
      status: 'answered',
    };

    await this.auditService.logChat({
      requestId,
      cohort,
      patientId: bundle.patient.patientId,
      variant,
      retrievedRecords: bundle.records,
      promptVersion: modelResult.promptVersion,
      userQuery: message,
      rawModelOutput: modelResult.rawModelOutput,
      finalAnswer: answer,
      confidence,
      citations: bundle.citations,
    });

    return response;
  }
}
