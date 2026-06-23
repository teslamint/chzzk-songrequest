import { chat } from 'buzzk';

export class BuzzkChat {
  author: {
    id: string;
    name: string;
    hasMod: boolean;
  };
  message: string;
  emojis: unknown;
  time: number;
}

export class BuzzkChannel {
  channelID: string;
  name: string;
  follower: number;
  imageURL: string;
}

export interface ChatClientContainer {
  [key: string]: chat;
}

export interface UnofficialChatMessage {
  bdy: Record<string, unknown>;
  cmd: number;
  tid?: number;
  sid?: string;
  cid?: string;
  svcid: string;
  ver: string;
}

export interface UnofficialChatClientContainer {
  [channelId: string]: import('./unofficial-chat-client').UnofficialChatClient;
}
