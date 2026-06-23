import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Buzzk from 'buzzk';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  ChatMessageEvent,
  SendChatMessageEvent,
} from '../chat-bot/chat-bot.events';
import {
  BuzzkChat,
  ChatClientContainer,
  UnofficialChatClientContainer,
} from './chzzk.interface';
import { AuthService } from '../auth/auth.service';
import { UnofficialChatClient } from './unofficial-chat-client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChzzkService implements OnModuleInit {
  private readonly chatClients: ChatClientContainer = {};
  private readonly unofficialClients: UnofficialChatClientContainer = {};
  private readonly noBotAccount = new Set<string>();
  private readonly logger = new Logger(ChzzkService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
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

  public async getUnofficialChatClient(
    channelId: string,
  ): Promise<UnofficialChatClient | null> {
    if (this.unofficialClients[channelId]) {
      return this.unofficialClients[channelId];
    }

    if (this.noBotAccount.has(channelId)) {
      return null;
    }

    const nidAut = this.configService.get<string>('chzzk.bot_nid_aut');
    const nidSes = this.configService.get<string>('chzzk.bot_nid_ses');
    if (!nidAut || !nidSes) {
      this.noBotAccount.add(channelId);
      return null;
    }

    const channel = await this.prisma.channel.findUnique({
      where: { channelId },
    });
    if (!channel?.useBotAccount) {
      this.noBotAccount.add(channelId);
      return null;
    }

    const client = new UnofficialChatClient(nidAut, nidSes);
    client.onDisconnect(() => {
      this.logger.debug(`Unofficial client disconnected from ${channelId}`);
      delete this.unofficialClients[channelId];
    });

    const connected = await client.connect(channelId);
    if (!connected) {
      return null;
    }

    this.unofficialClients[channelId] = client;
    return client;
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

    const unofficialClient = this.unofficialClients[args.channelId];
    if (unofficialClient) {
      unofficialClient.disconnect();
      delete this.unofficialClients[args.channelId];
    }
  }

  @OnEvent('chat.send')
  private async handleChatSend(event: SendChatMessageEvent): Promise<void> {
    if (event.service !== 'CHZZK') return;

    const unofficialClient = await this.getUnofficialChatClient(event.channelId);
    if (unofficialClient) {
      await unofficialClient.send(event.message);
      return;
    }

    const client = await this.getChatClient(event.channelId);
    if (!client) return;
    client.send(event.message);
  }

  @OnEvent('botAccount.changed')
  private handleBotAccountChanged(args: {
    channelId: string;
    useBotAccount: boolean;
  }): void {
    this.noBotAccount.delete(args.channelId);

    if (!args.useBotAccount) {
      const unofficialClient = this.unofficialClients[args.channelId];
      if (unofficialClient) {
        unofficialClient.disconnect();
        delete this.unofficialClients[args.channelId];
      }
    }
  }
}
