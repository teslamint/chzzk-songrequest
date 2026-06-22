import { Test, TestingModule } from '@nestjs/testing';
import { ChzzkService } from './chzzk.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Buzzk from 'buzzk';
import {
  ChatMessageEvent,
  SendChatMessageEvent,
} from '../chat-bot/chat-bot.events';
import { BuzzkChat } from './chzzk.interface';

jest.mock('buzzk');

describe('ChzzkService', () => {
  let service: ChzzkService;
  let configService: ConfigService;
  let eventEmitter: EventEmitter2;
  let mockChatClient: any;

  beforeEach(async () => {
    mockChatClient = {
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn(),
      onDisconnect: jest.fn(),
      onMessage: jest.fn(),
      getUserInfo: jest.fn(),
    };
    (Buzzk.chat as jest.Mock).mockImplementation(() => mockChatClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChzzkService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NID_AUT') return 'testNidAut';
              if (key === 'NID_SES') return 'testNidSes';
              return null;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChzzkService>(ChzzkService);
    configService = module.get<ConfigService>(ConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeBuzzkLogin', () => {
    it('should call Buzzk.login with credentials from config', () => {
      jest.spyOn(Buzzk, 'login');
      service['initializeBuzzkLogin']();
      expect(Buzzk.login).toHaveBeenCalledWith('testNidAut', 'testNidSes');
    });
  });

  describe('getChatClient', () => {
    it('should create and connect a new chat client if one does not exist', () => {
      const channelId = 'testChannel';
      service.getChatClient(channelId);
      expect(Buzzk.chat).toHaveBeenCalledWith(channelId);
      expect(mockChatClient.connect).toHaveBeenCalled();
    });

    it('should return the existing chat client if one already exists', () => {
      const channelId = 'testChannel';
      const client1 = service.getChatClient(channelId);
      const client2 = service.getChatClient(channelId);
      expect(client1).toBe(client2);
      expect(Buzzk.chat).toHaveBeenCalledTimes(1);
      expect(mockChatClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should emit chat.connect on successful connection', async () => {
      const channelId = 'testChannel';
      mockChatClient.connect.mockResolvedValue(true);
      service.getChatClient(channelId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.connect', {
        service: 'CHZZK',
        channelId,
      });
    });

    it('should log error when connect resolves to null', async () => {
      const channelId = 'testChannel';
      mockChatClient.connect.mockResolvedValue(null);
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');
      service.getChatClient(channelId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to connect to ${channelId}`,
      );
    });

    it('should log an error if initial connection fails', async () => {
      const channelId = 'testChannel';
      const mockError = new Error('Connection failed');
      mockChatClient.connect.mockRejectedValue(mockError);
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');
      service.getChatClient(channelId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to make initial connect to ${channelId}`,
        mockError,
      );
    });
  });

  describe('handleChatClientConnect', () => {
    it('should log the connection and emit chat.connect event', () => {
      const channelId = 'testChannel';
      const loggerDebugSpy = jest.spyOn(service['logger'], 'debug');
      service['handleChatClientConnect'](channelId);
      expect(loggerDebugSpy).toHaveBeenCalledWith(`Connected to ${channelId}`);
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.connect', {
        service: 'CHZZK',
        channelId,
      });
    });
  });

  describe('handleChatClientDisconnect', () => {
    it('should log the disconnection and emit chat.disconnect event', () => {
      const channelId = 'testChannel';
      const loggerDebugSpy = jest.spyOn(service['logger'], 'debug');
      service['handleChatClientDisconnect'](channelId);
      expect(loggerDebugSpy).toHaveBeenCalledWith(`Closed to ${channelId}`);
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.disconnect', {
        service: 'CHZZK',
        channelId,
      });
    });
  });

  describe('handleIncomingChatMessage', () => {
    it('should process and emit chat.message event', async () => {
      const channelId = 'testChannel';
      const mockChatData: BuzzkChat = {
        author: { id: 'user1', name: 'User1', hasMod: false },
        message: 'Hello',
        emojis: null,
        time: 1234567,
      } as BuzzkChat;
      mockChatClient.getUserInfo.mockResolvedValue({ role: 'common_user' });
      await service['handleIncomingChatMessage'](
        mockChatData,
        mockChatClient,
        channelId,
      );
      expect(mockChatClient.getUserInfo).toHaveBeenCalledWith('user1');
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.message',
        expect.any(ChatMessageEvent),
      );
      const emittedEvent = (eventEmitter.emit as jest.Mock).mock.calls[0][1];
      expect(emittedEvent.message).toBe('Hello');
      expect(emittedEvent.userId).toBe('user1');
    });
  });

  describe('mapChzzkUserRoleToChatUserRole', () => {
    it('should map chzzk user roles correctly', () => {
      expect(service['mapChzzkUserRoleToChatUserRole']('common_user')).toBe(
        'user',
      );
      expect(service['mapChzzkUserRoleToChatUserRole']('streamer')).toBe(
        'streamer',
      );
      expect(service['mapChzzkUserRoleToChatUserRole']('manager')).toBe(
        'manager',
      );
      expect(
        service['mapChzzkUserRoleToChatUserRole']('streaming_channel_manager'),
      ).toBe('manager');
      expect(
        service['mapChzzkUserRoleToChatUserRole']('streaming_chat_manager'),
      ).toBe('manager');
      expect(service['mapChzzkUserRoleToChatUserRole']('unknown' as any)).toBe(
        'unknown',
      );
    });
  });

  describe('handleChatConnect (widget.open)', () => {
    it('should get chat client when widget.open is emitted', () => {
      const channelId = 'testChannel';
      const getChatClientSpy = jest.spyOn(service, 'getChatClient');
      service['handleChatConnect']({ channelId });
      expect(getChatClientSpy).toHaveBeenCalledWith(channelId);
    });
  });

  describe('handleChatDisconnect (widget.close)', () => {
    it('should disconnect and delete chat client when widget.close is emitted', async () => {
      const channelId = 'testChannel';
      const getChatClientSpy = jest.spyOn(service, 'getChatClient');
      service.getChatClient(channelId);
      service['handleChatDisconnect']({ channelId });

      await new Promise(process.nextTick);

      expect(getChatClientSpy).toHaveBeenCalledWith(channelId);
      expect(mockChatClient.disconnect).toHaveBeenCalled();
      expect(service['chatClients'][channelId]).toBeUndefined();
    });
    it('should not disconnect if chatclient not exist', async () => {
      const channelId = 'testChannel';
      service['handleChatDisconnect']({ channelId });
      await new Promise(process.nextTick);
      expect(mockChatClient.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleChatSend', () => {
    it('should send a message to the channel if the service is CHZZK', () => {
      const event = new SendChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: 'Hello',
      });
      service.getChatClient(event.channelId);
      service['handleChatSend'](event);
      expect(mockChatClient.send).toHaveBeenCalledWith('Hello');
    });

    it('should not send a message if the service is not CHZZK', () => {
      const event = new SendChatMessageEvent({
        service: 'TWITCH',
        channelId: 'testChannel',
        message: 'Hello',
      });
      service['handleChatSend'](event);
      expect(mockChatClient.send).not.toHaveBeenCalled();
    });
  });
});
