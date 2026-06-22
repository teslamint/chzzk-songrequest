import { Injectable, Logger } from '@nestjs/common';
import * as Buzzk from 'buzzk';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  ChatMessageEvent,
  SendChatMessageEvent,
} from '../chat-bot/chat-bot.events';
import {
  BuzzkChat,
  BuzzkUser,
  ChatClientContainer,
  ChzzkUserRole,
} from './chzzk.interface';

@Injectable()
export class ChzzkService {
  private readonly chatClients: ChatClientContainer = {};
  private readonly logger = new Logger(ChzzkService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializeBuzzkLogin();
  }

  /**
   * Retrieves the chat client for a given channel ID.
   * If a client doesn't exist, it initializes, connects, and stores it.
   * @param channelId - The ID of the channel.
   * @returns The chat client for the channel.
   */
  public getChatClient(channelId: string): Buzzk.chat {
    if (!this.chatClients[channelId]) {
      this.chatClients[channelId] = this.createAndConnectChatClient(channelId);
    }
    return this.chatClients[channelId];
  }

  /**
   * Initializes the Buzzk login with credentials from the config.
   */
  private initializeBuzzkLogin(): void {
    Buzzk.login(
      this.configService.get('NID_AUT'),
      this.configService.get('NID_SES'),
    );
  }

  /**
   * Creates a new chat client, connects it, and handles events.
   * @param channelId - The ID of the channel.
   * @returns The initialized chat client.
   */
  private createAndConnectChatClient(channelId: string): Buzzk.chat {
    const chatClient = new Buzzk.chat(channelId);
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
        this.logger.error(
          `Failed to make initial connect to ${channelId}`,
          err,
        );
      });
    return chatClient;
  }

  /**
   * Sets up event listeners for connect, disconnect, and messages on the chat client.
   * @param chatClient - The chat client instance.
   * @param channelId - The ID of the channel.
   */
  private setupChatClientEventListeners(
    chatClient: Buzzk.chat,
    channelId: string,
  ): void {
    chatClient.onDisconnect(() => this.handleChatClientDisconnect(channelId));
    chatClient.onMessage((data: BuzzkChat) =>
      this.handleIncomingChatMessage(data, chatClient, channelId),
    );
  }

  /**
   * Handles the chat client connection event.
   * @param channelId - The ID of the channel.
   */
  private handleChatClientConnect(channelId: string): void {
    this.logger.debug(`Connected to ${channelId}`);
    this.eventEmitter.emit('chat.connect', {
      service: 'CHZZK',
      channelId,
    });
  }

  /**
   * Handles the chat client disconnection event.
   * @param channelId - The ID of the channel.
   */
  private handleChatClientDisconnect(channelId: string): void {
    this.logger.debug(`Closed to ${channelId}`);
    this.eventEmitter.emit('chat.disconnect', {
      service: 'CHZZK',
      channelId,
    });
  }

  /**
   * Handles incoming chat messages.
   * @param data - The incoming chat message data.
   * @param chatClient - The chat client instance.
   * @param channelId - The ID of the channel.
   */
  private async handleIncomingChatMessage(
    chat: BuzzkChat,
    chatClient: Buzzk.chat,
    channelId: string,
  ): Promise<void> {
    this.logger.debug(`chat time: ${chat.time}`);
    this.logger.debug(`${chat.author.name}: ${chat.message}`);

    const userInfo: BuzzkUser = await chatClient.getUserInfo(chat.author.id);
    const userRole = this.mapChzzkUserRoleToChatUserRole(userInfo.role);

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

  /**
   * Maps Chzzk user roles to the internal chat user roles.
   * @param chzzkRole - The Chzzk user role.
   * @returns The internal chat user role.
   */
  private mapChzzkUserRoleToChatUserRole(
    chzzkRole: ChzzkUserRole,
  ): 'streamer' | 'manager' | 'user' | 'unknown' {
    switch (chzzkRole) {
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
  }

  /**
   * Handles the 'widget.open' event.
   * Connects to the chat for the given channel when the widget is opened.
   * @param args - Event arguments containing the channel ID.
   */
  @OnEvent('widget.open')
  private handleChatConnect(args: { channelId: string }): void {
    this.logger.debug('widget open event:', { ...args });
    this.getChatClient(args.channelId);
  }

  /**
   * Handles the 'widget.close' event.
   * Disconnects from the chat for the given channel when the widget is closed.
   * @param args - Event arguments containing the channel ID.
   */
  @OnEvent('widget.close')
  private async handleChatDisconnect(args: {
    channelId: string;
  }): Promise<void> {
    this.logger.debug('widget close event:', { ...args });
    const { channelId } = args;
    const chatClient = this.chatClients[channelId];

    if (chatClient) {
      await chatClient.disconnect();
      this.logger.debug('chat disconnected');
      delete this.chatClients[channelId];
    }
  }

  /**
   * Handles the 'chat.send' event.
   * Sends a chat message to the specified channel.
   * @param event - Event containing message details (service, message, channelId).
   */
  @OnEvent('chat.send')
  private handleChatSend(event: SendChatMessageEvent): void {
    if (event.service !== 'CHZZK') {
      return;
    }
    this.logger.debug(
      `sending message to channel: ${event.channelId} - ${event.message}`,
    );
    this.getChatClient(event.channelId).send(event.message);
  }
}
