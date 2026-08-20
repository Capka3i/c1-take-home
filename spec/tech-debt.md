# What I'd do differently

Notes on decisions I'd make differently in hindsight. For each: how it's implemented right now (**current state**) and why the alternative is better.

---

## 1. A single database instead of two (MySQL + MongoDB)

**Current state:** polyglot persistence — metadata (users, conversations, conversation_participants, message rows, conversation_reads) lives in **MySQL**, while message bodies + signature live in **MongoDB** (`message_bodies`, where `_id` = MySQL `insertId`). Writing a new message hits two databases **without a shared transaction**: first an `INSERT` of the row in MySQL, then an `insertOne` of the body in Mongo.

**Drawback:** if the process crashes between those two steps, you're left with an inconsistency — a message row without a body (or a body without a row). For a chat app that's a real integrity risk, not just extra complexity.

**What I'd do differently:** keep everything in **one database**. I lean toward **PostgreSQL** — it covers the relational side (participants, reads, dedup via `UNIQUE`) and search (full-text `tsvector` or `pg_trgm`), so it would also cover the Search task without Mongo — and with transactional write integrity. The alternative is pure Mongo, but then you lose the convenient relational joins for participants/reads.

## 2. Start with authentication, not with chats

**Current state:** the chat was built first with a hardcoded identity (`userId = 1`), and identity was bolted on later — nickname login (`POST /api/users/login`, find-or-create, auto-join all conversations), with the user stored in `localStorage` and driving every request.

**Drawback:** identity is the foundation that authorization, the rate-limit key (`rl:send:<conversationId>:<userId>`) and unread tracking all depend on. Building the chat on a hardcoded id meant retrofitting identity into code that was already written.

**What I'd do differently:** start from `users`/login so the data model and every identity-dependent mechanism (authz, rate-limit, reads) rest on a real identity from the start instead of a stub. This also covers the related security gaps: today `POST /api/messages` trusts `senderId` from the request body (a client can post as anyone), and WebSocket connections aren't authenticated (anyone can `subscribe` to any `conversationId`). Deriving identity server-side from a session/token closes both.

## 3. A query builder (Knex or Sequelize) instead of raw SQL

**Current state:** all queries are raw parameterized SQL through the `mysql2` pool. Dynamic `IN (...)` clauses are assembled by hand: `const placeholders = ids.map(() => '?').join(',')` across several services (`conversations.ts`, `search.ts`), and rows are mapped into objects manually.

**Drawback:** hand-building placeholders and mapping rows is boilerplate that's easy to break (e.g. a mismatch between the number of `?` and arguments). There's no result typing or autocomplete.

**What I'd do differently:** use a query builder.
- **Knex** — a lightweight builder, enough for these queries; you stay close to SQL, with no "magic".
- **Sequelize** — a full ORM (models, relations, migrations) — more control/convenience, but more abstraction.

Both are safer than string concatenation (parameterization and escaping out of the box) and reduce the chance of mistakes in dynamic queries. Caveat: the current SQL is already parameterized and **not vulnerable to injection** — so this is about convenience, readability and type safety, not a security hole.

## 4. A frontend framework (React / Vue / Angular)

**Current state:** plain vanilla JS (`web/app.js`, ~256 lines) — manual `document.createElement` / `innerHTML`, state in global variables (`conversations`, `activeConversation`, `userId`), DOM kept in sync by hand (`renderSidebar()`), with no build step or components.

**Drawback:** state and DOM have to be kept in sync manually — easy to desync; there are no components/reactivity, so the code sprawls as features grow.

**What I'd do differently:** use a frontend framework with reactive state and components.
- **React** — the largest ecosystem;
- **Vue** — the gentlest learning curve;
- **Angular** — batteries included, TypeScript out of the box.

And once you're moving to frameworks, adopt **Nest.js** on the backend instead of bare Express: modules, controllers, providers, DI and validation pipes give you structure out of the box (right now routes + services are wired by hand). It's the backend counterpart to a frontend framework — an opinionated structure on both sides of the stack. Nest doesn't replace the query builder (#3): they compose — Nest structures the app, while Knex/Sequelize (or TypeORM/Prisma) remains the data-access layer inside it. Nest and Angular also cover error handling out of the box: Nest catches thrown errors from async handlers via exception filters (bare Express 4 does not — an async throw would hang the request), and Angular centralizes error handling via a global `ErrorHandler` and HTTP interceptors.

## 5. Swagger / OpenAPI — a formal API spec

**Current state:** the API isn't described formally anywhere — endpoints are only visible from the route code and the README. There's no contract and no interactive documentation.

**Drawback:** consumers (the frontend, an external client, a reviewer) have to read the code to understand request/response shapes, and it's easy for actual behavior and "documentation" to drift apart.

**What I'd do differently:** describe the API with **OpenAPI/Swagger** — a formal contract plus an interactive Swagger UI. It fits Nest.js (#4) well via `@nestjs/swagger`, where the spec is generated from decorators/DTOs, so the docs don't drift from the code.

## 6. Separate services for migrations and seeds

**Current state:** the schema is a raw `docker/db/mysql.sql` applied on MySQL container init (only against an empty database). Seeding is `docker/db/seed.ts`, run as a one-off `seed` service in compose (`npm run seed`). Schema and seed live together under `docker/db/` and are tied to docker-compose.

**Drawback:** there's no schema versioning — any change means editing the SQL and resetting the volume (`down -v`), because init only runs against a clean database; there are no incremental/reversible changes. The seed is mixed with the schema and coupled to compose.

**What I'd do differently:** split this into two separate, standalone steps:
- **Migrations** — a versioned migration tool (Knex/Sequelize/Prisma/node-pg-migrate): incremental, reversible (`up`/`down`), applicable to a non-empty database without wiping data.
- **Seeds** — a separate idempotent command/service, decoupled from the schema and from compose, runnable in any environment (dev/CI) independently.

## 7. Automated tests

**Current state:** there are no automated tests at all — verification was done manually (curl, throwaway WS scripts). No test runner is configured.

**Drawback:** regressions are only caught by hand; the logic that's easiest to break (dedup by `clientId`, the rate-limit window, the unread cursor) has nothing guarding it. The brief also explicitly values "how you worked".

**What I'd do differently:** cover the code with tests. **Nest.js** (#4) provides ready-made infrastructure for this — Jest + `@nestjs/testing` (`TestingModule`, dependency mocking via DI) for **unit tests** of the services (dedup, rate-limit, unread) and `supertest` for e2e tests of the routes. Unit tests on the services are the minimum required level.
