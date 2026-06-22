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

export class BuzzkUser {
  channelID: string;
  name: string;
  imageURL: string;
  role: ChzzkUserRole;
  followDate: string | null;
}

export type ChzzkUserRole =
  | 'streamer'
  | 'manager'
  | 'streaming_channel_manager'
  | 'streaming_chat_manager'
  | 'common_user';

export interface ChatClientContainer {
  [key: string]: chat;
}
