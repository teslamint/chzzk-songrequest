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
  private static readonly CONNECT_FAILURE_COOLDOWN_MS = 60_000;
  private static readonly RECONNECT_MAX_RETRIES = 5;
  private static readonly RECONNECT_BASE_DELAY_MS = 1_000;
  private static readonly RECONNECT_MAX_DELAY_MS = 30_000;

  private readonly chatClients: ChatClientContainer = {};
  private readonly unofficialClients: UnofficialChatClientContainer = {};
  private readonly connectingClients: Record<
    string,
    Promise<UnofficialChatClient | null>
  > = {};
  private readonly connectFailedUntil: Record<string, number> = {};
  private readonly noBotAccount = new Set<string>();
  private readonly activeChannels = new Set<string>();
  private readonly reconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  private readonly reconnectAttempts: Record<string, number> = {};
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

    if (this.connectingClients[channelId]) {
      return this.connectingClients[channelId];
    }

    const failedUntil = this.connectFailedUntil[channelId];
    if (failedUntil && Date.now() < failedUntil) {
      return null;
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

    const connectPromise = this.resolveAndCreateUnofficialClient(
      channelId,
      nidAut,
      nidSes,
    );
    this.connectingClients[channelId] = connectPromise;

    try {
      return await connectPromise;
    } finally {
      delete this.connectingClients[channelId];
    }
  }

  private async resolveAndCreateUnofficialClient(
    channelId: string,
    nidAut: string,
    nidSes: string,
  ): Promise<UnofficialChatClient | null> {
    const channel = await this.prisma.channel.findUnique({
      where: { channelId },
    });
    if (!channel?.useBotAccount) {
      this.noBotAccount.add(channelId);
      return null;
    }

    return this.createUnofficialClient(channelId, nidAut, nidSes);
  }

  private async createUnofficialClient(
    channelId: string,
    nidAut: string,
    nidSes: string,
  ): Promise<UnofficialChatClient | null> {
    const client = new UnofficialChatClient(nidAut, nidSes);
    client.onDisconnect(() => {
      this.logger.debug(`Unofficial client disconnected from ${channelId}`);
      delete this.unofficialClients[channelId];
      if (this.activeChannels.has(channelId)) {
        this.scheduleReconnect(channelId, 'unofficial');
      }
    });

    const connected = await client.connect(channelId);
    if (!connected) {
      this.connectFailedUntil[channelId] =
        Date.now() + ChzzkService.CONNECT_FAILURE_COOLDOWN_MS;
      return null;
    }

    delete this.connectFailedUntil[channelId];
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

    if (this.activeChannels.has(channelId)) {
      this.scheduleReconnect(channelId, 'official');
    }
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
    this.activeChannels.add(args.channelId);
    await this.getChatClient(args.channelId);
  }

  @OnEvent('widget.close')
  private async handleChatDisconnect(args: { channelId: string }): Promise<void> {
    this.logger.debug('widget close event:', { ...args });
    this.activeChannels.delete(args.channelId);
    this.cancelReconnect(args.channelId);

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
    delete this.connectFailedUntil[args.channelId];

    if (!args.useBotAccount) {
      const unofficialClient = this.unofficialClients[args.channelId];
      if (unofficialClient) {
        unofficialClient.disconnect();
        delete this.unofficialClients[args.channelId];
      }
    }
  }

  private scheduleReconnect(channelId: string, type: 'official' | 'unofficial'): void {
    const key = `${type}:${channelId}`;
    const attempt = (this.reconnectAttempts[key] ?? 0) + 1;

    if (attempt > ChzzkService.RECONNECT_MAX_RETRIES) {
      this.logger.warn(`Max reconnect attempts reached for ${key}`);
      delete this.reconnectAttempts[key];
      if (this.reconnectTimers[key]) {
        clearTimeout(this.reconnectTimers[key]);
        delete this.reconnectTimers[key];
      }
      return;
    }

    this.reconnectAttempts[key] = attempt;
    const delay = Math.min(
      ChzzkService.RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
      ChzzkService.RECONNECT_MAX_DELAY_MS,
    );

    this.logger.debug(`Scheduling ${type} reconnect for ${channelId} in ${delay}ms (attempt ${attempt}/${ChzzkService.RECONNECT_MAX_RETRIES})`);

    this.reconnectTimers[key] = setTimeout(async () => {
      delete this.reconnectTimers[key];

      if (!this.activeChannels.has(channelId)) {
        delete this.reconnectAttempts[key];
        return;
      }

      try {
        if (type === 'official') {
          const client = await this.getChatClient(channelId);
          if (client) {
            this.logger.log(`Reconnected official client for ${channelId}`);
            delete this.reconnectAttempts[key];
          } else {
            this.scheduleReconnect(channelId, type);
          }
        } else {
          const client = await this.getUnofficialChatClient(channelId);
          if (client) {
            this.logger.log(`Reconnected unofficial client for ${channelId}`);
            delete this.reconnectAttempts[key];
          } else {
            this.scheduleReconnect(channelId, type);
          }
        }
      } catch (err) {
        this.logger.error(`Reconnect failed for ${key}`, err);
        this.scheduleReconnect(channelId, type);
      }
    }, delay);
  }

  private cancelReconnect(channelId: string): void {
    for (const type of ['official', 'unofficial'] as const) {
      const key = `${type}:${channelId}`;
      if (this.reconnectTimers[key]) {
        clearTimeout(this.reconnectTimers[key]);
        delete this.reconnectTimers[key];
      }
      delete this.reconnectAttempts[key];
    }
  }
}
