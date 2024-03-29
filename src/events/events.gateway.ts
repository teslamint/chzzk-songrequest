import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SongRequestService } from '../song-request/song-request.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  SongRequestClearedEvent,
  SongRequestCreatedEvent,
  SongRequestDeletedEvent,
  SongRequestSkippedEvent,
} from '../song-request/song-request.event';

@WebSocketGateway(0, { cors: { origin: '*' }, transports: ['websocket'] })
export class EventsGateway {
  @WebSocketServer()
  private server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private songRequestService: SongRequestService,
    private eventEmitter: EventEmitter2,
  ) {}

  @SubscribeMessage('init')
  async init(
    @MessageBody() data: { id: string; last_song_id?: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.debug('widget connected:', data);
    this.eventEmitter.emit('widget.open', {
      channelId: data.id,
    });
    const songs = await this.songRequestService.requestsByChannelId(data.id);
    client.join('widget_' + data.id);
    client.emit('widget_' + data.id, JSON.stringify(songs, this.replacer));
  }

  @SubscribeMessage('song_started')
  async songStarted(@MessageBody() data: { id: string; channelId: string }) {
    this.logger.debug('song started:', data);
    // update song status
    await this.songRequestService.setPlaying({
      id: data.id,
      channelId: data.channelId,
    });
  }

  @SubscribeMessage('song_stopped')
  async songStopped(@MessageBody() data: { channelId: string }) {
    this.logger.debug('song stopped:', data);
    await this.songRequestService.revertToPending({
      channelId: data.channelId,
    });
    // disconnect chat
    this.eventEmitter.emit('widget.close', {
      channelId: data.channelId,
    });
  }

  @SubscribeMessage('song_ended')
  async songEnded(@MessageBody() data: { id: string; channelId: string }) {
    this.logger.debug('song ended:', data);
    // update song status
    await this.songRequestService.deleteRequest({
      id: data.id,
      channel_id: data.channelId,
    });
  }

  @OnEvent('songRequest.created')
  async sendNewRequestToWidget(event: SongRequestCreatedEvent) {
    this.logger.debug('request created event', event);
    const { channel_id } = event.data();
    this.server
      .to('widget_' + channel_id)
      .emit(
        'next_song_' + channel_id,
        JSON.stringify(event.data(), this.replacer),
      );
  }

  @OnEvent('songRequest.deleted')
  async sendDeleteRequestToWidget(event: SongRequestDeletedEvent) {
    const { channel_id } = event.data();
    this.server
      .to('widget_' + channel_id)
      .emit(
        'delete_song_' + channel_id,
        JSON.stringify(event.data(), this.replacer),
      );
  }

  @OnEvent('songRequest.skipped')
  async sendSkipRequestToWidget(event: SongRequestSkippedEvent) {
    this.logger.debug('song skipped', event);
    const { channel_id } = event.data();
    this.server
      .to('widget_' + channel_id)
      .emit(
        'skip_song_' + channel_id,
        JSON.stringify(event.data(), this.replacer),
      );
  }

  @OnEvent('songRequest.cleared')
  async sendRequestListClearedToWidget(event: SongRequestClearedEvent) {
    this.logger.debug('list cleared', event);
    const { channel_id } = event.data();
    this.server
      .to(`widget_${channel_id}`)
      .emit(
        'clear_list_' + channel_id,
        JSON.stringify(event.data(), this.replacer),
      );
  }

  private readonly replacer = (_, v) =>
    typeof v === 'bigint' ? v.toString() : v;
}
