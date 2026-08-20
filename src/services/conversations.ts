import { pool } from '../db/mysql';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function listConversations(userId: number) {
	const [conversations] = await pool.query<RowDataPacket[]>(
		`SELECT c.id, c.title
		 FROM conversations c
		 JOIN conversation_participants p ON p.conversation_id = c.id
		 WHERE p.user_id = ?
		 ORDER BY c.id ASC`,
		[userId],
	);

	if (conversations.length === 0) return [];

	const ids = conversations.map((c) => c.id);
	const placeholders = ids.map(() => '?').join(',');

	const [lastMessageRows] = await pool.query<RowDataPacket[]>(
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

	const [countMessageRows] = await pool.query<RowDataPacket[]>(
		`SELECT conversation_id AS conversationId, COUNT(*) AS count
		 FROM messages WHERE conversation_id IN (${placeholders})
		 GROUP BY conversation_id`,
		ids,
	);

	const [lastReadMessageRows] = await pool.query<RowDataPacket[]>(
		`SELECT conversation_id AS conversationId, last_read_message_id AS lastReadId
		 FROM conversation_reads WHERE user_id = ? AND conversation_id IN (${placeholders})`,
		[userId, ...ids],
	);

	const lastMassageByConv = new Map(lastMessageRows.map((r) => [r.conversationId, r]));
	const countMassageByConv = new Map(countMessageRows.map((r) => [r.conversationId, r.count]));
	const readMassageByConv = new Map(lastReadMessageRows.map((r) => [r.conversationId, r.lastReadId]));

	return conversations.map((c) => {
		const last = lastMassageByConv.get(c.id) || null;
		const lastReadId = readMassageByConv.get(c.id) ?? 0;

		const hasUnread = !!last && last.id > lastReadId && last.senderId !== userId;

		return {
			...c,
			lastMessage: last ? { id: last.id, senderId: last.senderId, createdAt: last.createdAt } : null,
			messageCount: countMassageByConv.get(c.id) ?? 0,
			hasUnread,
		};
	});
}


export async function createConversation(title: string, participantIds: number[]) {
	const [created] = await pool.execute<ResultSetHeader>(
		'INSERT INTO conversations (title) VALUES (?)',
		[title],
	);
	const id = created.insertId;
	for (const uid of participantIds) {
		await pool.execute(
			'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
			[id, Number(uid)],
		);
	}
	return { id, title, participantIds: participantIds.map(Number) };
}


export async function markConversationRead(conversationId: number, userId: number) {
	const [[last]] = await pool.query<RowDataPacket[]>(
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

	return { conversationId, lastReadMessageId: lastId };
}
