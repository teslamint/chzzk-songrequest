import { Test, TestingModule } from '@nestjs/testing';
import { SongRequestController } from './song-request.controller';

describe('SongRequestController', () => {
  let controller: SongRequestController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SongRequestController],
    }).compile();

    controller = module.get<SongRequestController>(SongRequestController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
