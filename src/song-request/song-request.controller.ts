import { Controller, Get, Param } from '@nestjs/common';
import { SongRequestService } from './song-request.service';

/**
 * Controller for handling song request related HTTP requests.
 */
@Controller('song-request')
export class SongRequestController {
  constructor(private songRequestService: SongRequestService) {}

  /**
   * Retrieves all song requests for a specific channel.
   * @param channelId - The ID of the channel.
   * @returns A promise that resolves to an array of SongRequest objects.
   */
  @Get(':channelId')
  async requests(@Param('channelId') channelId: string) {
    return this.songRequestService.requestsByChannelId(channelId);
  }
}
