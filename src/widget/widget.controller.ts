import { Controller, Get, Param, Render } from '@nestjs/common';

@Controller('widget')
export class WidgetController {
  @Get('/:channelId')
  @Render('widget/index.hbs')
  page(@Param('channelId') channelId: string) {
    return {
      channelId,
    };
  }
}
