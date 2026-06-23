import { registerAs } from '@nestjs/config';

export default registerAs('chzzk', () => ({
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
  redirect_uri: process.env.CHZZK_REDIRECT_URI,
  bot_nid_aut: process.env.BOT_NID_AUT ?? null,
  bot_nid_ses: process.env.BOT_NID_SES ?? null,
}));
