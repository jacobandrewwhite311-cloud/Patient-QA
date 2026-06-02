import { Module } from '@nestjs/common';
import { ExperimentService } from '../experiment/experiment.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { InjectionDetectorService } from '../security/injection-detector.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmService } from './llm.service';
import { OutputValidatorService } from './output-validator.service';
import { RequestLogService } from './request-log.service';

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    RetrievalService,
    InjectionDetectorService,
    ExperimentService,
    LlmService,
    OutputValidatorService,
    RequestLogService,
  ],
  exports: [ChatService, RequestLogService],
})
export class ChatModule {}
