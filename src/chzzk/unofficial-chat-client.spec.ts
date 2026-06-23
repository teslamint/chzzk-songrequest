import { UnofficialChatClient } from './unofficial-chat-client';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock global WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  simulateOpen(): void {
    this.onopen?.();
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

let mockWs: MockWebSocket;
const MockWebSocketConstructor: any = jest.fn().mockImplementation(() => {
  mockWs = new MockWebSocket();
  return mockWs;
});
MockWebSocketConstructor.OPEN = MockWebSocket.OPEN;
MockWebSocketConstructor.CLOSED = MockWebSocket.CLOSED;
(global as any).WebSocket = MockWebSocketConstructor;

describe('UnofficialChatClient', () => {
  let client: UnofficialChatClient;

  beforeEach(() => {
    client = new UnofficialChatClient('test-nid-aut', 'test-nid-ses');
    jest.clearAllMocks();
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('connect', () => {
    it('should fetch chatChannelId, userIdHash, accessToken and connect WebSocket', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { chatChannelId: 'chat-ch-123', status: 'OPEN' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { userIdHash: 'user-hash-abc' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { accessToken: 'chat-access-tkn', extraToken: 'extra' } }),
        });

      const connectPromise = client.connect('streamer-ch-1');

      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateOpen();

      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateMessage({ cmd: 10100, bdy: { sid: 'session-123' } });

      const result = await connectPromise;
      expect(result).toBe(true);
      expect(client.connected).toBe(true);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"cmd":100'),
      );
    });

    it('should return false when stream is not live', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: { chatChannelId: null, status: 'CLOSE' } }),
      });

      const result = await client.connect('streamer-ch-1');
      expect(result).toBe(false);
    });
  });

  describe('send', () => {
    it('should send cmd 3101 message', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { chatChannelId: 'chat-ch-123', status: 'OPEN' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { userIdHash: 'user-hash-abc' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { accessToken: 'chat-tkn', extraToken: 'extra' } }),
        });

      const connectPromise = client.connect('streamer-ch-1');
      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateOpen();
      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateMessage({ cmd: 10100, bdy: { sid: 'session-123' } });
      await connectPromise;

      jest.clearAllMocks();

      const sent = await client.send('테스트 메시지');
      expect(sent).toBe(true);

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.cmd).toBe(3101);
      expect(sentData.bdy.msg).toBe('테스트 메시지');
      expect(sentData.sid).toBe('session-123');
      expect(sentData.cid).toBe('chat-ch-123');
    });

    it('should return false when not connected', async () => {
      const sent = await client.send('test');
      expect(sent).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket and clear state', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { chatChannelId: 'chat-ch', status: 'OPEN' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { userIdHash: 'uid' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { accessToken: 'tkn', extraToken: 'e' } }),
        });

      const p = client.connect('ch-1');
      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateOpen();
      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateMessage({ cmd: 10100, bdy: { sid: 's' } });
      await p;

      client.disconnect();
      expect(mockWs.close).toHaveBeenCalled();
      expect(client.connected).toBe(false);
    });
  });

  describe('onDisconnect callback', () => {
    async function connectClient(): Promise<void> {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { chatChannelId: 'chat-ch', status: 'OPEN' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { userIdHash: 'uid' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { accessToken: 'tkn', extraToken: 'e' } }),
        });

      const p = client.connect('ch-1');
      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateOpen();
      await new Promise((r) => setTimeout(r, 10));
      mockWs.simulateMessage({ cmd: 10100, bdy: { sid: 's' } });
      await p;
    }

    it('should fire callback on server-initiated disconnect', async () => {
      await connectClient();

      const callback = jest.fn();
      client.onDisconnect(callback);

      mockWs.simulateClose();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should NOT fire callback on intentional disconnect()', async () => {
      await connectClient();

      const callback = jest.fn();
      client.onDisconnect(callback);

      const localWs = mockWs;
      client.disconnect();
      localWs.simulateClose();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should NOT fire callback when onclose fires after timeout cleanup', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { chatChannelId: 'chat-ch', status: 'OPEN' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { userIdHash: 'uid' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { accessToken: 'tkn', extraToken: 'e' } }),
        });

      const callback = jest.fn();
      client.onDisconnect(callback);

      jest.useFakeTimers();
      try {
        const connectPromise = client.connect('ch-1');

        // Allow all microtasks (fetch mocks) to settle
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        mockWs.simulateOpen();

        // Advance past the 10s connect timeout
        await jest.advanceTimersByTimeAsync(10_000);

        const result = await connectPromise;
        expect(result).toBe(false);

        // Simulate onclose firing after the timeout already cleaned up
        mockWs.simulateClose();
        expect(callback).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
