import { Module } from '@nestjs/common';
import { ChzzkService } from './chzzk.service';
import { ConfigModule } from '@nestjs/config';
import { SongRequestModule } from '../song-request/song-request.module';

@Module({
  imports: [ConfigModule, SongRequestModule],
  providers: [ChzzkService],
})
export class ChzzkModule {}
