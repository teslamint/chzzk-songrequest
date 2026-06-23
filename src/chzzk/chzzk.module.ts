import { Module } from '@nestjs/common';
import { ChzzkService } from './chzzk.service';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, EventEmitterModule, AuthModule],
  providers: [ChzzkService],
})
export class ChzzkModule {}
