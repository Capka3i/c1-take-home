import express from 'express';
import { createMessage, getConversationMessages } from '../services/messages.ts';
import { checkSendRateLimit } from '../services/rateLimit.ts';
import { broadcast } from '../ws/hub.ts';

export const messagesRouter = express.Router();

messagesRouter.post('/', async (req, res) => {
  const { conversationId, senderId, body, clientId } = req.body || {};
  if (!conversationId || !senderId || !body) {
    return res.status(400).json({ error: 'conversationId, senderId and body are required' });
  }

  const rl = await checkSendRateLimit(Number(conversationId), Number(senderId));
  if (!rl.allowed) {
    res.set('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'too many messages', retryAfter: rl.retryAfter });
  }

  const msg = await createMessage({
    conversationId: Number(conversationId),
    senderId: Number(senderId),
    body: String(body),
    clientId: clientId ?? null,
  });

  if (!msg.duplicate) {
    broadcast(msg.conversationId, { type: 'message', ...msg });
  }
  res.status(msg.duplicate ? 200 : 201).json(msg);
});

messagesRouter.get('/', async (req, res) => {
  const conversationId = Number(req.query.conversationId);
  if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

  res.json(await getConversationMessages(conversationId));
});
