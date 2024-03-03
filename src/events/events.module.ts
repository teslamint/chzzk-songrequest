import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { SongRequestModule } from '../song-request/song-request.module';

@Module({
  imports: [SongRequestModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
