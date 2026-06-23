import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { chzzk, redis as redisConfig } from './config';
import Joi from 'joi';
import { ChzzkModule } from './chzzk/chzzk.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ChatBotModule } from './chat-bot/chat-bot.module';
import { EventsModule } from './events/events.module';
import { WidgetController } from './widget/widget.controller';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: redisConfig().host,
        port: redisConfig().port,
        username: redisConfig().user,
        password: redisConfig().pass,
      },
    }),
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production')
          .default('development'),
        PORT: Joi.number().port().default(3000),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().port().default(5432),
        REDIS_USER: Joi.string(),
        REDIS_PASS: Joi.string(),
        CLIENT_ID: Joi.string().required(),
        CLIENT_SECRET: Joi.string().required(),
        CHZZK_REDIRECT_URI: Joi.string().uri().required(),
        BOT_NID_AUT: Joi.string().optional().allow(''),
        BOT_NID_SES: Joi.string().optional().allow(''),
      }),
      validationOptions: {
        abortEarly: true,
      },
      load: [redisConfig, chzzk],
      cache: true,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ChzzkModule,
    ChatBotModule,
    EventsModule,
    AuthModule,
  ],
  controllers: [WidgetController],
})
export class AppModule {}
