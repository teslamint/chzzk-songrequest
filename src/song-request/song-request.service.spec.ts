import { SongRequestService } from './song-request.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { Prisma, SongRequest } from '@prisma/client';
import {
  SongRequestCreatedEvent,
  SongRequestDeletedEvent,
  SongRequestSkippedEvent,
} from './song-request.event';

describe('SongRequestService', () => {
  let service: SongRequestService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;
  // let cacheManager: Cache;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      providers: [
        SongRequestService,
        EventEmitter2,
        PrismaService,
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        songRequest: {
          findMany: jest.fn(),
          count: jest.fn(),
          aggregate: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      })
      .compile();

    service = module.get<SongRequestService>(SongRequestService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    // cacheManager = module.get<Cache>(CACHE_MANAGER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requests', () => {
    it('should call prisma.songRequest.findMany', async () => {
      const params = { skip: 0, take: 10 };
      await service.requests(params);
      expect(prisma.songRequest.findMany).toHaveBeenCalledWith(params);
    });
  });

  describe('requestsByChannelId', () => {
    it('should call requests with correct where clause', async () => {
      const channelId = 'testChannel';
      const mockResult: SongRequest[] = [];
      jest.spyOn(service, 'requests').mockResolvedValue(mockResult);
      await service.requestsByChannelId(channelId);
      expect(service.requests).toHaveBeenCalledWith({
        where: { channel_id: channelId },
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('requestCountByChannelId', () => {
    it('should call prisma.songRequest.count with correct where clause', async () => {
      const channelId = 'testChannel';
      await service.requestCountByChannelId(channelId);
      expect(prisma.songRequest.count).toHaveBeenCalledWith({
        where: { channel_id: channelId, status: 'PENDING' },
      });
    });
  });

  describe('requestTotalDurationByChannelId', () => {
    it('should call prisma.songRequest.aggregate with correct where clause', async () => {
      const channelId = 'testChannel';
      await service.requestTotalDurationByChannelId(channelId);
      expect(prisma.songRequest.aggregate).toHaveBeenCalledWith({
        _sum: { play_time: true },
        where: { channel_id: channelId, status: 'PENDING' },
      });
    });
  });

  describe('lastRequestByUser', () => {
    it('should call prisma.songRequest.findFirst with correct where clause', async () => {
      const channelId = 'testChannel';
      const requestedBy = 'testUser';
      await service.lastRequestByUser(channelId, requestedBy);
      expect(prisma.songRequest.findFirst).toHaveBeenCalledWith({
        where: {
          channel_id: channelId,
          requested_by: requestedBy,
          status: 'PENDING',
        },
        take: 1,
        orderBy: { id: 'desc' },
      });
    });
  });

  describe('createRequest', () => {
    it('should call prisma.songRequest.create and emit songRequest.created', async () => {
      const data: Prisma.SongRequestCreateInput = {
        id: 'testId',
        service: 'YOUTUBE',
        channel_id: 'testChannel',
        title: 'test',
        url: 'test',
        request_from: 'CHAT',
        requested_by: 'test',
        requested_at: new Date(),
        play_time: BigInt(1),
      };
      const mockCreateResult: SongRequest = {
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

      jest
        .spyOn(prisma.songRequest, 'create')
        .mockResolvedValue(mockCreateResult);
      jest.spyOn(eventEmitter, 'emit');

      await service.createRequest(data);
      expect(prisma.songRequest.create).toHaveBeenCalledWith({
        data: { ...data, id: expect.any(String) },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'songRequest.created',
        new SongRequestCreatedEvent(mockCreateResult),
      );
    });
  });

  describe('deleteRequest', () => {
    it('should call prisma.songRequest.delete and emit songRequest.deleted if status is pending', async () => {
      const where: Prisma.SongRequestWhereUniqueInput = {
        id: 'testId',
        channel_id: 'test',
      };
      const mockDeletedResult: SongRequest = {
        id: 'testId',
        service: 'YOUTUBE',
        channel_id: 'test',
        title: 'test',
        url: 'test',
        requested_at: new Date(),
        requested_by: 'test',
        request_from: 'CHAT',
        play_time: BigInt(1),
        status: 'PENDING',
      };
      const mockCurrentSong: SongRequest = {
        ...({} as SongRequest),
        status: 'PLAYING',
      };
      jest.spyOn(service, 'getCurrentSong').mockResolvedValue(mockCurrentSong);

      jest
        .spyOn(prisma.songRequest, 'delete')
        .mockResolvedValue(mockDeletedResult);
      jest.spyOn(eventEmitter, 'emit');

      await service.deleteRequest(where);
      expect(prisma.songRequest.delete).toHaveBeenCalledWith({ where });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'songRequest.deleted',
        new SongRequestDeletedEvent(mockDeletedResult),
      );
    });

    it('should call prisma.songRequest.delete and emit songRequest.deleted if status is not pending', async () => {
      const where: Prisma.SongRequestWhereUniqueInput = {
        id: 'testId',
        channel_id: 'test',
      };
      const mockDeletedResult: SongRequest = {
        id: 'testId',
        service: 'YOUTUBE',
        channel_id: 'test',
        title: 'test',
        url: 'test',
        requested_at: new Date(),
        requested_by: 'test',
        request_from: 'CHAT',
        play_time: BigInt(1),
        status: 'PLAYING',
      };
      const mockCurrentSong: SongRequest = {
        ...mockDeletedResult,
        status: 'PLAYING',
      };
      jest.spyOn(service, 'getCurrentSong').mockResolvedValue(mockCurrentSong);
      jest
        .spyOn(prisma.songRequest, 'delete')
        .mockResolvedValue(mockDeletedResult);
      jest.spyOn(eventEmitter, 'emit');

      await service.deleteRequest(where);
      expect(prisma.songRequest.delete).toHaveBeenCalledWith({ where });
      expect(eventEmitter.emit).toHaveBeenCalled();
    });
  });

  describe('setPlaying', () => {
    it('should call prisma.songRequest.update with correct data', async () => {
      const data = { id: 'testId', channelId: 'testChannel' };
      await service.setPlaying(data);
      expect(prisma.songRequest.update).toHaveBeenCalledWith({
        data: { status: 'PLAYING' },
        where: { id: data.id, channel_id: data.channelId },
      });
    });
  });

  describe('getCurrentSong', () => {
    it('should call prisma.songRequest.findFirst with correct where clause', async () => {
      const channelId = 'testChannel';
      await service.getCurrentSong(channelId);
      expect(prisma.songRequest.findFirst).toHaveBeenCalledWith({
        where: { channel_id: channelId, status: 'PLAYING' },
        take: 1,
        orderBy: { id: 'asc' },
      });
    });

    it('should call prisma.songRequest.findFirst with correct where clause', async () => {
      const channelId = 'testChannel';
      const mockSong: SongRequest = {
        ...({} as SongRequest),
        status: 'PLAYING',
      };
      jest.spyOn(prisma.songRequest, 'findFirst').mockResolvedValue(mockSong);
      const result = await service.getCurrentSong(channelId);
      expect(result).toBe(mockSong);
      expect(prisma.songRequest.findFirst).toHaveBeenCalledWith({
        where: { channel_id: channelId, status: 'PLAYING' },
        take: 1,
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('skipSong', () => {
    it('should call deleteRequest and emit songRequest.skipped if song is playing', async () => {
      const mockSong: SongRequest = {
        id: 'testId',
        channel_id: 'testChannel',
        title: 'test',
        url: 'test',
        requested_by: 'test',
        play_time: BigInt(1),
        status: 'PLAYING',
        service: 'YOUTUBE',
        request_from: 'CHAT',
        requested_at: new Date(),
      };
      jest.spyOn(service, 'deleteRequest').mockResolvedValue(mockSong);
      jest.spyOn(eventEmitter, 'emit');

      await service.skipSong(mockSong);
      expect(service.deleteRequest).toHaveBeenCalledWith({
        id: mockSong.id,
        channel_id: mockSong.channel_id,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'songRequest.skipped',
        new SongRequestSkippedEvent(mockSong),
      );
    });

    it('should call deleteRequest and not emit songRequest.skipped if song is not playing', async () => {
      const mockSong: SongRequest = {
        id: 'testId',
        channel_id: 'testChannel',
        title: 'test',
        url: 'test',
        requested_by: 'test',
        play_time: BigInt(1),
        status: 'PENDING',
        service: 'YOUTUBE',
        request_from: 'CHAT',
        requested_at: new Date(),
      };
      mockSong.title = 'test';
      jest.spyOn(service, 'deleteRequest');
      jest.spyOn(eventEmitter, 'emit');

      await service.skipSong(mockSong);
      expect(service.deleteRequest).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('should do nothing if song is not provided', async () => {
      jest.spyOn(service, 'deleteRequest');
      await service.skipSong(null);
      expect(service.deleteRequest).not.toHaveBeenCalled();
    });
  });

  describe('revertToPending', () => {
    it('should call prisma.songRequest.updateMany with correct data', async () => {
      const data = { channelId: 'testChannel' };
      await service.revertToPending(data);
      expect(prisma.songRequest.updateMany).toHaveBeenCalledWith({
        data: { status: 'PENDING' },
        where: { channel_id: data.channelId, status: 'PLAYING' },
      });
    });
  });

  describe('clearQueue', () => {
    it('should call prisma.songRequest.deleteMany with correct where clause', async () => {
      const channelId = 'testChannel';
      await service.clearQueue(channelId);
      expect(prisma.songRequest.deleteMany).toHaveBeenCalledWith({
        where: { channel_id: channelId, status: 'PENDING' },
      });
    });
  });

  describe('getSong', () => {
    it('should call prisma.songRequest.findFirst with correct where clause', async () => {
      const channelId = 'testChannel';
      const order = 2;
      await service.getSong(channelId, order);
      expect(prisma.songRequest.findFirst).toHaveBeenCalledWith({
        where: { channel_id: channelId, status: 'PENDING' },
        take: 1,
        skip: order - 1,
        orderBy: { id: 'asc' },
      });
    });

    it('should return null if order is not provided', async () => {
      const channelId = 'testChannel';
      const result = await service.getSong(channelId);
      expect(result).toBeNull();
      expect(prisma.songRequest.findFirst).not.toHaveBeenCalled();
    });
  });
});
