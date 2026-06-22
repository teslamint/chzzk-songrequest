import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { SongRequestService } from '../song-request/song-request.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import {
  SongRequestClearedEvent,
  SongRequestCreatedEvent,
  SongRequestDeletedEvent,
  SongRequestSkippedEvent,
} from '../song-request/song-request.event';
import { SongRequest } from '@prisma/client';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let songRequestService: SongRequestService;
  let eventEmitter: EventEmitter2;
  let mockServer: Partial<Server>;
  let mockClient: Partial<Socket>;

  beforeEach(async () => {
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    mockClient = {
      join: jest.fn(),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: SongRequestService,
          useValue: {
            requestsByChannelId: jest.fn(),
            setPlaying: jest.fn(),
            revertToPending: jest.fn(),
            deleteRequest: jest.fn(),
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

    gateway = module.get<EventsGateway>(EventsGateway);
    songRequestService = module.get<SongRequestService>(SongRequestService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    /**
     * @ts-expect-error We are setting a private property for testing purposes.
     */
    gateway['server'] = mockServer as Server;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('init', () => {
    it('should emit widget.open, call requestsByChannelId, join room, and emit widget event', async () => {
      const data = { id: 'testChannel', last_song_id: 'lastSongId' };
      const mockSongs: SongRequest[] = [
        {
          id: 'song1',
          service: 'YOUTUBE',
          channel_id: 'testChannel',
          title: 'Song 1',
          url: 'url1',
          request_from: 'CHAT',
          requested_by: 'user1',
          requested_at: new Date(),
          play_time: BigInt(180),
          status: 'PENDING',
        },
      ];
      jest
        .spyOn(songRequestService, 'requestsByChannelId')
        .mockResolvedValue(mockSongs);

      await gateway.init(data, mockClient as Socket);

      expect(eventEmitter.emit).toHaveBeenCalledWith('widget.open', {
        channelId: 'testChannel',
      });
      expect(songRequestService.requestsByChannelId).toHaveBeenCalledWith(
        'testChannel',
      );
      expect(mockClient.join).toHaveBeenCalledWith('widget_testChannel');
      expect(mockClient.emit).toHaveBeenCalledWith(
        'widget_testChannel',
        JSON.stringify(mockSongs, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );
    });
  });

  describe('songStarted', () => {
    it('should call setPlaying with correct data', async () => {
      const data = { id: 'testId', channelId: 'testChannel' };
      await gateway.songStarted(data);
      expect(songRequestService.setPlaying).toHaveBeenCalledWith(data);
    });
  });

  describe('songStopped', () => {
    it('should call revertToPending and emit widget.close', async () => {
      const data = { channelId: 'testChannel' };
      await gateway.songStopped(data);
      expect(songRequestService.revertToPending).toHaveBeenCalledWith(data);
      expect(eventEmitter.emit).toHaveBeenCalledWith('widget.close', {
        channelId: 'testChannel',
      });
    });
  });

  describe('songEnded', () => {
    it('should call deleteRequest with correct data', async () => {
      const data = { id: 'testId', channelId: 'testChannel' };
      await gateway.songEnded(data);
      expect(songRequestService.deleteRequest).toHaveBeenCalledWith({
        id: 'testId',
        channel_id: 'testChannel',
      });
    });
  });

  describe('sendNewRequestToWidget', () => {
    it('should emit next_song_channelId event to the correct room', async () => {
      const mockSong: SongRequest = {
        id: 'testId',
        service: 'YOUTUBE',
        channel_id: 'testChannel',
        title: 'test',
        url: 'test',
        request_from: 'CHAT',
        requested_by: 'test',
        requested_at: new Date(),
        play_time: BigInt(1),
        status: 'PENDING',
      };
      const event = new SongRequestCreatedEvent(mockSong);
      await gateway.sendNewRequestToWidget(event);
      expect(mockServer.to).toHaveBeenCalledWith('widget_testChannel');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'next_song_testChannel',
        JSON.stringify(event.data(), (key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );
    });
  });

  describe('sendDeleteRequestToWidget', () => {
    it('should emit delete_song_channelId event to the correct room', async () => {
      const mockSong: SongRequest = {
        id: 'testId',
        service: 'YOUTUBE',
        channel_id: 'testChannel',
        title: 'test',
        url: 'test',
        request_from: 'CHAT',
        requested_by: 'test',
        requested_at: new Date(),
        play_time: BigInt(1),
        status: 'PENDING',
      };
      const event = new SongRequestDeletedEvent(mockSong);
      await gateway.sendDeleteRequestToWidget(event);
      expect(mockServer.to).toHaveBeenCalledWith('widget_testChannel');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'delete_song_testChannel',
        JSON.stringify(event.data(), (key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );
    });
  });

  describe('sendSkipRequestToWidget', () => {
    it('should emit skip_song_channelId event to the correct room', async () => {
      const mockSong: SongRequest = {
        id: 'testId',
        service: 'YOUTUBE',
        channel_id: 'testChannel',
        title: 'test',
        url: 'test',
        request_from: 'CHAT',
        requested_by: 'test',
        requested_at: new Date(),
        play_time: BigInt(1),
        status: 'PENDING',
      };
      const event = new SongRequestSkippedEvent(mockSong);
      await gateway.sendSkipRequestToWidget(event);
      expect(mockServer.to).toHaveBeenCalledWith('widget_testChannel');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'skip_song_testChannel',
        JSON.stringify(event.data(), (key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );
    });
  });

  describe('sendRequestListClearedToWidget', () => {
    it('should emit clear_list_channelId event to the correct room', async () => {
      const event = new SongRequestClearedEvent('testChannel');
      await gateway.sendRequestListClearedToWidget(event);
      expect(mockServer.to).toHaveBeenCalledWith('widget_testChannel');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'clear_list_testChannel',
        JSON.stringify(event.data(), (key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );
    });
  });
});
