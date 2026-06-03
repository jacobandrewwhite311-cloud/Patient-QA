import { Test, TestingModule } from '@nestjs/testing';
import { PatientResolverService } from '../../src/patient/patient-resolver.service';
import { PatientRepository } from '../../src/patient/patient.repository';
import { SessionContextService } from '../../src/patient/session-context.service';

describe('PatientResolverService', () => {
  let service: PatientResolverService;
  let repo: jest.Mocked<PatientRepository>;
  let sessionContext: SessionContextService;

  const context = { sessionId: 'cohort-A' };

  beforeEach(async () => {
    repo = {
      findByIdAndCohort: jest.fn(),
      findByIdsAndCohort: jest.fn(),
      findByFirstNameAndCohort: jest.fn(),
      findByLastNameAndCohort: jest.fn(),
      findByFullNameAndCohort: jest.fn(),
      findByGenderAndCohort: jest.fn(),
      findByBirthYearAndCohort: jest.fn(),
      findByStatusAndCohort: jest.fn(),
      findByConditionKeywordAndCohort: jest.fn(),
      findByAllergyKeywordAndCohort: jest.fn(),
      findByMedicationKeywordAndCohort: jest.fn(),
      findByCohort: jest.fn(),
    } as unknown as jest.Mocked<PatientRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientResolverService,
        SessionContextService,
        { provide: PatientRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(PatientResolverService);
    sessionContext = module.get(SessionContextService);
  });

  it('priority 1: resolves by explicit patient id within cohort', async () => {
    const patientId = '9ec974ce-91d6-48e3-a8af-796c05348080';
    repo.findByIdAndCohort.mockResolvedValue({
      patientId,
      firstName: 'John',
      lastName: 'Smith',
      cohort: 'A',
    } as never);

    const result = await service.resolve(`Patient ${patientId} details`, 'A', context);
    expect(result.status).toBe('resolved');
    expect(result.method).toBe('explicit_id');
    expect(result.patient?.patientId).toBe(patientId);
  });

  it('priority 1: explicit id beats session context', async () => {
    const patientId = '9ec974ce-91d6-48e3-a8af-796c05348080';
    sessionContext.setLastPatientId('cohort-A', 'A', 'other-id');
    repo.findByIdAndCohort.mockResolvedValue({
      patientId,
      firstName: 'John',
      lastName: 'Smith',
      cohort: 'A',
    } as never);

    const result = await service.resolve(`Patient ${patientId} details`, 'A', context);
    expect(result.method).toBe('explicit_id');
    expect(repo.findByIdAndCohort).toHaveBeenCalledWith(patientId, 'A');
  });

  it('priority 2: resolves by explicit full name', async () => {
    repo.findByFullNameAndCohort.mockResolvedValue([
      { patientId: '1', firstName: 'Adolfo', lastName: 'Ricker', cohort: 'A' },
    ] as never);

    const result = await service.resolve('What medications is Adolfo Ricker taking?', 'A', context);
    expect(result.status).toBe('resolved');
    expect(result.method).toBe('explicit_full_name');
  });

  it('priority 3: returns ambiguous for descriptive first name with multiple matches', async () => {
    repo.findByFirstNameAndCohort.mockResolvedValue([
      { patientId: '1', firstName: 'Jean', lastName: 'A', cohort: 'A' },
      { patientId: '2', firstName: 'Jean', lastName: 'B', cohort: 'A' },
    ] as never);
    repo.findByIdsAndCohort.mockResolvedValue([
      { patientId: '1', firstName: 'Jean', lastName: 'A', cohort: 'A' },
      { patientId: '2', firstName: 'Jean', lastName: 'B', cohort: 'A' },
    ] as never);

    const result = await service.resolve('first name Jean', 'A', context);
    expect(result.status).toBe('ambiguous');
    expect(result.method).toBe('descriptive_attributes');
    expect(result.matches?.length).toBe(2);
  });

  it('priority 4: resolves from session last patient when query has no patient signals', async () => {
    const patientId = '9ec974ce-91d6-48e3-a8af-796c05348080';
    sessionContext.setLastPatientId('cohort-A', 'A', patientId);
    repo.findByIdAndCohort.mockResolvedValue({
      patientId,
      firstName: 'Adolfo',
      lastName: 'Ricker',
      cohort: 'A',
    } as never);

    const result = await service.resolve('What medications are they taking?', 'A', context);
    expect(result.status).toBe('resolved');
    expect(result.method).toBe('session_context');
    expect(result.patient?.patientId).toBe(patientId);
  });

  it('priority 5: safe fallback when nothing matches and no full name detected', async () => {
    const result = await service.resolve('What medications are they taking?', 'A', context);
    expect(result.status).toBe('not_found');
    expect(result.method).toBe('safe_fallback');
  });

  it('returns not_found for unknown explicit full name', async () => {
    repo.findByFullNameAndCohort.mockResolvedValue([]);
    const result = await service.resolve('What medications is Zzzzz Nonexistent taking?', 'A', context);
    expect(result.status).toBe('not_found');
    expect(result.method).toBe('explicit_full_name');
  });
});
