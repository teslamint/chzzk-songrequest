import { registerAs } from '@nestjs/config';

export default registerAs('chzzk', () => ({
  nid_aut: process.env.NID_AUT,
  nid_ses: process.env.NID_SES,
  channel_id: process.env.CHZZK_CHANNEL_ID,
}));
