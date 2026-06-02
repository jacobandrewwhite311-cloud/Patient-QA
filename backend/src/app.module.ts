import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
