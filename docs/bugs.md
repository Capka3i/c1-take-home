# Bugs found & fixed

Format per fix: **Symptom** (what you actually see under real use) → **Cause** (why) → **Fix** (what was changed).

---

## 1. Server stalls / latency spikes under load
- **Symptom:** with more than one user actively sending, the whole API becomes sluggish — every request slows down, not just message sends.
- **Cause:** each message computed its body signature with a synchronous PBKDF2 (200 000 iterations). That is CPU-heavy and ran on the main thread, blocking Node's event loop for every send, so all other in-flight requests waited behind it.
- **Fix:** switched to the async `crypto.pbkdf2` (via `promisify`) and `await` it, so hashing no longer blocks the event loop (`src/services/messages.ts`).

## 2. Messages didn't show up correctly in the UI
- **Symptom:** sent/received messages either didn't render or showed the sender as a raw `#id`.
- **Cause:** the render path didn't consistently carry the message body / sender name, and there was no optimistic render of your own message.
- **Fix:** message rows now join `users` for `senderName`, bodies are fetched from Mongo and merged by id, and the client renders sender name (falls back to `#id`) (`src/services/messages.ts`, `web/app.js`).

## 3. Duplicate messages on retry / double-send
- **Symptom:** a flaky network or a double click produced the same message twice.
- **Cause:** no idempotency — every `POST /api/messages` inserted a new row unconditionally, and the WS echo re-appended messages the sender already saw.
- **Fix:** idempotency via `clientId` — `SELECT` an existing message with the same `(conversation_id, client_id)` before inserting and return it if found; added a `UNIQUE(conversation_id, client_id)` key as a DB-level safety net; broadcast over WS only for genuinely new messages (not duplicates); client dedups its own WS echo via `sentClientIds` (`src/services/messages.ts`, `src/routes/messages.js`, `docker/db/mysql.sql`, `web/app.js`).

## 4. Conversation list was slow (N+1 queries)
- **Symptom:** loading the sidebar got noticeably slower as the number of conversations grew.
- **Cause:** the list ran per-conversation queries (last message, count, read state) — classic N+1.
- **Fix:** replaced with 3 grouped queries — last message via a `MAX(id)` derived join, `COUNT(*)` per conversation, and the read cursor — then assembled in memory (`src/services/conversations.ts`).

## 5. Slow fetch/sort of a conversation's messages
- **Symptom:** opening a busy conversation was slow to load its history.
- **Cause:** no index supporting the `WHERE conversation_id = ? ORDER BY id` access pattern, so MySQL scanned.
- **Fix:** added composite index `idx_messages_conversation (conversation_id, id)` (`docker/db/mysql.sql`).

## 6. No unread state
- **Symptom:** no way to tell which conversations had new messages.
- **Cause:** read state was never tracked.
- **Fix:** new `conversation_reads` table (`last_read_message_id`) + `POST /api/conversations/:id/read` endpoint using a `GREATEST(...)` cursor so it only moves forward; the list now returns `hasUnread` (last message id > read cursor, and not authored by the viewer) (`src/services/conversations.ts`, `src/routes/conversations.js`, `docker/db/mysql.sql`).

## 7. Frontend didn't update on its own sends / lost realtime after reconnect
- **Symptom:** after sending, your own message didn't appear until reload; and after the dev server restarted, the tab silently stopped receiving live messages.
- **Cause:** the UI relied on the WS echo to render (with no optimistic update), and the WebSocket had no reconnect logic when the socket dropped.
- **Fix:** optimistic render of your own message on send, dedup of the incoming WS echo via `sentClientIds`, and WS auto-reconnect on `close` (`web/app.js`).
