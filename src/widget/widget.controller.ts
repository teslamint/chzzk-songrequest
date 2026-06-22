import { Controller, Get, Param, Render } from '@nestjs/common';

/**
 * Controller for rendering the widget page.
 */
@Controller('widget')
export class WidgetController {
  /**
   * Renders the widget page for a specific channel.
   * @param channelId - The ID of the channel.
   * @returns An object containing the channel ID to be used in the template.
   */
  @Get('/:channelId')
  @Render('widget/index.hbs')
  page(@Param('channelId') channelId: string) {
    return {
      channelId,
    };
  }
}
