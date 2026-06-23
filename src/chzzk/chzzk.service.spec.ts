import { Test, TestingModule } from '@nestjs/testing';
import { ChzzkService } from './chzzk.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Buzzk from 'buzzk';
import { SendChatMessageEvent } from '../chat-bot/chat-bot.events';
import { BuzzkChat } from './chzzk.interface';
import { AuthService } from '../auth/auth.service';

jest.mock('buzzk', () => ({
  chat: jest.fn(),
  auth: jest.fn(),
  login: jest.fn(),
}));

describe('ChzzkService', () => {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChzzkService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'chzzk.client_id': 'test-id',
                'chzzk.client_secret': 'test-secret',
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

  describe('handleChatSend', () => {
    it('should send message via chat client', async () => {
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
});
