import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(group: string) {
    const token = randomUUID();
    const session = await this.prisma.session.create({
      data: { token, group },
    });
    return { token: session.token, group: session.group };
  }

  async findByToken(token: string) {
    return this.prisma.session.findUnique({ where: { token } });
  }
}
