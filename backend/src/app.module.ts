import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import {
  ChatLogEntity,
  EvaluationResultEntity,
  ExperimentAssignmentEntity,
  PatientAllergyEntity,
  PatientConditionEntity,
  PatientEntity,
  PatientMedicationEntity,
  PatientObservationEntity,
  SecurityEventEntity,
} from './database/entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Serve the exported Expo web app (frontend/dist) so the site and the API
    // share one origin on the single open port. API routes are POST-only and do
    // not collide with the static GET handler; unknown GET paths fall back to
    // index.html for client-side routing.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '..', 'frontend', 'dist'),
      exclude: ['/cohort/(.*)', '/chat', '/evaluation/(.*)', '/health'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [
          PatientEntity,
          PatientAllergyEntity,
          PatientConditionEntity,
          PatientMedicationEntity,
          PatientObservationEntity,
          ChatLogEntity,
          SecurityEventEntity,
          EvaluationResultEntity,
          ExperimentAssignmentEntity,
        ],
        synchronize: false,
        logging: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    ChatModule,
    EvaluationModule,
  ],
})
export class AppModule {}
