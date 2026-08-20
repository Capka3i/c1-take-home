import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redisUrl);

export function createSubscriber(): Redis {
  return new Redis(config.redisUrl);
}
