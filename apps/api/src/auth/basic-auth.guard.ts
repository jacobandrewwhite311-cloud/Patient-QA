import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { CohortContext } from '../common/cohort-context';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader?.startsWith('Basic ')) {
      throw new UnauthorizedException('Missing Basic authentication');
    }

    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const token = decoded.split(':')[0]?.trim();

    if (!token) {
      throw new UnauthorizedException('Invalid token');
    }

    const session = await this.prisma.session.findUnique({
      where: { token },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    const cohortContext: CohortContext = {
      sessionId: session.id,
      token: session.token,
      group: session.group,
    };

    request.cohortContext = cohortContext;
    return true;
  }
}
