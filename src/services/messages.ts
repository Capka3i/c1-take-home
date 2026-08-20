import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from '../db/mysql';
import { mongo } from '../db/mongo';
import { RowDataPacket } from "mysql2";

const pbkdf2 = promisify(crypto.pbkdf2);

export interface INewMessage {
	conversationId: number;
	senderId: number;
	body: string;
	clientId: string | null;
}

export interface IMessage extends INewMessage {
	id: number;
	createdAt: Date;
	duplicate: boolean;
	senderName: string;
}

export async function createMessage(input: INewMessage): Promise<IMessage> {
	const { conversationId, senderId, body, clientId } = input;

	if (clientId) {
		const [[existing]] = await pool.query<(IMessage & RowDataPacket)[]>(
			`SELECT m.id,
                    m.conversation_id AS conversationId,
                    m.sender_id       AS senderId,
                    u.name            AS senderName,
                    m.created_at      AS createdAt,
                    m.client_id       AS clientId
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = ?
               AND m.client_id = ? LIMIT 1`,
			[conversationId, clientId],
		);
		if (existing) return { ...existing, body, duplicate: true };
	}

	const [res] = await pool.execute(
		'INSERT INTO messages (conversation_id, sender_id, client_id) VALUES (?, ?, ?)',
		[conversationId, senderId, clientId],
	);
	const insertId = (res as { insertId: number }).insertId;

	const [[sender]] = await pool.query<RowDataPacket[]>(
		'SELECT name FROM users WHERE id = ? LIMIT 1',
		[senderId],
	);
	const senderName = sender?.name ?? null;

	const signature = (await pbkdf2(body, 'relay-signing', 200000, 32, 'sha256')).toString('hex');

	const createdAt = new Date();
	await mongo()
		.collection('message_bodies')
		.insertOne({
			_id: insertId as any,
			conversationId,
			senderId,
			body,
			signature,
			createdAt,
		});

	return { id: insertId, conversationId, senderId, senderName, body, createdAt, duplicate: false, clientId };
}

export async function getConversationMessages(conversationId: number) {
	const [rows] = await pool.query<RowDataPacket[]>(
		`SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
		        u.name AS senderName, m.created_at AS createdAt
		 FROM messages m
		 JOIN users u ON u.id = m.sender_id
		 WHERE m.conversation_id = ? ORDER BY m.id ASC`,
		[conversationId],
	);

	const ids = rows.map((r) => r.id);
	const bodies = ids.length
		? await mongo().collection('message_bodies').find({ _id: { $in: ids } }).toArray()
		: [];
	const bodyById = new Map(bodies.map((b) => [b._id, b.body]));

	return rows.map((r) => ({ ...r, body: bodyById.get(r.id) ?? '' }));
}
