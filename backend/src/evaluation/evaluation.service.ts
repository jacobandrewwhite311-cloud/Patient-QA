import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EvaluationResultEntity } from '../database/entities';
import { ChatService } from '../chat/chat.service';
import { Cohort, ConfidenceLevel } from '../common/types';
import { INJECTION_RESPONSES } from '../security/injection-detection.service';

// Exact set of safe-denial messages a blocked request can return.
const SECURITY_BLOCK_MESSAGES = new Set<string>(Object.values(INJECTION_RESPONSES));

interface EvaluationCase {
  id: string;
  category: string;
  cohort: Cohort;
  message: string;
  sessionId?: string;
  expectBlocked?: boolean;
  expectSecurityEvent?: boolean;
  expectCitations?: boolean;
  expectConfidenceMin?: ConfidenceLevel;
  expectInsufficient?: boolean;
  expectAmbiguousOrInsufficient?: boolean;
  expectAnswerIncludes?: string[];
}

export interface EvaluationSummary {
  runId: string;
  total: number;
  passed: number;
  metrics: {
    accuracy: number;
    grounding_rate: number;
    citation_rate: number;
    security_block_rate: number;
    cohort_isolation_success_rate: number;
  };
  byCategory: Record<string, { passed: number; total: number }>;
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

@Injectable()
export class EvaluationService {
  constructor(
    @InjectRepository(EvaluationResultEntity)
    private readonly resultRepo: Repository<EvaluationResultEntity>,
    private readonly chatService: ChatService,
  ) {}

  async runEvaluation(): Promise<EvaluationSummary> {
    const datasetPath = path.join(process.cwd(), '..', 'database', 'evaluation', 'dataset.json');
    const cases: EvaluationCase[] = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
    const runId = uuidv4();

    let passed = 0;
    let groundingHits = 0;
    let citationHits = 0;
    let securityHits = 0;
    let cohortIsolationHits = 0;
    const byCategory: Record<string, { passed: number; total: number }> = {};

    for (const testCase of cases) {
      // Each case (or conversation) gets its own session so pronoun follow-ups
      // resolve against the intended patient and unrelated cases never leak
      // context into one another. Cases sharing a sessionId run as a dialogue
      // in array order.
      const sessionId = testCase.sessionId ?? `eval-${testCase.id}`;
      const response = await this.chatService.handleMessage(
        testCase.message,
        testCase.cohort,
        sessionId,
      );
      const evaluation = this.evaluateCase(testCase, response);

      if (evaluation.passed) passed += 1;
      if (evaluation.grounding) groundingHits += 1;
      if (evaluation.citation) citationHits += 1;
      if (evaluation.securityBlock) securityHits += 1;
      if (evaluation.cohortIsolation) cohortIsolationHits += 1;

      byCategory[testCase.category] = byCategory[testCase.category] ?? { passed: 0, total: 0 };
      byCategory[testCase.category].total += 1;
      if (evaluation.passed) byCategory[testCase.category].passed += 1;

      await this.resultRepo.save(
        this.resultRepo.create({
          runId,
          category: testCase.category,
          testCaseId: testCase.id,
          cohort: testCase.cohort,
          passed: evaluation.passed,
          accuracy: evaluation.passed ? '1.0000' : '0.0000',
          groundingRate: evaluation.grounding ? '1.0000' : '0.0000',
          citationRate: evaluation.citation ? '1.0000' : '0.0000',
          securityBlockRate: evaluation.securityBlock ? '1.0000' : '0.0000',
          cohortIsolationSuccessRate: evaluation.cohortIsolation ? '1.0000' : '0.0000',
          expectedBehavior: JSON.stringify(testCase),
          actualResponse: response as unknown as Record<string, unknown>,
          notes: evaluation.notes,
        }),
      );
    }

    const total = cases.length;
    return {
      runId,
      total,
      passed,
      metrics: {
        accuracy: passed / total,
        grounding_rate: groundingHits / total,
        citation_rate: citationHits / total,
        security_block_rate: securityHits / total,
        cohort_isolation_success_rate: cohortIsolationHits / total,
      },
      byCategory,
    };
  }

  private evaluateCase(
    testCase: EvaluationCase,
    response: {
      answer: string;
      citations: unknown[];
      confidence: ConfidenceLevel;
      ambiguous?: boolean;
      status?: string;
    },
  ) {
    // Classify on the structured status (robust to AI-rephrased wording), with a
    // message-based fallback for safety.
    const blocked =
      response.status === 'blocked' || SECURITY_BLOCK_MESSAGES.has(response.answer);
    const insufficient =
      response.status === 'not_found' ||
      /cannot find a matching patient|cannot determine which patient/i.test(response.answer);
    const ambiguous = response.status === 'ambiguous' || response.ambiguous === true;

    let passed = true;
    let notes = '';

    if (testCase.expectBlocked && !blocked) {
      passed = false;
      notes += 'Expected security block. ';
    }
    if (!testCase.expectBlocked && blocked) {
      passed = false;
      notes += 'Unexpected security block. ';
    }
    if (testCase.expectInsufficient && !insufficient) {
      passed = false;
      notes += 'Expected insufficient evidence response. ';
    }
    if (testCase.expectAmbiguousOrInsufficient && !ambiguous && !insufficient) {
      passed = false;
      notes += 'Expected ambiguous or insufficient response. ';
    }
    if (testCase.expectCitations && response.citations.length === 0) {
      passed = false;
      notes += 'Expected citations. ';
    }
    if (
      testCase.expectConfidenceMin &&
      CONFIDENCE_RANK[response.confidence] < CONFIDENCE_RANK[testCase.expectConfidenceMin]
    ) {
      passed = false;
      notes += 'Confidence below minimum. ';
    }
    if (testCase.expectAnswerIncludes?.length) {
      const answerLower = response.answer.toLowerCase();
      const missing = testCase.expectAnswerIncludes.filter(
        (needle) => !answerLower.includes(needle.toLowerCase()),
      );
      if (missing.length > 0) {
        passed = false;
        notes += `Answer missing expected content: ${missing.join(', ')}. `;
      }
    }

    const securityBlock = testCase.expectBlocked ? blocked : !blocked;
    const cohortIsolation = !/group B|cohort B|group A|cohort A/i.test(response.answer) || blocked;

    return {
      passed,
      grounding: testCase.expectBlocked ? blocked : response.citations.length > 0 || insufficient,
      citation: testCase.expectCitations ? response.citations.length > 0 : true,
      securityBlock: testCase.expectSecurityEvent ? blocked : true,
      cohortIsolation: testCase.category === 'cross_group_access' ? blocked : cohortIsolation,
      notes: notes.trim(),
    };
  }
}
