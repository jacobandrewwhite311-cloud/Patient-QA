import { Test, TestingModule } from '@nestjs/testing';
import { PatientResolverService } from '../../src/patient/patient-resolver.service';
import { PatientRepository } from '../../src/patient/patient.repository';

describe('PatientResolverService', () => {
  let service: PatientResolverService;
  let repo: jest.Mocked<PatientRepository>;

  beforeEach(async () => {
    repo = {
      findByIdAndCohort: jest.fn(),
      findByFirstNameAndCohort: jest.fn(),
      findByLastNameAndCohort: jest.fn(),
      findByFullNameAndCohort: jest.fn(),
      findByCohort: jest.fn(),
    } as unknown as jest.Mocked<PatientRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [PatientResolverService, { provide: PatientRepository, useValue: repo }],
    }).compile();

    service = module.get(PatientResolverService);
  });

  it('resolves by patient id within cohort', async () => {
    const patientId = '9ec974ce-91d6-48e3-a8af-796c05348080';
    repo.findByIdAndCohort.mockResolvedValue({
      patientId,
      firstName: 'John',
      lastName: 'Smith',
      cohort: 'A',
    } as never);

    const result = await service.resolve(`Patient ${patientId} details`, 'A');
    expect(result.status).toBe('resolved');
    expect(result.patient?.patientId).toBe(patientId);
  });

  it('returns ambiguous when multiple matches exist', async () => {
    repo.findByFirstNameAndCohort.mockResolvedValue([
      { patientId: '1', firstName: 'Jean', lastName: 'A', cohort: 'A' },
      { patientId: '2', firstName: 'Jean', lastName: 'B', cohort: 'A' },
    ] as never);

    const result = await service.resolve('first name Jean', 'A');
    expect(result.status).toBe('ambiguous');
    expect(result.matches?.length).toBe(2);
  });

  it('returns not_found when no patient matches', async () => {
    repo.findByFullNameAndCohort.mockResolvedValue([]);
    const result = await service.resolve('What medications is Zzzzz Nonexistent taking?', 'A');
    expect(result.status).toBe('not_found');
  });
});
