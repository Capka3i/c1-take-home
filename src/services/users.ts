import { pool } from '../db/mysql';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function loginByName(name: string) {
  const trimmed = name.trim();

  const [[existing]] = await pool.query<RowDataPacket[]>(
    'SELECT id, name FROM users WHERE name = ? LIMIT 1',
    [trimmed],
  );

  let user = existing;
  if (!user) {
    const [res] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [trimmed, `${trimmed.toLowerCase()}@relay.local`],
    );
    user = { id: res.insertId, name: trimmed };
  }

  await pool.execute(
    `INSERT IGNORE INTO conversation_participants (conversation_id, user_id)
     SELECT c.id, ? FROM conversations c`,
    [user.id],
  );

  return { id: user.id, name: user.name };
}
