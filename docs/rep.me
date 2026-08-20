
1. fix display massage and fix loop on pbkdf2.
2. dedup messages by clientId (idempotency): SELECT existing before insert + UNIQUE(conversation_id, client_id) key; broadcast over WS only new messages, not duplicates.
3. fix N+1 queries in conversations list: replaced per-conversation queries with 3 grouped queries (last message via MAX(id), message count, read cursor).
4. add index idx_messages_conversation (conversation_id, id) for fast fetch/sort of a conversation's messages.
5. add unread/read tracking: new conversation_reads table (last_read_message_id) + POST /:id/read endpoint (GREATEST cursor); conversations return hasUnread.
6. fix frontend not re-rendering on send: optimistic render of own message, dedup of WS echo via sentClientIds, WS auto-reconnect on close.

