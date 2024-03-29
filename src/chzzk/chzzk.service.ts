import { Injectable, Logger } from '@nestjs/common';
import { ChatEvent, ChzzkChat, ChzzkClient } from 'chzzk';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  ChatMessageEvent,
  SendChatMessageEvent,
} from '../chat-bot/chat-bot.events';
import { ChatClientContainer } from './chzzk.interface';

@Injectable()
export class ChzzkService {
  private readonly client: ChzzkClient;
  private readonly chatClients: ChatClientContainer = {};
  private readonly logger = new Logger(ChzzkService.name);

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.client = new ChzzkClient({
      nidAuth: this.configService.get('NID_AUT'),
      nidSession: this.configService.get('NID_SES'),
    });
  }

  getChatClient(channelId: string): ChzzkChat {
    if (!this.chatClients[channelId]) {
      this.chatClients[channelId] = this.initChat(channelId);
      this.chatClients[channelId].connect().then(() => {});
    }
    return this.chatClients[channelId];
  }

  @OnEvent('widget.open')
  private handleChatConnect(args: { channelId: string }) {
    this.logger.debug('widget open event:', { ...args });
    const { channelId } = args;
    this.getChatClient(channelId);
  }

  @OnEvent('widget.close')
  private async handleChatDisconnect(args: { channelId: string }) {
    this.logger.debug('widget close event:', { ...args });
    const { channelId } = args;
    if (this.chatClients[channelId]) {
      this.chatClients[channelId].disconnect().then(() => {
        this.logger.debug('chat disconnected');
        delete this.chatClients[channelId];
      });
    }
  }

  @OnEvent('chat.send')
  private handleChatSend(event: SendChatMessageEvent) {
    if (event.service !== 'CHZZK') {
      return;
    }
    this.logger.debug(
      `sending message to channel: ${event.channelId} - ${event.message}`,
    );
    this.getChatClient(event.channelId).sendChat(event.message);
  }

  private initChat(channelId: string) {
    // init chat client
    const chatClient = new ChzzkChat({
      client: this.client,
      channelId: channelId,
    });

    // init chat event
    chatClient.on('connect', () => {
      this.logger.debug(`Connected to ${channelId}`);
      this.eventEmitter.emit('chat.connect', {
        service: 'CHZZK',
        channelId: channelId,
      });
    });

    // 재연결 (방송 시작 시)
    chatClient.on('reconnect', () => {
      this.logger.debug(`Reconnected to ${channelId}`);
      this.eventEmitter.emit('chat.recoonect', {
        service: 'CHZZK',
        channelId: channelId,
      });
    });

    // 연결 종료
    chatClient.on('disconnect', () => {
      this.logger.debug(`Closed to ${channelId}`);
      this.eventEmitter.emit('chat.disconnect', {
        service: 'CHZZK',
        channelId: channelId,
      });
    });

    // 일반 채팅
    chatClient.on('chat', async (chat: ChatEvent) => {
      this.logger.debug(`chat time: ${chat.time}`);
      const message = chat.hidden ? '[블라인드 처리 됨]' : chat.message;
      this.logger.debug(`${chat.profile.nickname}: ${message}`);

      const userRole = ((role) => {
        switch (role) {
          case 'common_user':
            return 'user';
          case 'streamer':
            return 'streamer';
          case 'manager':
          case 'streaming_channel_manager':
          case 'streaming_chat_manager':
            return 'manager';
          default:
            return 'unknown';
        }
      })(chat.profile.userRoleCode);

      this.eventEmitter.emit(
        'chat.message',
        new ChatMessageEvent({
          service: 'CHZZK',
          channelId: channelId,
          message: message,
          timestamp: chat.time,
          userId: chat.profile.userIdHash,
          role: userRole,
          nickname: chat.profile.nickname,
          extras: {
            hidden: chat.hidden,
          },
        }),
      );
    });
    return chatClient;
  }
}
