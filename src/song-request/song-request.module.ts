import { Module } from '@nestjs/common';
import { SongRequestService } from './song-request.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../prisma/prisma.module';
import { SongRequestController } from './song-request.controller';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [CacheModule.register(), PrismaModule, EventEmitterModule],
  providers: [SongRequestService],
  exports: [SongRequestService],
  controllers: [SongRequestController],
})
export class SongRequestModule {}
