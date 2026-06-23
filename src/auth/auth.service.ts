import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Buzzk from 'buzzk';
import * as crypto from 'crypto';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async generateAuthUrl(): Promise<{ url: string; state: string }> {
    const state = crypto.randomBytes(16).toString('hex');
    await this.cacheManager.set(`oauth_state:${state}`, true, STATE_TTL_MS);

    const clientId = this.configService.get<string>('chzzk.client_id');
    const redirectUri = this.configService.get<string>('chzzk.redirect_uri');
    const url = `https://chzzk.naver.com/account-interlock?clientId=${clientId}&redirectUri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return { url, state };
  }

  async handleCallback(code: string, state: string) {
    const stored = await this.cacheManager.get(`oauth_state:${state}`);
    if (!stored) {
      throw new Error('Invalid OAuth state');
    }
    await this.cacheManager.del(`oauth_state:${state}`);

    const tokens = await Buzzk.oauth.get(code, state);
    if (!tokens) {
      throw new Error('Token exchange failed');
    }

    const channelInfo = await Buzzk.oauth.resolve(tokens.access);
    if (!channelInfo) {
      throw new Error('Failed to resolve channel from token');
    }

    const channel = await this.prisma.channel.upsert({
      where: { channelId: channelInfo.channelID },
      update: {
        name: channelInfo.name,
        imageUrl: channelInfo.imageURL,
        followerCount: channelInfo.follower,
        status: 'ACTIVE',
      },
      create: {
        channelId: channelInfo.channelID,
        name: channelInfo.name,
        imageUrl: channelInfo.imageURL,
        followerCount: channelInfo.follower,
      },
    });

    const expiresAt = new Date(Date.now() + tokens.expireIn * 1000);

    await this.prisma.chzzkToken.upsert({
      where: { channelId: channelInfo.channelID },
      update: {
        accessToken: tokens.access,
        refreshToken: tokens.refresh,
        expiresAt,
      },
      create: {
        channelId: channelInfo.channelID,
        accessToken: tokens.access,
        refreshToken: tokens.refresh,
        expiresAt,
      },
    });

    this.logger.log(`OAuth completed for channel: ${channel.name} (${channel.channelId})`);
    return channel;
  }

  async getValidAccessToken(channelId: string): Promise<string | null> {
    const tokenRecord = await this.prisma.chzzkToken.findUnique({
      where: { channelId },
    });

    if (!tokenRecord) {
      return null;
    }

    const bufferTime = new Date(Date.now() + TOKEN_REFRESH_BUFFER_MS);
    if (tokenRecord.expiresAt > bufferTime) {
      return tokenRecord.accessToken;
    }

    this.logger.debug(`Refreshing token for channel ${channelId}`);
    const refreshed = await Buzzk.oauth.refresh(tokenRecord.refreshToken);
    if (!refreshed) {
      this.logger.warn(`Token refresh failed for ${channelId} — marking NEEDS_REAUTH`);
      await this.prisma.channel.update({
        where: { channelId },
        data: { status: 'NEEDS_REAUTH' },
      });
      return null;
    }

    const expiresAt = new Date(Date.now() + refreshed.expireIn * 1000);
    await this.prisma.chzzkToken.upsert({
      where: { channelId },
      update: {
        accessToken: refreshed.access,
        refreshToken: refreshed.refresh,
        expiresAt,
      },
      create: {
        channelId,
        accessToken: refreshed.access,
        refreshToken: refreshed.refresh,
        expiresAt,
      },
    });

    return refreshed.access;
  }

  async toggleBotAccount(channelId: string, useBotAccount: boolean): Promise<void> {
    await this.prisma.channel.update({
      where: { channelId },
      data: { useBotAccount },
    });
    this.logger.log(`Bot account ${useBotAccount ? 'enabled' : 'disabled'} for channel ${channelId}`);
    this.eventEmitter.emit('botAccount.changed', { channelId, useBotAccount });
  }
}
