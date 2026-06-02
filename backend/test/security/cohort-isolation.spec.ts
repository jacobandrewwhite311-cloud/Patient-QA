import { ForbiddenException } from '@nestjs/common';
import { RetrievalService } from '../../src/retrieval/retrieval.service';

describe('RetrievalService cohort isolation', () => {
  let service: RetrievalService;

  beforeEach(() => {
    service = new RetrievalService({} as never, {} as never, {} as never, {} as never, {} as never);
  });

  it('throws when record cohort does not match JWT cohort', () => {
    expect(() => service.assertCohortMatch('B', 'A')).toThrow(ForbiddenException);
    expect(() => service.assertCohortMatch('A', 'B')).toThrow(ForbiddenException);
  });

  it('passes when cohort matches', () => {
    expect(() => service.assertCohortMatch('A', 'A')).not.toThrow();
    expect(() => service.assertCohortMatch('B', 'B')).not.toThrow();
  });
});

describe('Cohort isolation unit guarantees', () => {
  it('Group A cannot access Group B records by cohort guard', () => {
    const service = new RetrievalService({} as never, {} as never, {} as never, {} as never, {} as never);
    expect(() => service.assertCohortMatch('B', 'A')).toThrow('Cohort isolation violation');
  });

  it('Group B cannot access Group A records by cohort guard', () => {
    const service = new RetrievalService({} as never, {} as never, {} as never, {} as never, {} as never);
    expect(() => service.assertCohortMatch('A', 'B')).toThrow('Cohort isolation violation');
  });
});
