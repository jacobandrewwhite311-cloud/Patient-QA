import { LangChainService } from '../../src/langchain/langchain.service';

describe('LangChainService experiment assignment', () => {
  it('assigns variant deterministically via hash mod 2', () => {
    const service = new LangChainService({ get: () => undefined } as never, {} as never);
    const patientId = '9ec974ce-91d6-48e3-a8af-796c05348080';
    const variantA = service.hashMod2(patientId);
    const variantB = service.hashMod2(patientId);
    expect(variantA).toBe(variantB);
    expect(['A', 'B']).toContain(variantA);
  });
});
