import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatLogEntity } from '../database/entities';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatLogEntity])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
