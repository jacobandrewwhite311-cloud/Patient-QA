import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityEventEntity } from '../database/entities';
import { InjectionDetectionService } from './injection-detection.service';
import { SecurityEventService } from './security-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([SecurityEventEntity])],
  providers: [InjectionDetectionService, SecurityEventService],
  exports: [InjectionDetectionService, SecurityEventService],
})
export class SecurityModule {}
