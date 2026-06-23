import { Test, TestingModule } from '@nestjs/testing';
import { ChatBotService } from './chat-bot.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SongRequestService } from '../song-request/song-request.service';
import * as ytdl from '@distube/ytdl-core';
import { ChatMessageEvent, SendChatMessageEvent } from './chat-bot.events';

jest.mock('@distube/ytdl-core');
jest.mock('../song-request/song-request.service', () => ({
  SongRequestService: class SongRequestService {},
}));

describe('ChatBotService', () => {
  let service: ChatBotService;
  let eventEmitter: EventEmitter2;
  let songRequestService: SongRequestService;
  let mockYtdl: jest.Mocked<typeof ytdl>;

  beforeEach(async () => {
    mockYtdl = ytdl as jest.Mocked<typeof ytdl>;
    mockYtdl.validateURL.mockImplementation(() => true);
    mockYtdl.validateID.mockImplementation(() => true);
    mockYtdl.getURLVideoID.mockImplementation((url) => url.split('v=')[1]);
    mockYtdl.getVideoID.mockImplementation((url) => url.split('v=')[1] || url);
    mockYtdl.getInfo.mockResolvedValue({
      videoDetails: {
        title: 'Test Video',
        lengthSeconds: '180',
        isCrawlable: true,
        isPrivate: false,
        isFamilySafe: true,
      },
    } as ytdl.videoInfo);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatBotService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: SongRequestService,
          useValue: {
            createRequest: jest.fn(),
            requests: jest.fn().mockResolvedValue([]),
            requestsByChannelId: jest.fn().mockResolvedValue([]),
            requestCountByChannelId: jest.fn(),
            requestTotalDurationByChannelId: jest.fn(),
            getCurrentSong: jest.fn(),
            skipSong: jest.fn(),
            lastRequestByUser: jest.fn(),
            deleteRequest: jest.fn(),
            clearQueue: jest.fn(),
            getSong: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChatBotService>(ChatBotService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    songRequestService = module.get<SongRequestService>(SongRequestService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleConnectEvent', () => {
    it('should send a connection message to the chat', async () => {
      const event = { service: 'CHZZK', channelId: 'testChannel' };
      await service['handleConnectEvent'](event);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls[0][1];
      expect(sendEvent.message).toBe('노래신청봇이 연결되었습니다.');
    });
  });

  describe('handleMessageEvent', () => {
    it('should ignore messages not starting with "!"', async () => {
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: 'Hello',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['handleMessageEvent'](event);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should execute a command if message starts with "!"', async () => {
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!command',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      const executeCommandSpy = jest.spyOn(service as any, 'executeCommand');
      await service['handleMessageEvent'](event);
      expect(executeCommandSpy).toHaveBeenCalledWith(
        '!command',
        undefined,
        event,
      );
    });

    it('should execute a command with args if message starts with "!" and has args', async () => {
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sr https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      const executeCommandSpy = jest.spyOn(service as any, 'executeCommand');
      await service['handleMessageEvent'](event);
      expect(executeCommandSpy).toHaveBeenCalledWith(
        '!sr',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        event,
      );
    });
  });

  describe('sendChat', () => {
    it('should emit a chat.send event', () => {
      service['sendChat']('CHZZK', 'testChannel', 'Test Message');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls[0][1];
      expect(sendEvent.service).toBe('CHZZK');
      expect(sendEvent.channelId).toBe('testChannel');
      expect(sendEvent.message).toBe('Test Message');
    });
  });

  describe('_songRequest', () => {
    it('should validate and add a song to the queue', async () => {
      mockYtdl.getInfo.mockResolvedValue({
        videoDetails: {
          title: 'Test Video',
          lengthSeconds: '180',
          isCrawlable: true,
          isPrivate: false,
          isFamilySafe: true,
        },
      } as ytdl.videoInfo);
      (songRequestService.requests as jest.Mock).mockResolvedValue([]);
      (songRequestService.createRequest as jest.Mock).mockResolvedValue({
        id: 'testId',
        title: 'Test Video',
      });
      (songRequestService.requestsByChannelId as jest.Mock).mockResolvedValue([
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      ]);
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sr https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });

      await service['_songRequest'](
        event,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(songRequestService.createRequest).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.find(
        (call) => call[0] === 'chat.send',
      )[1];
      expect(sendEvent.message).toContain('재생목록에 1번째로 추가되었습니다.');
    });

    it('should send a message if url is empty', async () => {
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sr',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songRequest'](event, '');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain('주소를 입력해주세요.');
    });
    it('should send a message if url is not valid', async () => {
      mockYtdl.validateURL.mockReturnValue(false);
      mockYtdl.validateID.mockReturnValue(false);

      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sr invalidurl',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songRequest'](event, 'invalidurl');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain('입력한 주소가 올바르지 않습니다.');
    });

    it('should send a message if video is not allowed to embed', async () => {
      mockYtdl.getInfo.mockResolvedValue({
        videoDetails: {
          title: 'Test Video',
          lengthSeconds: '180',
          isCrawlable: false,
          isPrivate: false,
          isFamilySafe: true,
        },
      } as ytdl.videoInfo);
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sr https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songRequest'](
        event,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain('재생할 수 없는 동영상입니다.');
    });

    it('should send a message if youtube info cannot be loaded', async () => {
      const loggerErrorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();
      mockYtdl.getInfo.mockRejectedValue(
        new Error('Could not extract functions'),
      );
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sr https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });

      await service['_songRequest'](
        event,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(songRequestService.createRequest).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain(
        '동영상 정보를 불러오는 데 실패했습니다.',
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should send a message if the song already exists', async () => {
      mockYtdl.getInfo.mockResolvedValue({
        videoDetails: {
          title: 'Test Video',
          lengthSeconds: '180',
          isCrawlable: true,
          isPrivate: false,
          isFamilySafe: true,
        },
      } as ytdl.videoInfo);
      (songRequestService.requests as jest.Mock).mockResolvedValue([
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      ]);
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sr https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songRequest'](
        event,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain('이미 대기열에 등록된 곡입니다.');
    });
  });

  describe('_songList', () => {
    it('should send a message if the queue is empty', async () => {
      (
        songRequestService.requestCountByChannelId as jest.Mock
      ).mockResolvedValue(0);
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sl',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songList'](event);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain('대기열이 비어있습니다.');
    });

    it('should send a summary of the queue', async () => {
      (
        songRequestService.requestCountByChannelId as jest.Mock
      ).mockResolvedValue(5);
      (
        songRequestService.requestTotalDurationByChannelId as jest.Mock
      ).mockResolvedValue({
        _sum: { play_time: 180 },
      });
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sl',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songList'](event);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain('대기열 5개, 총 길이: 3분 0초');
    });

    it('should send song by order', async () => {
      (
        songRequestService.requestCountByChannelId as jest.Mock
      ).mockResolvedValue(5);
      (songRequestService.getSong as jest.Mock).mockResolvedValue({
        title: 'testSong',
      });
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sl 1',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songList'](event, '1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain('1번째 곡: testSong');
    });
    it('should send message when song does not exists on that order', async () => {
      (
        songRequestService.requestCountByChannelId as jest.Mock
      ).mockResolvedValue(5);
      (songRequestService.getSong as jest.Mock).mockResolvedValue(undefined);
      const event = new ChatMessageEvent({
        service: 'CHZZK',
        channelId: 'testChannel',
        message: '!sl 1',
        timestamp: 1234567,
        userId: 'user1',
        role: 'user',
        nickname: 'User1',
      });
      await service['_songList'](event, '1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.send',
        expect.any(SendChatMessageEvent),
      );
      const sendEvent = (eventEmitter.emit as jest.Mock).mock.calls.pop()[1];
      expect(sendEvent.message).toContain(
        '대기열에 해당 순서의 곡이 없습니다.',
      );
    });
  });
});
