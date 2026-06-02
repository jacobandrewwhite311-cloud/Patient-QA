import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientEntity } from '../database/entities';
import { PatientRepository } from './patient.repository';
import { PatientResolverService } from './patient-resolver.service';

@Module({
  imports: [TypeOrmModule.forFeature([PatientEntity])],
  providers: [PatientRepository, PatientResolverService],
  exports: [PatientRepository, PatientResolverService],
})
export class PatientModule {}
