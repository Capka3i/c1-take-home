import { redis } from '../db/redis';

const LIMIT = 5;
const WINDOW_SEC = 10;


export async function checkSendRateLimit(conversationId: number, userId: number) {
  const key = `rl:send:${conversationId}:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SEC);
  }

  if (count > LIMIT) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : WINDOW_SEC };
  }
  return { allowed: true, retryAfter: 0 };
}
