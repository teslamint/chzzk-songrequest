import { Module } from '@nestjs/common';
import { ChzzkService } from './chzzk.service';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [ConfigModule, EventEmitterModule],
  providers: [ChzzkService],
})
export class ChzzkModule {}
