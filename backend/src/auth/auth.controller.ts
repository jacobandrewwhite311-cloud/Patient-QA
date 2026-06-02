import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SelectCohortDto } from '../common/dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('cohort')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('select')
  selectCohort(@Body() dto: SelectCohortDto) {
    return this.authService.issueCohortToken(dto.cohort);
  }
}

@Controller()
export class HealthController {
  @Post('health')
  health() {
    return { status: 'ok' };
  }
}
