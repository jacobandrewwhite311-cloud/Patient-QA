import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecurityEventEntity } from '../database/entities';

@Injectable()
export class SecurityEventService {
  constructor(
    @InjectRepository(SecurityEventEntity)
    private readonly repo: Repository<SecurityEventEntity>,
  ) {}

  async logEvent(params: {
    cohort: string | null;
    requestId: string;
    eventType: string;
    severity: string;
    userQuery: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const event = this.repo.create({
      cohort: params.cohort,
      requestId: params.requestId,
      eventType: params.eventType,
      severity: params.severity,
      userQuery: params.userQuery,
      details: params.details ?? {},
    });
    await this.repo.save(event);
  }
}
