import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { RequestLogService } from '../chat/request-log.service';

@Controller('admin')
@UseGuards(BasicAuthGuard)
export class AdminController {
  constructor(private readonly requestLog: RequestLogService) {}

  @Get('logs')
  async logs(@Query('limit') limit?: string) {
    if (process.env.ENABLE_ADMIN_LOGS !== 'true') {
      return { enabled: false, message: 'Set ENABLE_ADMIN_LOGS=true to enable' };
    }
    const n = limit ? parseInt(limit, 10) : 50;
    return this.requestLog.getRecent(n);
  }

  @Get('metrics')
  async metrics() {
    return this.requestLog.getMetricsByVariant();
  }
}
