import { Test, TestingModule } from '@nestjs/testing';
import { SongRequestController } from './song-request.controller';
import { SongRequestService } from './song-request.service';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { SongRequest } from '@prisma/client';

describe('SongRequestController', () => {
  let controller: SongRequestController;
  let service: SongRequestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [SongRequestController],
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

    controller = module.get<SongRequestController>(SongRequestController);
    service = module.get<SongRequestService>(SongRequestService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requests', () => {
    it('should call service.requestsByChannelId', async () => {
      const channelId = 'testChannel';
      const mockRequests: SongRequest[] = [];
      jest
        .spyOn(service, 'requestsByChannelId')
        .mockResolvedValue(mockRequests);

      await controller.requests(channelId);
      expect(service.requestsByChannelId).toHaveBeenCalledWith(channelId);
    });
  });
});
