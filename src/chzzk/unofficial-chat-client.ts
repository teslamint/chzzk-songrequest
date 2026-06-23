import { Logger } from '@nestjs/common';

const CHZZK_API_URL = 'https://api.chzzk.naver.com';
const GAME_API_URL = 'https://comm-api.game.naver.com';
const PING_INTERVAL_MS = 20_000;
const CONNECT_TIMEOUT_MS = 10_000;

enum ChatCmd {
  PING = 0,
  CONNECT = 100,
  SEND_CHAT = 3101,
  PONG = 10000,
  CONNECTED = 10100,
}

export class UnofficialChatClient {
  private readonly logger = new Logger(UnofficialChatClient.name);
  private ws: WebSocket | null = null;
  private sid: string | null = null;
  private chatChannelId: string | null = null;
  private userIdHash: string | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private disconnectCallback: (() => void) | null = null;
  private intentionalClose = false;

  constructor(
    private readonly nidAut: string,
    private readonly nidSes: string,
  ) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sid !== null;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  async connect(channelId: string): Promise<boolean> {
    try {
      const chatChannelId = await this.fetchChatChannelId(channelId);
      if (!chatChannelId) {
        this.logger.warn(`Channel ${channelId} is not live`);
        return false;
      }
      this.chatChannelId = chatChannelId;

      this.userIdHash = await this.fetchUserIdHash();
      if (!this.userIdHash) {
        this.logger.error('Failed to fetch userIdHash — NID cookies may be invalid');
        return false;
      }

      const accessToken = await this.fetchChatAccessToken(chatChannelId);
      if (!accessToken) {
        this.logger.error('Failed to fetch chat access token');
        return false;
      }

      const serverId = this.computeServerId(chatChannelId);
      const wsUrl = `wss://kr-ss${serverId}.chat.naver.com/chat`;

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.error('WebSocket connect timeout');
          this.intentionalClose = true;
          this.cleanup();
          resolve(false);
        }, CONNECT_TIMEOUT_MS);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.sendRaw({
            bdy: {
              accTkn: accessToken,
              auth: 'SEND',
              devType: 2001,
              uid: this.userIdHash,
            },
            cmd: ChatCmd.CONNECT,
            tid: 1,
            cid: chatChannelId,
            svcid: 'game',
            ver: '2',
          });
        };

        this.ws.onmessage = (event) => {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : '{}');

          if (data.cmd === ChatCmd.CONNECTED) {
            clearTimeout(timeout);
            this.sid = data.bdy?.sid ?? null;
            this.startPing();
            this.logger.debug(`Connected to ${channelId} chat (sid: ${this.sid})`);
            resolve(true);
          }

          if (data.cmd === ChatCmd.PING) {
            this.sendRaw({ cmd: ChatCmd.PONG, ver: '2' });
          }
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          const wasIntentional = this.intentionalClose;
          this.intentionalClose = false;
          this.cleanup();
          if (!wasIntentional) {
            this.disconnectCallback?.();
          }
        };

        this.ws.onerror = (err) => {
          this.logger.error('WebSocket error', err);
          clearTimeout(timeout);
          this.cleanup();
          resolve(false);
        };
      });
    } catch (err) {
      this.logger.error('Connect failed', err);
      return false;
    }
  }

  async send(message: string): Promise<boolean> {
    if (!this.connected || !this.chatChannelId) {
      return false;
    }

    this.sendRaw({
      bdy: {
        extras: JSON.stringify({
          chatType: 'STREAMING',
          emojis: {},
          osType: 'PC',
          streamingChannelId: this.chatChannelId,
        }),
        msg: message,
        msgTime: Date.now(),
        msgTypeCode: 1,
      },
      retry: false,
      cmd: ChatCmd.SEND_CHAT,
      sid: this.sid,
      tid: 3,
      cid: this.chatChannelId,
      svcid: 'game',
      ver: '2',
    });

    return true;
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.ws?.close();
    this.cleanup();
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.sid = null;
    this.ws = null;
  }

  private sendRaw(data: Record<string, unknown>): void {
    this.ws?.send(JSON.stringify(data));
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRaw({ cmd: ChatCmd.PING, ver: '2' });
      }
    }, PING_INTERVAL_MS);
  }

  private computeServerId(chatChannelId: string): number {
    const sum = chatChannelId
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return (Math.abs(sum) % 9) + 1;
  }

  private cookieHeader(): string {
    return `NID_AUT=${this.nidAut};NID_SES=${this.nidSes}`;
  }

  private async fetchChatChannelId(channelId: string): Promise<string | null> {
    const res = await fetch(
      `${CHZZK_API_URL}/polling/v2/channels/${channelId}/live-status?includePlayerRecommendContent=false`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.content?.chatChannelId ?? null;
  }

  private async fetchUserIdHash(): Promise<string | null> {
    const res = await fetch(`${GAME_API_URL}/nng_main/v1/user/getUserStatus`, {
      headers: { Cookie: this.cookieHeader() },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.content?.userIdHash ?? null;
  }

  private async fetchChatAccessToken(chatChannelId: string): Promise<string | null> {
    const res = await fetch(
      `${GAME_API_URL}/nng_main/v1/chats/access-token?channelId=${chatChannelId}&chatType=STREAMING`,
      { headers: { Cookie: this.cookieHeader() } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.content?.accessToken ?? null;
  }
}
