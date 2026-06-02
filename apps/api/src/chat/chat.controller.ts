import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { CohortCtx } from '../auth/cohort.decorator';
import { CohortContext } from '../common/cohort-context';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

@Controller('chat')
@UseGuards(BasicAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(
    @Body() dto: ChatMessageDto,
    @CohortCtx() ctx: CohortContext,
  ) {
    return this.chatService.handleMessage(dto.message, ctx);
  }
}
