import { Module } from '@nestjs/common';
import { RequestLogService } from '../chat/request-log.service';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [RequestLogService],
})
export class AdminModule {}
