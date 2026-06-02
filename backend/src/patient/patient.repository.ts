import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientEntity } from '../database/entities';
import { Cohort } from '../common/types';

@Injectable()
export class PatientRepository {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly repo: Repository<PatientEntity>,
  ) {}

  findByCohort(cohort: Cohort): Promise<PatientEntity[]> {
    return this.repo.find({ where: { cohort } });
  }

  findByIdAndCohort(patientId: string, cohort: Cohort): Promise<PatientEntity | null> {
    return this.repo.findOne({ where: { patientId, cohort } });
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
}
