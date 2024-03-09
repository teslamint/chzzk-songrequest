interface ChatMessageEventExtraInterface {
  [key: string]: any;
}

export class ChatMessageEvent {
  readonly service: string;
  readonly channelId: string;
  readonly nickname?: string;
  readonly userId: string;
  readonly message: string;
  readonly timestamp: number;
  readonly extras: Readonly<ChatMessageEventExtraInterface>;

  constructor(args: {
    service: string;
    channelId: string;
    message: string;
    timestamp: number;
    userId: string;
    nickname?: string;
    extras?: object;
  }) {
    this.service = args.service;
    this.channelId = args.channelId;
    this.message = args.message;
    this.timestamp = args.timestamp;
    this.userId = args.userId;
    if (args.nickname) {
      this.nickname = args.nickname;
    }
    if (args.extras) {
      this.extras = Object.freeze({ ...args.extras });
    }
  }
}

export class SendChatMessageEvent {
  readonly service: string;
  readonly message: string;
  readonly channelId: string;

  constructor(args: { service: string; message: string; channelId: any }) {
    this.service = args.service;
    this.message = args.message;
    this.channelId = args.channelId;
  }
}
