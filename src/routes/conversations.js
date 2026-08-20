import express from 'express';
import { pool } from '../db/mysql.ts';

export const conversationsRouter = express.Router();

conversationsRouter.get('/', async (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const [conversations] = await pool.query(
    `SELECT c.id, c.title
     FROM conversations c
     JOIN conversation_participants p ON p.conversation_id = c.id
     WHERE p.user_id = ?
     ORDER BY c.id ASC`,
    [userId],
  );

  if (conversations.length === 0) return res.json([]);

  const ids = conversations.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(',');

  const [lastMessageRows] = await pool.query(
    `SELECT m.conversation_id AS conversationId, m.id, m.sender_id AS senderId, m.created_at AS createdAt
     FROM messages m
     JOIN (
       SELECT conversation_id, MAX(id) AS maxId
       FROM messages
       WHERE conversation_id IN (${placeholders})
       GROUP BY conversation_id
     ) t ON t.conversation_id = m.conversation_id AND t.maxId = m.id`,
    ids,
  );

  const [countMessageRows] = await pool.query(
    `SELECT conversation_id AS conversationId, COUNT(*) AS count
     FROM messages WHERE conversation_id IN (${placeholders})
     GROUP BY conversation_id`,
    ids,
  );

  const [lastReadMessageRows] = await pool.query(
    `SELECT conversation_id AS conversationId, last_read_message_id AS lastReadId
     FROM conversation_reads WHERE user_id = ? AND conversation_id IN (${placeholders})`,
    [userId, ...ids],
  );

  const lastByConv = new Map(lastMessageRows.map((r) => [r.conversationId, r]));
  const countByConv = new Map(countMessageRows.map((r) => [r.conversationId, r.count]));
  const readByConv = new Map(lastReadMessageRows.map((r) => [r.conversationId, r.lastReadId]));

  const result = conversations.map((c) => {
    const last = lastByConv.get(c.id) || null;
    const lastReadId = readByConv.get(c.id) ?? 0;

    const hasUnread = !!last && last.id > lastReadId && last.senderId !== userId;

    return {
      ...c,
      lastMessage: last ? { id: last.id, senderId: last.senderId, createdAt: last.createdAt } : null,
      messageCount: countByConv.get(c.id) ?? 0,
      hasUnread,
    };
  });

  res.json(result);
});

conversationsRouter.post('/', async (req, res) => {
  const { title, participantIds } = req.body || {};
  if (!title || !Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'title and a non-empty participantIds[] are required' });
  }

  const [created] = await pool.execute('INSERT INTO conversations (title) VALUES (?)', [title]);
  const id = created.insertId;
  for (const uid of participantIds) {
    await pool.execute(
      'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
      [id, Number(uid)],
    );
  }

  res.status(201).json({ id, title, participantIds: participantIds.map(Number) });
});

conversationsRouter.post('/:id/read', async (req, res) => {
  const conversationId = Number(req.params.id);
  const userId = Number(req.body?.userId);
  if (!conversationId || !userId) {
    return res.status(400).json({ error: 'conversationId and userId are required' });
  }

  const [[last]] = await pool.query(
    'SELECT MAX(id) AS maxId FROM messages WHERE conversation_id = ?',
    [conversationId],
  );
  const lastId = last?.maxId ?? 0;

  await pool.execute(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id))`,
    [conversationId, userId, lastId],
  );

  res.json({ conversationId, lastReadMessageId: lastId });
});
