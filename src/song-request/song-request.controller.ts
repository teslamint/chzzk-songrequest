import { Controller, Get, Param } from '@nestjs/common';
import { SongRequestService } from './song-request.service';

@Controller('song-request')
export class SongRequestController {
  constructor(private songRequestService: SongRequestService) {}

  @Get(':channelId')
  async requests(@Param('channelId') channelId: string) {
    return this.songRequestService.requestsByChannelId(channelId);
  }
}
