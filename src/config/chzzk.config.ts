import { registerAs } from '@nestjs/config';

export default registerAs('chzzk', () => ({
  nid_aut: process.env.NID_AUT,
  nid_ses: process.env.NID_SES,
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
  redirect_uri: process.env.CHZZK_REDIRECT_URI,
}));
