import { Module } from '@nestjs/common';
import { ChatBotService } from './chat-bot.service';
import { SongRequestModule } from '../song-request/song-request.module';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [ConfigModule, EventEmitterModule, SongRequestModule],
  providers: [ChatBotService],
})
export class ChatBotModule {}
