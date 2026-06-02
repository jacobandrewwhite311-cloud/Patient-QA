import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatLogEntity } from '../database/entities';
import { Citation, ConfidenceLevel } from '../common/types';

export interface AuditLogInput {
  requestId: string;
  cohort: string;
  patientId?: string | null;
  variant?: string | null;
  retrievedRecords: unknown[];
  promptVersion?: string | null;
  userQuery: string;
  rawModelOutput?: string | null;
  finalAnswer?: string | null;
  confidence?: ConfidenceLevel | null;
  citations?: Citation[];
  injectionDetected?: boolean;
  securityViolation?: boolean;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(ChatLogEntity)
    private readonly repo: Repository<ChatLogEntity>,
  ) {}

  async logChat(input: AuditLogInput): Promise<void> {
    const log = this.repo.create({
      requestId: input.requestId,
      cohort: input.cohort,
      patientId: input.patientId ?? null,
      variant: input.variant ?? null,
      retrievedRecords: input.retrievedRecords,
      promptVersion: input.promptVersion ?? null,
      userQuery: input.userQuery,
      rawModelOutput: input.rawModelOutput ?? null,
      finalAnswer: input.finalAnswer ?? null,
      confidence: input.confidence ?? null,
      citations: input.citations ?? [],
      injectionDetected: input.injectionDetected ?? false,
      securityViolation: input.securityViolation ?? false,
    });
    await this.repo.save(log);
  }
}
