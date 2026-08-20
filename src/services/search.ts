import { pool } from '../db/mysql';
import { mongo } from '../db/mongo';
import { RowDataPacket } from 'mysql2';


function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchMessages(q: string) {

	const bodies = await mongo()
		.collection('message_bodies')
		.find({ body: { $regex: escapeRegex(q), $options: 'i' } })
		.sort({ _id: -1 })
		.limit(50)
		.toArray();

	if (bodies.length === 0) return [];

	const convIds = [...new Set(bodies.map((b) => b.conversationId))];
	const placeholders = convIds.map(() => '?').join(',');
	const [titleRows] = await pool.query<RowDataPacket[]>(
		`SELECT id, title FROM conversations WHERE id IN (${placeholders})`,
		convIds,
	);
	const titleById = new Map(titleRows.map((r) => [r.id, r.title]));

	return bodies.map((b) => ({
		conversationId: b.conversationId,
		conversationTitle: titleById.get(b.conversationId) ?? null,
		body: b.body,
	}));
}
