import { Module } from '@nestjs/common';
import { ChzzkService } from './chzzk.service';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, EventEmitterModule, AuthModule, PrismaModule],
  providers: [ChzzkService],
})
export class ChzzkModule {}
