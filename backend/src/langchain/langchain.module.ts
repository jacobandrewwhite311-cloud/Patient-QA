import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperimentAssignmentEntity } from '../database/entities';
import { LangChainService } from './langchain.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExperimentAssignmentEntity])],
  providers: [LangChainService],
  exports: [LangChainService],
})
export class LangChainModule {}
