import { Module } from '@nestjs/common';
import { ChatBotService } from './chat-bot.service';

@Module({
  providers: [ChatBotService]
})
export class ChatBotModule {}
