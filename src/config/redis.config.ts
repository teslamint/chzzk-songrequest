import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10) || 5432,
  user: process.env.REDIS_USER,
  pass: process.env.REDIS_PASS,
}));
