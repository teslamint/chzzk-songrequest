import { Test, TestingModule } from '@nestjs/testing';
import { ChzzkService } from './chzzk.service';

describe('ChzzkService', () => {
  let service: ChzzkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChzzkService],
    }).compile();

    service = module.get<ChzzkService>(ChzzkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
