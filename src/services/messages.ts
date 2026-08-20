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
}

export async function createMessage(input: INewMessage): Promise<IMessage> {
	const { conversationId, senderId, body, clientId } = input;

	if (clientId) {
		const [[existing]] = await pool.query<(IMessage & RowDataPacket)[]>(
			`SELECT id,
                    conversation_id AS conversationId,
                    sender_id       AS senderId,
                    created_at      AS createdAt,
                    client_id       AS clientId
             FROM messages
             WHERE conversation_id = ?
               AND client_id = ? LIMIT 1`,
			[conversationId, clientId],
		);
		if (existing) return { ...existing, body, duplicate: true };
	}

	const [res] = await pool.execute(
		'INSERT INTO messages (conversation_id, sender_id, client_id) VALUES (?, ?, ?)',
		[conversationId, senderId, clientId],
	);
	const insertId = (res as { insertId: number }).insertId;

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

	return { id: insertId, conversationId, senderId, body, createdAt, duplicate: false, clientId };
}
