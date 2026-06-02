import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CohortContext } from '../common/cohort-context';

export const CohortCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CohortContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.cohortContext;
  },
);
