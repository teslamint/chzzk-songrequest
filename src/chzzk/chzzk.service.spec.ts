import { Test, TestingModule } from '@nestjs/testing';
import { ChzzkService } from './chzzk.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Buzzk from 'buzzk';
import { SendChatMessageEvent } from '../chat-bot/chat-bot.events';
import { BuzzkChat } from './chzzk.interface';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnofficialChatClient } from './unofficial-chat-client';

jest.mock('buzzk', () => ({
  chat: jest.fn(),
  auth: jest.fn(),
  login: jest.fn(),
}));

jest.mock('./unofficial-chat-client');

describe('ChzzkService', () => {
  let module: TestingModule;
  let service: ChzzkService;
  let eventEmitter: EventEmitter2;
  let authService: AuthService;
  let mockChatClient: any;

  beforeEach(async () => {
    mockChatClient = {
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn(),
      onDisconnect: jest.fn(),
      onMessage: jest.fn(),
    };
    (Buzzk.chat as jest.Mock).mockImplementation(() => mockChatClient);

    module = await Test.createTestingModule({
      providers: [
        ChzzkService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'chzzk.client_id': 'test-id',
                'chzzk.client_secret': 'test-secret',
                'chzzk.bot_nid_aut': 'bot-nid-aut',
                'chzzk.bot_nid_ses': 'bot-nid-ses',
              };
              return map[key];
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: AuthService,
          useValue: {
            getValidAccessToken: jest.fn().mockResolvedValue('test-access-token'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            channel: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<ChzzkService>(ChzzkService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    authService = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should call Buzzk.auth on module init', () => {
    service.onModuleInit();
    expect(Buzzk.auth).toHaveBeenCalledWith('test-id', 'test-secret');
  });

  describe('getChatClient', () => {
    it('should create chat client with access token', async () => {
      const client = await service.getChatClient('ch-1');
      expect(authService.getValidAccessToken).toHaveBeenCalledWith('ch-1');
      expect(Buzzk.chat).toHaveBeenCalledWith('test-access-token');
      expect(client).toBe(mockChatClient);
    });

    it('should return null when no token exists', async () => {
      (authService.getValidAccessToken as jest.Mock).mockResolvedValue(null);
      const client = await service.getChatClient('ch-1');
      expect(client).toBeNull();
    });

    it('should return cached client on second call', async () => {
      await service.getChatClient('ch-1');
      await service.getChatClient('ch-1');
      expect(Buzzk.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleIncomingChatMessage', () => {
    it('should emit chat.message with manager role for hasMod=true', () => {
      const chat: BuzzkChat = {
        author: { id: 'u1', name: 'Mod', hasMod: true },
        message: '!clear',
        emojis: null,
        time: 123,
      } as BuzzkChat;

      service['handleIncomingChatMessage'](chat, 'ch-1');

      const emittedEvent = (eventEmitter.emit as jest.Mock).mock.calls[0][1];
      expect(emittedEvent.role).toBe('manager');
    });

    it('should emit chat.message with user role for hasMod=false', () => {
      const chat: BuzzkChat = {
        author: { id: 'u2', name: 'Viewer', hasMod: false },
        message: '!sr https://youtube.com/watch?v=abc',
        emojis: null,
        time: 456,
      } as BuzzkChat;

      service['handleIncomingChatMessage'](chat, 'ch-1');

      const emittedEvent = (eventEmitter.emit as jest.Mock).mock.calls[0][1];
      expect(emittedEvent.role).toBe('user');
    });
  });

  describe('handleChatConnect', () => {
    it('should call getChatClient on widget.open', async () => {
      const spy = jest.spyOn(service, 'getChatClient');
      await service['handleChatConnect']({ channelId: 'ch-1' });
      expect(spy).toHaveBeenCalledWith('ch-1');
    });
  });

  describe('handleChatDisconnect', () => {
    it('should disconnect and remove client on widget.close', async () => {
      await service.getChatClient('ch-1');
      await service['handleChatDisconnect']({ channelId: 'ch-1' });
      expect(mockChatClient.disconnect).toHaveBeenCalled();
      expect(service['chatClients']['ch-1']).toBeUndefined();
    });
  });

  describe('handleChatClientConnect', () => {
    it('should emit chat.connect', () => {
      service['handleChatClientConnect']('ch-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.connect', {
        service: 'CHZZK',
        channelId: 'ch-1',
      });
    });
  });

  describe('handleChatClientDisconnect', () => {
    it('should emit chat.disconnect and delete from chatClients', async () => {
      await service.getChatClient('ch-1');
      service['handleChatClientDisconnect']('ch-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.disconnect', {
        service: 'CHZZK',
        channelId: 'ch-1',
      });
      expect(service['chatClients']['ch-1']).toBeUndefined();
    });
  });

  describe('getChatClient connect failure', () => {
    it('should log error when connect returns null', async () => {
      mockChatClient.connect.mockResolvedValue(null);
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      await service.getChatClient('ch-1');
      await Promise.resolve();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to ch-1'),
      );
    });
  });

  describe('handleChatSend', () => {
    it('should send message via chat client', async () => {
      const prisma = module.get<PrismaService>(PrismaService);
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: false,
      });
      await service.getChatClient('ch-1');
      await service['handleChatSend'](
        new SendChatMessageEvent({ service: 'CHZZK', channelId: 'ch-1', message: 'hello' }),
      );
      expect(mockChatClient.send).toHaveBeenCalledWith('hello');
    });

    it('should skip non-CHZZK services', async () => {
      await service['handleChatSend'](
        new SendChatMessageEvent({ service: 'TWITCH', channelId: 'ch-1', message: 'hello' }),
      );
      expect(mockChatClient.send).not.toHaveBeenCalled();
    });
  });

  describe('handleChatSend with bot account', () => {
    let prisma: PrismaService;
    let mockUnofficialClient: jest.Mocked<UnofficialChatClient>;

    beforeEach(() => {
      prisma = module.get<PrismaService>(PrismaService);
      mockUnofficialClient = {
        connect: jest.fn().mockResolvedValue(true),
        send: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn(),
        onDisconnect: jest.fn(),
        connected: true,
      } as any;
      (UnofficialChatClient as jest.Mock).mockImplementation(() => mockUnofficialClient);
    });

    it('should use unofficial client when useBotAccount is true', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: true,
      });

      await service.getChatClient('ch-1');
      await service['handleChatSend'](
        new SendChatMessageEvent({ service: 'CHZZK', channelId: 'ch-1', message: '봇 응답' }),
      );

      expect(mockUnofficialClient.send).toHaveBeenCalledWith('봇 응답');
    });

    it('should fall back to official client when bot config missing', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: false,
      });

      await service.getChatClient('ch-1');
      await service['handleChatSend'](
        new SendChatMessageEvent({ service: 'CHZZK', channelId: 'ch-1', message: 'hello' }),
      );

      expect(mockChatClient.send).toHaveBeenCalledWith('hello');
      expect(mockUnofficialClient.send).not.toHaveBeenCalled();
    });

    it('should fall back to official when unofficial connect fails', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: true,
      });
      mockUnofficialClient.connect.mockResolvedValue(false);

      await service.getChatClient('ch-1');
      await service['handleChatSend'](
        new SendChatMessageEvent({ service: 'CHZZK', channelId: 'ch-1', message: 'hello' }),
      );

      expect(mockChatClient.send).toHaveBeenCalledWith('hello');
    });
  });

  describe('handleChatDisconnect cleans up unofficial client', () => {
    let prisma: PrismaService;
    let mockUnofficialClient: jest.Mocked<UnofficialChatClient>;

    beforeEach(() => {
      prisma = module.get<PrismaService>(PrismaService);
      mockUnofficialClient = {
        connect: jest.fn().mockResolvedValue(true),
        send: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn(),
        onDisconnect: jest.fn(),
        connected: true,
      } as any;
      (UnofficialChatClient as jest.Mock).mockImplementation(() => mockUnofficialClient);
    });

    it('should disconnect unofficial client on widget.close', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: true,
      });

      await service.getChatClient('ch-1');
      await service.getUnofficialChatClient('ch-1');
      await service['handleChatDisconnect']({ channelId: 'ch-1' });

      expect(mockUnofficialClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('getUnofficialChatClient concurrent connect', () => {
    let prisma: PrismaService;
    let mockUnofficialClient: jest.Mocked<UnofficialChatClient>;

    beforeEach(() => {
      prisma = module.get<PrismaService>(PrismaService);
      mockUnofficialClient = {
        connect: jest.fn(),
        send: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn(),
        onDisconnect: jest.fn(),
        connected: true,
      } as any;
      (UnofficialChatClient as jest.Mock).mockImplementation(() => mockUnofficialClient);
    });

    it('should return the same Promise for concurrent calls and create only one client', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: true,
      });

      let resolveConnect: (v: boolean) => void;
      mockUnofficialClient.connect.mockReturnValue(
        new Promise<boolean>((res) => { resolveConnect = res; }),
      );

      const call1 = service.getUnofficialChatClient('ch-1');
      const call2 = service.getUnofficialChatClient('ch-1');

      resolveConnect!(true);
      const [r1, r2] = await Promise.all([call1, call2]);

      expect(UnofficialChatClient).toHaveBeenCalledTimes(1);
      expect(r1).toBe(r2);
    });
  });

  describe('getUnofficialChatClient connect failure cooldown', () => {
    let prisma: PrismaService;
    let mockUnofficialClient: jest.Mocked<UnofficialChatClient>;

    beforeEach(() => {
      prisma = module.get<PrismaService>(PrismaService);
      mockUnofficialClient = {
        connect: jest.fn().mockResolvedValue(false),
        send: jest.fn(),
        disconnect: jest.fn(),
        onDisconnect: jest.fn(),
        connected: false,
      } as any;
      (UnofficialChatClient as jest.Mock).mockImplementation(() => mockUnofficialClient);
    });

    it('should not retry connect within cooldown window', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: true,
      });

      // First call — connect fails, cooldown set
      const r1 = await service.getUnofficialChatClient('ch-1');
      expect(r1).toBeNull();
      expect(UnofficialChatClient).toHaveBeenCalledTimes(1);

      // Second call within cooldown — should skip DB + connect entirely
      const r2 = await service.getUnofficialChatClient('ch-1');
      expect(r2).toBeNull();
      expect(UnofficialChatClient).toHaveBeenCalledTimes(1);
    });

    it('should clear failure cooldown on botAccount.changed', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: true,
      });

      // Prime failure cooldown
      await service.getUnofficialChatClient('ch-1');
      expect(service['connectFailedUntil']['ch-1']).toBeDefined();

      // Clear via event handler
      service['handleBotAccountChanged']({ channelId: 'ch-1', useBotAccount: true });
      expect(service['connectFailedUntil']['ch-1']).toBeUndefined();
    });
  });

  describe('reconnect on unexpected disconnect', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should schedule reconnect for official client when widget is active', async () => {
      await service['handleChatConnect']({ channelId: 'ch-1' });
      expect(service['activeChannels'].has('ch-1')).toBe(true);

      const spy = jest.spyOn(service, 'getChatClient');
      spy.mockClear();

      service['handleChatClientDisconnect']('ch-1');

      expect(service['reconnectTimers']['official:ch-1']).toBeDefined();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(spy).toHaveBeenCalledWith('ch-1');
    });

    it('should NOT schedule reconnect when widget is closed', async () => {
      await service.getChatClient('ch-1');

      service['handleChatClientDisconnect']('ch-1');

      expect(service['reconnectTimers']['official:ch-1']).toBeUndefined();
    });

    it('should cancel reconnect on widget.close', async () => {
      await service['handleChatConnect']({ channelId: 'ch-1' });
      service['handleChatClientDisconnect']('ch-1');
      expect(service['reconnectTimers']['official:ch-1']).toBeDefined();

      await service['handleChatDisconnect']({ channelId: 'ch-1' });

      expect(service['reconnectTimers']['official:ch-1']).toBeUndefined();
      expect(service['reconnectAttempts']['official:ch-1']).toBeUndefined();
    });

    it('should use exponential backoff delays', async () => {
      await service['handleChatConnect']({ channelId: 'ch-1' });

      service['scheduleReconnect']('ch-1', 'official');
      expect(service['reconnectAttempts']['official:ch-1']).toBe(1);

      service['scheduleReconnect']('ch-1', 'official');
      expect(service['reconnectAttempts']['official:ch-1']).toBe(2);

      service['scheduleReconnect']('ch-1', 'official');
      expect(service['reconnectAttempts']['official:ch-1']).toBe(3);
    });

    it('should stop after max retries and clear timer', async () => {
      await service['handleChatConnect']({ channelId: 'ch-1' });

      for (let i = 0; i < 5; i++) {
        service['scheduleReconnect']('ch-1', 'official');
      }
      expect(service['reconnectAttempts']['official:ch-1']).toBe(5);
      expect(service['reconnectTimers']['official:ch-1']).toBeDefined();

      service['scheduleReconnect']('ch-1', 'official');
      expect(service['reconnectTimers']['official:ch-1']).toBeUndefined();
      expect(service['reconnectAttempts']['official:ch-1']).toBeUndefined();
    });
  });

  describe('handleBotAccountChanged', () => {
    let prisma: PrismaService;
    let mockUnofficialClient: jest.Mocked<UnofficialChatClient>;

    beforeEach(() => {
      prisma = module.get<PrismaService>(PrismaService);
      mockUnofficialClient = {
        connect: jest.fn().mockResolvedValue(true),
        send: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn(),
        onDisconnect: jest.fn(),
        connected: true,
      } as any;
      (UnofficialChatClient as jest.Mock).mockImplementation(() => mockUnofficialClient);
    });

    it('should remove channelId from noBotAccount when bot is enabled', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue(null);
      // Prime the noBotAccount cache
      await service.getUnofficialChatClient('ch-1');
      expect(service['noBotAccount'].has('ch-1')).toBe(true);

      service['handleBotAccountChanged']({ channelId: 'ch-1', useBotAccount: true });

      expect(service['noBotAccount'].has('ch-1')).toBe(false);
    });

    it('should disconnect existing unofficial client when bot is disabled', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        useBotAccount: true,
      });

      await service.getUnofficialChatClient('ch-1');
      expect(service['unofficialClients']['ch-1']).toBeDefined();

      service['handleBotAccountChanged']({ channelId: 'ch-1', useBotAccount: false });

      expect(mockUnofficialClient.disconnect).toHaveBeenCalled();
      expect(service['unofficialClients']['ch-1']).toBeUndefined();
    });

    it('should only clear cache when bot is enabled (no disconnect)', async () => {
      (prisma.channel.findUnique as jest.Mock).mockResolvedValue(null);
      await service.getUnofficialChatClient('ch-1');

      service['handleBotAccountChanged']({ channelId: 'ch-1', useBotAccount: true });

      expect(mockUnofficialClient.disconnect).not.toHaveBeenCalled();
    });
  });
});
