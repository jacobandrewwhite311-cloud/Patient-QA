import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConfidenceService } from './confidence.service';
import { PatientModule } from '../patient/patient.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { SecurityModule } from '../security/security.module';
import { LangChainModule } from '../langchain/langchain.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PatientModule,
    RetrievalModule,
    SecurityModule,
    LangChainModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ConfidenceService],
  exports: [ChatService],
})
export class ChatModule {}
