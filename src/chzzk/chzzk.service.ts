import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Buzzk from 'buzzk';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  ChatMessageEvent,
  SendChatMessageEvent,
} from '../chat-bot/chat-bot.events';
import { BuzzkChat, ChatClientContainer } from './chzzk.interface';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class ChzzkService implements OnModuleInit {
  private readonly chatClients: ChatClientContainer = {};
  private readonly logger = new Logger(ChzzkService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
  ) {}

  onModuleInit(): void {
    Buzzk.auth(
      this.configService.get<string>('chzzk.client_id'),
      this.configService.get<string>('chzzk.client_secret'),
    );
  }

  public async getChatClient(channelId: string): Promise<Buzzk.chat | null> {
    if (this.chatClients[channelId]) {
      return this.chatClients[channelId];
    }

    const accessToken = await this.authService.getValidAccessToken(channelId);
    if (!accessToken) {
      this.logger.warn(`No valid token for channel ${channelId}`);
      return null;
    }

    const chatClient = new Buzzk.chat(accessToken);
    this.setupChatClientEventListeners(chatClient, channelId);

    chatClient
      .connect()
      .then((result) => {
        if (result) {
          this.handleChatClientConnect(channelId);
        } else {
          this.logger.error(`Failed to connect to ${channelId}`);
        }
      })
      .catch((err) => {
        this.logger.error(`Failed to make initial connect to ${channelId}`, err);
      });

    this.chatClients[channelId] = chatClient;
    return chatClient;
  }

  private setupChatClientEventListeners(
    chatClient: Buzzk.chat,
    channelId: string,
  ): void {
    chatClient.onDisconnect(() => this.handleChatClientDisconnect(channelId));
    chatClient.onMessage((data: BuzzkChat) =>
      this.handleIncomingChatMessage(data, channelId),
    );
  }

  private handleChatClientConnect(channelId: string): void {
    this.logger.debug(`Connected to ${channelId}`);
    this.eventEmitter.emit('chat.connect', { service: 'CHZZK', channelId });
  }

  private handleChatClientDisconnect(channelId: string): void {
    this.logger.debug(`Closed to ${channelId}`);
    this.eventEmitter.emit('chat.disconnect', { service: 'CHZZK', channelId });
    delete this.chatClients[channelId];
  }

  private handleIncomingChatMessage(
    chat: BuzzkChat,
    channelId: string,
  ): void {
    this.logger.debug(`${chat.author.name}: ${chat.message}`);

    const userRole = chat.author.hasMod ? 'manager' : 'user';

    this.eventEmitter.emit(
      'chat.message',
      new ChatMessageEvent({
        service: 'CHZZK',
        channelId,
        message: chat.message,
        timestamp: chat.time,
        userId: chat.author.id,
        role: userRole,
        nickname: chat.author.name,
      }),
    );
  }

  @OnEvent('widget.open')
  private async handleChatConnect(args: { channelId: string }): Promise<void> {
    this.logger.debug('widget open event:', { ...args });
    await this.getChatClient(args.channelId);
  }

  @OnEvent('widget.close')
  private async handleChatDisconnect(args: { channelId: string }): Promise<void> {
    this.logger.debug('widget close event:', { ...args });
    const chatClient = this.chatClients[args.channelId];
    if (chatClient) {
      await chatClient.disconnect();
      delete this.chatClients[args.channelId];
    }
  }

  @OnEvent('chat.send')
  private async handleChatSend(event: SendChatMessageEvent): Promise<void> {
    if (event.service !== 'CHZZK') return;
    const client = await this.getChatClient(event.channelId);
    if (!client) return;
    client.send(event.message);
  }
}
