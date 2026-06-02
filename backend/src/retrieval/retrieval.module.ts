import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PatientAllergyEntity,
  PatientConditionEntity,
  PatientEntity,
  PatientMedicationEntity,
  PatientObservationEntity,
} from '../database/entities';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PatientEntity,
      PatientAllergyEntity,
      PatientConditionEntity,
      PatientMedicationEntity,
      PatientObservationEntity,
    ]),
  ],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
