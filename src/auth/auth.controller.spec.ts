import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            generateAuthUrl: jest.fn(),
            handleCallback: jest.fn(),
            toggleBotAccount: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  describe('GET /auth/chzzk', () => {
    it('should redirect to CHZZK authorize URL', async () => {
      (authService.generateAuthUrl as jest.Mock).mockResolvedValue({
        url: 'https://chzzk.naver.com/account-interlock?clientId=test',
        state: 'abc',
      });
      const mockReply = { redirect: jest.fn() };

      await controller.authorize(mockReply as any);

      expect(authService.generateAuthUrl).toHaveBeenCalled();
      expect(mockReply.redirect).toHaveBeenCalledWith(
        'https://chzzk.naver.com/account-interlock?clientId=test',
        302,
      );
    });
  });

  describe('GET /auth/chzzk/callback', () => {
    it('should return success view on valid callback', async () => {
      (authService.handleCallback as jest.Mock).mockResolvedValue({
        channelId: 'ch-1',
        name: 'TestStreamer',
      });

      const result = await controller.callback('code-123', 'state-abc');

      expect(authService.handleCallback).toHaveBeenCalledWith('code-123', 'state-abc');
      expect(result).toEqual({
        channelId: 'ch-1',
        channelName: 'TestStreamer',
      });
    });

    it('should return error view when callback fails', async () => {
      (authService.handleCallback as jest.Mock).mockRejectedValue(
        new Error('Token exchange failed'),
      );

      const result = await controller.callback('bad-code', 'state');

      expect(result).toEqual({ error: 'Token exchange failed' });
    });
  });

  describe('PATCH /auth/chzzk/bot/:channelId', () => {
    it('should toggle bot account', async () => {
      (authService.toggleBotAccount as jest.Mock).mockResolvedValue(undefined);

      const result = await controller.toggleBot('ch-1', { useBotAccount: true });

      expect(authService.toggleBotAccount).toHaveBeenCalledWith('ch-1', true);
      expect(result).toEqual({ success: true });
    });
  });
});
