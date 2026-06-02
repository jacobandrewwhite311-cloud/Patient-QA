import { RetrievalService } from './retrieval.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RetrievalService', () => {
  let service: RetrievalService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      patient: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      patientAllergy: { findMany: jest.fn().mockResolvedValue([]) },
      patientCondition: { findMany: jest.fn().mockResolvedValue([]) },
      patientMedication: { findMany: jest.fn().mockResolvedValue([]) },
      patientObservation: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as jest.Mocked<PrismaService>;
    service = new RetrievalService(prisma);
  });

  it('getPatientRecords returns empty when patient not in cohort', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);
    const records = await service.getPatientRecords(
      'c2f61106-e476-4104-b5a6-ebb071f1044c',
      'A',
    );
    expect(records).toEqual([]);
    expect(prisma.patientAllergy.findMany).not.toHaveBeenCalled();
  });

  it('getPatientRecords fetches child tables when cohort matches', async () => {
    prisma.patient.findFirst.mockResolvedValue({
      id: 'c2f61106-e476-4104-b5a6-ebb071f1044c',
      group: 'B',
    } as never);
    prisma.patientAllergy.findMany.mockResolvedValue([
      { id: 'a1', patientId: 'c2f61106-e476-4104-b5a6-ebb071f1044c', allergen: 'Penicillin' },
    ] as never);

    const records = await service.getPatientRecords(
      'c2f61106-e476-4104-b5a6-ebb071f1044c',
      'B',
    );
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0].table).toBe('patient_allergies');
  });

  it('resolvePatient scopes query to cohort', async () => {
    prisma.patient.findMany.mockResolvedValue([
      {
        id: '9ec974ce-91d6-48e3-a8af-796c05348080',
        nameFirst: 'Adolfo',
        nameLast: 'Ricker',
      },
    ] as never);

    const result = await service.resolvePatient(
      'What allergies does Adolfo Ricker have?',
      'A',
    );
    expect(result.match?.patientId).toBe('9ec974ce-91d6-48e3-a8af-796c05348080');
    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ group: 'A' }),
      }),
    );
  });
});
