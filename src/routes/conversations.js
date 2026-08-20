import express from 'express';
import {
  listConversations,
  createConversation,
  markConversationRead,
} from '../services/conversations.ts';

export const conversationsRouter = express.Router();

conversationsRouter.get('/', async (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  res.json(await listConversations(userId));
});

conversationsRouter.post('/', async (req, res) => {
  const { title, participantIds } = req.body || {};
  if (!title || !Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'title and a non-empty participantIds[] are required' });
  }

  res.status(201).json(await createConversation(title, participantIds));
});

conversationsRouter.post('/:id/read', async (req, res) => {
  const conversationId = Number(req.params.id);
  const userId = Number(req.body?.userId);
  if (!conversationId || !userId) {
    return res.status(400).json({ error: 'conversationId and userId are required' });
  }

  res.json(await markConversationRead(conversationId, userId));
});
