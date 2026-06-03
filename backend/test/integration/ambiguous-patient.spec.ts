import { Test, TestingModule } from '@nestjs/testing';
import { PatientResolverService } from '../../src/patient/patient-resolver.service';
import { PatientRepository } from '../../src/patient/patient.repository';
import { SessionContextService } from '../../src/patient/session-context.service';

describe('Ambiguous patient handling', () => {
  let service: PatientResolverService;

  beforeEach(async () => {
    const repo = {
      findByFirstNameAndCohort: jest.fn().mockResolvedValue([
        { patientId: '1', firstName: 'Jean', lastName: 'Berry', cohort: 'A' },
        { patientId: '2', firstName: 'Jean', lastName: 'Other', cohort: 'A' },
      ]),
      findByIdsAndCohort: jest.fn().mockResolvedValue([
        { patientId: '1', firstName: 'Jean', lastName: 'Berry', cohort: 'A' },
        { patientId: '2', firstName: 'Jean', lastName: 'Other', cohort: 'A' },
      ]),
      findByLastNameAndCohort: jest.fn(),
      findByFullNameAndCohort: jest.fn(),
      findByIdAndCohort: jest.fn(),
      findByGenderAndCohort: jest.fn(),
      findByBirthYearAndCohort: jest.fn(),
      findByStatusAndCohort: jest.fn(),
      findByConditionKeywordAndCohort: jest.fn(),
      findByAllergyKeywordAndCohort: jest.fn(),
      findByMedicationKeywordAndCohort: jest.fn(),
      findByCohort: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientResolverService,
        SessionContextService,
        { provide: PatientRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(PatientResolverService);
  });

  it('never guesses when multiple patients match first name (descriptive attributes)', async () => {
    const result = await service.resolve('Tell me about patient Jean', 'A', {
      sessionId: 'cohort-A',
    });
    expect(result.status).toBe('ambiguous');
    expect(result.method).toBe('descriptive_attributes');
    expect(result.matches?.length).toBe(2);
    expect(result.patient).toBeUndefined();
  });
});
