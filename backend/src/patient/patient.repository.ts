import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PatientAllergyEntity,
  PatientConditionEntity,
  PatientEntity,
  PatientMedicationEntity,
} from '../database/entities';
import { Cohort } from '../common/types';

@Injectable()
export class PatientRepository {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly repo: Repository<PatientEntity>,
    @InjectRepository(PatientConditionEntity)
    private readonly conditionRepo: Repository<PatientConditionEntity>,
    @InjectRepository(PatientAllergyEntity)
    private readonly allergyRepo: Repository<PatientAllergyEntity>,
    @InjectRepository(PatientMedicationEntity)
    private readonly medicationRepo: Repository<PatientMedicationEntity>,
  ) {}

  findByCohort(cohort: Cohort): Promise<PatientEntity[]> {
    return this.repo.find({ where: { cohort } });
  }

  findByIdAndCohort(patientId: string, cohort: Cohort): Promise<PatientEntity | null> {
    return this.repo.findOne({ where: { patientId, cohort } });
  }

  findByIdsAndCohort(patientIds: string[], cohort: Cohort): Promise<PatientEntity[]> {
    if (patientIds.length === 0) return Promise.resolve([]);
    return this.repo
      .createQueryBuilder('p')
      .where('p.cohort = :cohort', { cohort })
      .andWhere('p.patient_id IN (:...patientIds)', { patientIds })
      .getMany();
  }

  findByFirstNameAndCohort(firstName: string, cohort: Cohort): Promise<PatientEntity[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.cohort = :cohort', { cohort })
      .andWhere('LOWER(p.first_name) = LOWER(:firstName)', { firstName })
      .getMany();
  }

  findByLastNameAndCohort(lastName: string, cohort: Cohort): Promise<PatientEntity[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.cohort = :cohort', { cohort })
      .andWhere('LOWER(p.last_name) = LOWER(:lastName)', { lastName })
      .getMany();
  }

  findByFullNameAndCohort(
    firstName: string,
    lastName: string,
    cohort: Cohort,
  ): Promise<PatientEntity[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.cohort = :cohort', { cohort })
      .andWhere('LOWER(p.first_name) = LOWER(:firstName)', { firstName })
      .andWhere('LOWER(p.last_name) = LOWER(:lastName)', { lastName })
      .getMany();
  }

  findByGenderAndCohort(gender: string, cohort: Cohort): Promise<PatientEntity[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.cohort = :cohort', { cohort })
      .andWhere('LOWER(p.gender) = LOWER(:gender)', { gender })
      .getMany();
  }

  findByBirthYearAndCohort(year: number, cohort: Cohort): Promise<PatientEntity[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.cohort = :cohort', { cohort })
      .andWhere('EXTRACT(YEAR FROM p.dob) = :year', { year })
      .getMany();
  }

  findByStatusAndCohort(status: string, cohort: Cohort): Promise<PatientEntity[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.cohort = :cohort', { cohort })
      .andWhere('LOWER(p.status) = LOWER(:status)', { status })
      .getMany();
  }

  async findByConditionKeywordAndCohort(keyword: string, cohort: Cohort): Promise<PatientEntity[]> {
    const rows = await this.conditionRepo
      .createQueryBuilder('c')
      .select('c.patient_id', 'patientId')
      .where('c.cohort = :cohort', { cohort })
      .andWhere('LOWER(c.icd_10_description) LIKE LOWER(:keyword)', { keyword: `%${keyword}%` })
      .getRawMany<{ patientId: string }>();

    return this.findByIdsAndCohort(
      [...new Set(rows.map((r) => r.patientId))],
      cohort,
    );
  }

  async findByAllergyKeywordAndCohort(keyword: string, cohort: Cohort): Promise<PatientEntity[]> {
    const rows = await this.allergyRepo
      .createQueryBuilder('a')
      .select('a.patient_id', 'patientId')
      .where('a.cohort = :cohort', { cohort })
      .andWhere('LOWER(a.allergen) LIKE LOWER(:keyword)', { keyword: `%${keyword}%` })
      .getRawMany<{ patientId: string }>();

    return this.findByIdsAndCohort(
      [...new Set(rows.map((r) => r.patientId))],
      cohort,
    );
  }

  async findByMedicationKeywordAndCohort(keyword: string, cohort: Cohort): Promise<PatientEntity[]> {
    const rows = await this.medicationRepo
      .createQueryBuilder('m')
      .select('m.patient_id', 'patientId')
      .where('m.cohort = :cohort', { cohort })
      .andWhere(
        '(LOWER(m.description) LIKE LOWER(:keyword) OR LOWER(m.generic_name) LIKE LOWER(:keyword))',
        { keyword: `%${keyword}%` },
      )
      .getRawMany<{ patientId: string }>();

    return this.findByIdsAndCohort(
      [...new Set(rows.map((r) => r.patientId))],
      cohort,
    );
  }
}
