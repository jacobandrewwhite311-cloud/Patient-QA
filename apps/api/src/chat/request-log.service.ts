import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatResponse } from './chat.types';

export interface LogRequestInput {
  sessionId: string;
  cohort: string;
  promptVariant: string;
  resolvedPatientId?: string | null;
  recordsRetrieved: { table: string; recordId: string }[];
  rawModelOutput?: string | null;
  structuredResponse: ChatResponse;
  injectionAttempt: boolean;
  cohortViolation: boolean;
  latencyMs: number;
  userMessage: string;
}

@Injectable()
export class RequestLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogRequestInput) {
    return this.prisma.requestLog.create({
      data: {
        sessionId: input.sessionId,
        cohort: input.cohort,
        promptVariant: input.promptVariant,
        resolvedPatientId: input.resolvedPatientId ?? null,
        recordsRetrieved: input.recordsRetrieved as Prisma.InputJsonValue,
        rawModelOutput: input.rawModelOutput ?? null,
        structuredResponse: input.structuredResponse as unknown as Prisma.InputJsonValue,
        injectionAttempt: input.injectionAttempt,
        cohortViolation: input.cohortViolation,
        latencyMs: input.latencyMs,
        userMessage: input.userMessage,
      },
    });
  }

  async getRecent(limit = 50) {
    return this.prisma.requestLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { session: { select: { group: true, token: true } } },
    });
  }

  async getMetricsByVariant() {
    const logs = await this.prisma.requestLog.findMany();
    const byVariant: Record<
      string,
      {
        requestCount: number;
        totalLatency: number;
        fallbackCount: number;
        highConfidenceCount: number;
        injectionBlocked: number;
        cohortViolations: number;
      }
    > = {};

    const fallbackText =
      'I cannot find a matching patient in your cohort, or I cannot answer this question based on the available records.';

    for (const log of logs) {
      const v = log.promptVariant;
      if (!byVariant[v]) {
        byVariant[v] = {
          requestCount: 0,
          totalLatency: 0,
          fallbackCount: 0,
          highConfidenceCount: 0,
          injectionBlocked: 0,
          cohortViolations: 0,
        };
      }
      const m = byVariant[v];
      m.requestCount++;
      m.totalLatency += log.latencyMs;
      const resp = log.structuredResponse as { answer?: string; confidence?: string } | null;
      if (resp?.answer === fallbackText) m.fallbackCount++;
      if (resp?.confidence === 'High') m.highConfidenceCount++;
      if (log.injectionAttempt) m.injectionBlocked++;
      if (log.cohortViolation) m.cohortViolations++;
    }

    return Object.entries(byVariant).map(([variant, m]) => ({
      variant,
      requestCount: m.requestCount,
      avgLatencyMs: m.requestCount ? Math.round(m.totalLatency / m.requestCount) : 0,
      fallbackRate: m.requestCount ? m.fallbackCount / m.requestCount : 0,
      highConfidenceRate: m.requestCount ? m.highConfidenceCount / m.requestCount : 0,
      injectionBlockedCount: m.injectionBlocked,
      cohortViolationCount: m.cohortViolations,
    }));
  }
}
