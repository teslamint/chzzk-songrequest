import { Test, TestingModule } from '@nestjs/testing';
import { WidgetController } from './widget.controller';

describe('WidgetController', () => {
  let controller: WidgetController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetController],
    }).compile();

    controller = module.get<WidgetController>(WidgetController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
