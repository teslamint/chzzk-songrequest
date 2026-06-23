import * as Buzzk from 'buzzk';

const SKIP = !process.env.CHZZK_TEST_REFRESH_TOKEN;

(SKIP ? describe.skip : describe)('CHZZK Chat Smoke Test', () => {
  const CLIENT_ID = process.env.CHZZK_TEST_CLIENT_ID!;
  const CLIENT_SECRET = process.env.CHZZK_TEST_CLIENT_SECRET!;
  const REFRESH_TOKEN = process.env.CHZZK_TEST_REFRESH_TOKEN!;

  let accessToken: string;

  beforeAll(async () => {
    Buzzk.auth(CLIENT_ID, CLIENT_SECRET);

    const tokens = await Buzzk.oauth.refresh(REFRESH_TOKEN);
    expect(tokens).not.toBeNull();
    expect(tokens.access).toBeDefined();
    expect(tokens.refresh).toBeDefined();
    expect(tokens.expireIn).toBeGreaterThan(0);
    accessToken = tokens.access;
  }, 30000);

  it('should resolve access token to channel info', async () => {
    const channel = await Buzzk.oauth.resolve(accessToken);
    expect(channel).not.toBeNull();
    expect(channel.channelID).toBeDefined();
    expect(channel.name).toBeDefined();
  }, 15000);

  it('should connect to chat and disconnect', async () => {
    const chat = new Buzzk.chat(accessToken);
    const connected = await chat.connect();
    expect(connected).toBe(true);
    await chat.disconnect();
  }, 30000);
});
