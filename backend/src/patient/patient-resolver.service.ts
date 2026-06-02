import { Injectable } from '@nestjs/common';
import { PatientRepository } from './patient.repository';
import { Cohort } from '../common/types';

export interface PatientMatch {
  patientId: string;
  firstName: string;
  lastName: string;
  cohort: Cohort;
}

export interface PatientResolutionResult {
  status: 'resolved' | 'ambiguous' | 'not_found';
  patient?: PatientMatch;
  matches?: PatientMatch[];
}

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

@Injectable()
export class PatientResolverService {
  constructor(private readonly patientRepository: PatientRepository) {}

  async resolve(query: string, cohort: Cohort): Promise<PatientResolutionResult> {
    const normalized = query.trim();

    const uuidMatch = normalized.match(UUID_REGEX);
    if (uuidMatch) {
      const patient = await this.patientRepository.findByIdAndCohort(uuidMatch[0], cohort);
      if (!patient) {
        return { status: 'not_found' };
      }
      return {
        status: 'resolved',
        patient: this.toMatch(patient),
      };
    }

    const firstOnly = normalized.match(/(?:first\s+name|patient)\s+([A-Za-z][A-Za-z'-]+)/i);
    if (firstOnly) {
      const matches = await this.patientRepository.findByFirstNameAndCohort(firstOnly[1], cohort);
      return this.fromMatches(matches);
    }

    const lastOnly = normalized.match(/(?:last\s+name)\s+([A-Za-z][A-Za-z'-]+)/i);
    if (lastOnly) {
      const matches = await this.patientRepository.findByLastNameAndCohort(lastOnly[1], cohort);
      return this.fromMatches(matches);
    }

    const capitalizedPair = normalized.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
    if (capitalizedPair) {
      const matches = await this.patientRepository.findByFullNameAndCohort(
        capitalizedPair[1],
        capitalizedPair[2],
        cohort,
      );
      if (matches.length > 0) {
        return this.fromMatches(matches);
      }
    }

    const fullNameMatch = normalized.match(
      /(?:patient\s+)?([A-Za-z][A-Za-z'-]+)\s+([A-Za-z][A-Za-z'-]+)/i,
    );
    if (fullNameMatch) {
      const matches = await this.patientRepository.findByFullNameAndCohort(
        fullNameMatch[1],
        fullNameMatch[2],
        cohort,
      );
      return this.fromMatches(matches);
    }

    const nameTokens = normalized.match(/\b([A-Z][a-z]+)\b/g);
    if (nameTokens && nameTokens.length >= 2) {
      const matches = await this.patientRepository.findByFullNameAndCohort(
        nameTokens[0],
        nameTokens[1],
        cohort,
      );
      if (matches.length > 0) {
        return this.fromMatches(matches);
      }
    }

    if (nameTokens && nameTokens.length === 1) {
      const byFirst = await this.patientRepository.findByFirstNameAndCohort(nameTokens[0], cohort);
      const byLast = await this.patientRepository.findByLastNameAndCohort(nameTokens[0], cohort);
      const combined = [...byFirst, ...byLast.filter((p) => !byFirst.some((f) => f.patientId === p.patientId))];
      return this.fromMatches(combined);
    }

    return { status: 'not_found' };
  }

  private fromMatches(
    matches: Array<{ patientId: string; firstName: string; lastName: string; cohort: string }>,
  ): PatientResolutionResult {
    if (matches.length === 0) {
      return { status: 'not_found' };
    }
    if (matches.length === 1) {
      return { status: 'resolved', patient: this.toMatch(matches[0]) };
    }
    return {
      status: 'ambiguous',
      matches: matches.map((m) => this.toMatch(m)),
    };
  }

  private toMatch(patient: {
    patientId: string;
    firstName: string;
    lastName: string;
    cohort: string;
  }): PatientMatch {
    return {
      patientId: patient.patientId,
      firstName: patient.firstName,
      lastName: patient.lastName,
      cohort: patient.cohort as Cohort,
    };
  }
}
