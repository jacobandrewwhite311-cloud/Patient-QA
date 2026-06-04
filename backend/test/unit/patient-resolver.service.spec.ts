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

  it('returns ambiguous (never guesses) when a bare first name has multiple matches', async () => {
    repo.findByFirstNameAndCohort.mockResolvedValue([
      { patientId: '1', firstName: 'Jean', lastName: 'A', cohort: 'A' },
      { patientId: '2', firstName: 'Jean', lastName: 'B', cohort: 'A' },
    ] as never);
    repo.findByLastNameAndCohort.mockResolvedValue([] as never);

    const result = await service.resolve('Tell me about Jean', 'A', context);
    expect(result.status).toBe('ambiguous');
    expect(result.method).toBe('single_name');
    expect(result.matches?.length).toBe(2);
    expect(result.patient).toBeUndefined();
  });

  it('priority 3: descriptive attribute search (gender) returns matches', async () => {
    repo.findByGenderAndCohort.mockResolvedValue([
      { patientId: '1', firstName: 'Ada', lastName: 'A', cohort: 'A' },
    ] as never);
    repo.findByIdsAndCohort.mockResolvedValue([
      { patientId: '1', firstName: 'Ada', lastName: 'A', cohort: 'A' },
    ] as never);

    const result = await service.resolve('show me a female patient', 'A', context);
    expect(result.method).toBe('descriptive_attributes');
  });

  it('priority 4: resolves he/she follow-ups from session last patient', async () => {
    const patientId = '9ec974ce-91d6-48e3-a8af-796c05348080';
    sessionContext.setLastPatientId('cohort-A', 'A', patientId);
    repo.findByIdAndCohort.mockResolvedValue({
      patientId,
      firstName: 'Adolfo',
      lastName: 'Ricker',
      cohort: 'A',
    } as never);

    const result = await service.resolve('What allergies does he have?', 'A', context);
    expect(result.status).toBe('resolved');
    expect(result.method).toBe('session_context');
    expect(result.patient?.patientId).toBe(patientId);
  });

  it('does not bind they/their to session even after a named patient was discussed', async () => {
    const patientId = '9ec974ce-91d6-48e3-a8af-796c05348080';
    sessionContext.setLastPatientId('cohort-A', 'A', patientId);

    const result = await service.resolve('What allergies do they have?', 'A', context);
    expect(result.status).toBe('not_found');
    expect(result.method).toBe('pronoun_unresolved');
    expect(repo.findByIdAndCohort).not.toHaveBeenCalled();
  });

  it('priority 5: undeterminable when clinical question has no patient identity', async () => {
    const result = await service.resolve('What is the latest dosage?', 'A', context);
    expect(result.status).toBe('not_found');
    expect(result.method).toBe('pronoun_unresolved');
  });

  it('pronoun reference with no session context is reported as undeterminable', async () => {
    const result = await service.resolve('What medications are they taking?', 'A', context);
    expect(result.status).toBe('not_found');
    expect(result.method).toBe('pronoun_unresolved');
  });

  it('treats allergies and room pronoun questions as undeterminable without session', async () => {
    const allergies = await service.resolve('What allergies do they have?', 'A', context);
    expect(allergies.method).toBe('pronoun_unresolved');

    const room = await service.resolve('What is their room number?', 'A', context);
    expect(room.method).toBe('pronoun_unresolved');
  });

  it('treats vague clinical queries without a patient as undeterminable', async () => {
    const result = await service.resolve('Show me the medications', 'A', context);
    expect(result.status).toBe('not_found');
    expect(result.method).toBe('pronoun_unresolved');
  });

  it('resolves "Does Adolfo Ricker..." despite the leading verb (overlapping name pairs)', async () => {
    repo.findByFullNameAndCohort.mockImplementation((first: string, last: string) =>
      Promise.resolve(
        first.toLowerCase() === 'adolfo' && last.toLowerCase() === 'ricker'
          ? ([{ patientId: '1', firstName: 'Adolfo', lastName: 'Ricker', cohort: 'A' }] as never)
          : ([] as never),
      ),
    );

    const result = await service.resolve('Does Adolfo Ricker have any documented allergies?', 'A', context);
    expect(result.status).toBe('resolved');
    expect(result.method).toBe('explicit_full_name');
    expect(result.patient?.firstName).toBe('Adolfo');
  });

  it('returns not_found for unknown explicit full name', async () => {
    repo.findByFullNameAndCohort.mockResolvedValue([]);
    const result = await service.resolve('What medications is Zzzzz Nonexistent taking?', 'A', context);
    expect(result.status).toBe('not_found');
    expect(result.method).toBe('explicit_full_name');
  });
});
