import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as Buzzk from 'buzzk';

jest.mock('buzzk', () => ({
  oauth: {
    get: jest.fn(),
    refresh: jest.fn(),
    resolve: jest.fn(),
  },
  auth: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let cacheManager: any;

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'chzzk.client_id': 'test-client-id',
                'chzzk.client_secret': 'test-client-secret',
                'chzzk.redirect_uri': 'http://localhost:3001/auth/chzzk/callback',
              };
              return map[key];
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            channel: { upsert: jest.fn(), update: jest.fn() },
            chzzkToken: { findUnique: jest.fn(), upsert: jest.fn() },
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('generateAuthUrl', () => {
    it('should return URL with client_id, redirect_uri, and state', async () => {
      const result = await service.generateAuthUrl();
      expect(result.url).toContain('test-client-id');
      expect(result.url).toContain(encodeURIComponent('http://localhost:3001/auth/chzzk/callback'));
      expect(result.state).toBeDefined();
      expect(result.state.length).toBeGreaterThan(0);
      expect(cacheManager.set).toHaveBeenCalledWith(
        `oauth_state:${result.state}`,
        true,
        600000,
      );
    });
  });

  describe('handleCallback', () => {
    it('should exchange code for tokens and store channel', async () => {
      const mockTokens = { access: 'at-123', refresh: 'rt-456', expireIn: 86400 };
      const mockChannel = { channelID: 'ch-1', name: 'TestStreamer', follower: 100, imageURL: 'http://img' };

      cacheManager.get.mockResolvedValue(true);
      (Buzzk.oauth.get as jest.Mock).mockResolvedValue(mockTokens);
      (Buzzk.oauth.resolve as jest.Mock).mockResolvedValue(mockChannel);
      (prisma.channel.upsert as jest.Mock).mockResolvedValue({ channelId: 'ch-1', name: 'TestStreamer' });
      (prisma.chzzkToken.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.handleCallback('code-abc', 'state-xyz');

      expect(cacheManager.get).toHaveBeenCalledWith('oauth_state:state-xyz');
      expect(cacheManager.del).toHaveBeenCalledWith('oauth_state:state-xyz');
      expect(Buzzk.oauth.get).toHaveBeenCalledWith('code-abc', 'state-xyz');
      expect(Buzzk.oauth.resolve).toHaveBeenCalledWith('at-123');
      expect(prisma.channel.upsert).toHaveBeenCalled();
      expect(prisma.chzzkToken.upsert).toHaveBeenCalled();
      expect(result.channelId).toBe('ch-1');
    });

    it('should throw on invalid state', async () => {
      cacheManager.get.mockResolvedValue(null);
      await expect(service.handleCallback('code', 'bad-state')).rejects.toThrow('Invalid OAuth state');
    });

    it('should throw when token exchange fails', async () => {
      cacheManager.get.mockResolvedValue(true);
      (Buzzk.oauth.get as jest.Mock).mockResolvedValue(null);
      await expect(service.handleCallback('code', 'state')).rejects.toThrow('Token exchange failed');
    });
  });

  describe('getValidAccessToken', () => {
    it('should return token when not expired', async () => {
      const futureDate = new Date(Date.now() + 3600000);
      (prisma.chzzkToken.findUnique as jest.Mock).mockResolvedValue({
        accessToken: 'valid-token',
        refreshToken: 'rt',
        expiresAt: futureDate,
        channelId: 'ch-1',
      });

      const result = await service.getValidAccessToken('ch-1');
      expect(result).toBe('valid-token');
    });

    it('should refresh when token expires within 5 minutes', async () => {
      const soonDate = new Date(Date.now() + 60000);
      (prisma.chzzkToken.findUnique as jest.Mock).mockResolvedValue({
        accessToken: 'old-token',
        refreshToken: 'rt-old',
        expiresAt: soonDate,
        channelId: 'ch-1',
      });
      (Buzzk.oauth.refresh as jest.Mock).mockResolvedValue({
        access: 'new-token',
        refresh: 'rt-new',
        expireIn: 86400,
      });
      (prisma.chzzkToken.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.getValidAccessToken('ch-1');
      expect(result).toBe('new-token');
      expect(Buzzk.oauth.refresh).toHaveBeenCalledWith('rt-old');
    });

    it('should return null and mark NEEDS_REAUTH when refresh fails', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      (prisma.chzzkToken.findUnique as jest.Mock).mockResolvedValue({
        accessToken: 'expired',
        refreshToken: 'rt-dead',
        expiresAt: expiredDate,
        channelId: 'ch-1',
      });
      (Buzzk.oauth.refresh as jest.Mock).mockResolvedValue(null);
      (prisma.channel.update as jest.Mock).mockResolvedValue({});

      const result = await service.getValidAccessToken('ch-1');
      expect(result).toBeNull();
    });

    it('should return null when no token exists', async () => {
      (prisma.chzzkToken.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.getValidAccessToken('ch-1');
      expect(result).toBeNull();
    });
  });
});
