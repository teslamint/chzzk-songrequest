import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { SongRequestModule } from '../song-request/song-request.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [SongRequestModule, EventEmitterModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
