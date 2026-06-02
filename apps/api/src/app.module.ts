import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BasicAuthGuard } from './auth/basic-auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';
import { ChatModule } from './chat/chat.module';
import { HealthController } from './health.controller';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [PrismaModule, SessionsModule, ChatModule, AdminModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: BasicAuthGuard }],
})
export class AppModule {}
