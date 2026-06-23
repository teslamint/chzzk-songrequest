import { Body, Controller, Get, Patch, Param, Query, Res, Render } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('chzzk')
  async authorize(@Res() reply: any): Promise<void> {
    const { url } = await this.authService.generateAuthUrl();
    reply.redirect(url, 302);
  }

  @Get('chzzk/callback')
  @Render('auth/success')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<{ channelId?: string; channelName?: string; error?: string }> {
    try {
      const channel = await this.authService.handleCallback(code, state);
      return { channelId: channel.channelId, channelName: channel.name };
    } catch (e) {
      return { error: e.message };
    }
  }

  @Patch('chzzk/bot/:channelId')
  async toggleBot(
    @Param('channelId') channelId: string,
    @Body() body: { useBotAccount: boolean },
  ): Promise<{ success: boolean }> {
    await this.authService.toggleBotAccount(channelId, body.useBotAccount);
    return { success: true };
  }
}
