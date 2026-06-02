import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PatientAllergyEntity,
  PatientConditionEntity,
  PatientEntity,
  PatientMedicationEntity,
  PatientObservationEntity,
} from '../database/entities';
import { Citation, Cohort, RetrievedRecord } from '../common/types';

export interface RetrievalBundle {
  patient: PatientEntity;
  records: RetrievedRecord[];
  citations: Citation[];
}

@Injectable()
export class RetrievalService {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly patientRepo: Repository<PatientEntity>,
    @InjectRepository(PatientAllergyEntity)
    private readonly allergyRepo: Repository<PatientAllergyEntity>,
    @InjectRepository(PatientConditionEntity)
    private readonly conditionRepo: Repository<PatientConditionEntity>,
    @InjectRepository(PatientMedicationEntity)
    private readonly medicationRepo: Repository<PatientMedicationEntity>,
    @InjectRepository(PatientObservationEntity)
    private readonly observationRepo: Repository<PatientObservationEntity>,
  ) {}

  async retrievePatientBundle(patientId: string, cohort: Cohort): Promise<RetrievalBundle | null> {
    const patient = await this.patientRepo.findOne({ where: { patientId, cohort } });
    if (!patient) {
      return null;
    }

    this.assertCohortMatch(patient.cohort, cohort);

    const [allergies, conditions, medications, observations] = await Promise.all([
      this.allergyRepo.find({ where: { patientId, cohort } }),
      this.conditionRepo.find({ where: { patientId, cohort } }),
      this.medicationRepo.find({ where: { patientId, cohort } }),
      this.observationRepo.find({ where: { patientId, cohort }, take: 20, order: { recordedTime: 'DESC' } }),
    ]);

    const records: RetrievedRecord[] = [
      {
        table: 'patients',
        record_id: patient.patientId,
        data: {
          patient_id: patient.patientId,
          first_name: patient.firstName,
          last_name: patient.lastName,
          cohort: patient.cohort,
          dob: patient.dob,
          gender: patient.gender,
          status: patient.status,
        },
      },
      ...allergies.map((a) => ({
        table: 'patient_allergy',
        record_id: a.id,
        data: {
          id: a.id,
          patient_id: a.patientId,
          allergen: a.allergen,
          category: a.category,
          clinical_status: a.clinicalStatus,
          severity: a.severity,
          reaction_type: a.reactionType,
          cohort: a.cohort,
        },
      })),
      ...conditions.map((c) => ({
        table: 'patient_condition',
        record_id: c.id,
        data: {
          id: c.id,
          patient_id: c.patientId,
          icd_10_code: c.icd10Code,
          icd_10_description: c.icd10Description,
          clinical_status: c.clinicalStatus,
          is_primary_diagnosis: c.isPrimaryDiagnosis,
          cohort: c.cohort,
        },
      })),
      ...medications.map((m) => ({
        table: 'patient_medication',
        record_id: m.id,
        data: {
          id: m.id,
          patient_id: m.patientId,
          description: m.description,
          generic_name: m.genericName,
          strength: m.strength,
          strength_unit: m.strengthUnit,
          directions: m.directions,
          status: m.status,
          cohort: m.cohort,
        },
      })),
      ...observations.map((o) => ({
        table: 'patient_observation',
        record_id: o.id,
        data: {
          id: o.id,
          patient_id: o.patientId,
          method: o.method,
          recorded_time: o.recordedTime,
          observation: o.data,
          cohort: o.cohort,
        },
      })),
    ];

    const citations: Citation[] = records.map((r) => ({
      table: r.table,
      record_id: r.record_id,
    }));

    return { patient, records, citations };
  }

  assertCohortMatch(recordCohort: string, jwtCohort: Cohort): void {
    if (recordCohort !== jwtCohort) {
      throw new ForbiddenException('Cohort isolation violation detected');
    }
  }
}
