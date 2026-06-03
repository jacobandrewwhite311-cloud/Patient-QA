import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PatientAllergyEntity,
  PatientConditionEntity,
  PatientEntity,
  PatientMedicationEntity,
} from '../database/entities';
import { PatientRepository } from './patient.repository';
import { PatientResolverService } from './patient-resolver.service';
import { SessionContextService } from './session-context.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PatientEntity,
      PatientConditionEntity,
      PatientAllergyEntity,
      PatientMedicationEntity,
    ]),
  ],
  providers: [PatientRepository, PatientResolverService, SessionContextService],
  exports: [PatientRepository, PatientResolverService, SessionContextService],
})
export class PatientModule {}
