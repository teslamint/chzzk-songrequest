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
