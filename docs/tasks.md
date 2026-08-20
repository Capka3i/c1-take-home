# Tasks

## Done

- [x] **Search** — `GET /api/search`: substring search over message bodies (Mongo), conversation titles joined from MySQL; results shown as clickable cards in the UI.
- [x] **Multi-instance realtime** — WS hub broadcasts over Redis pub/sub (`relay:broadcast`), so new messages / unread work across several API instances (`--scale api=N`).
- [x] **Typing indicator** — client sends a `typing` WS event (throttled) → relayed via Redis to the conversation → UI shows "#user друкує…" with auto-fade.
- [x] **Rate limiting** — `POST /api/messages` capped at 5 / 10s per user per conversation via a Redis counter (shared across instances); over the cap → `429` + `Retry-After`.

## Extra

- [x] **Refactor** — moved all DB queries out of the routes into services (`messages` / `conversations` / `search`); routes are now thin (parse → call service → respond).
- [x] **Nickname login** — first visit asks for a nickname (`POST /api/users/login`, find-or-create + auto-join all conversations); identity stored in localStorage and drives all requests. Logout button re-opens the nickname prompt. Messages/typing now show names instead of `#id`.
