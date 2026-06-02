import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessionsService.createSession(dto.group);
  }
}
