# ReplyForge backend foundation

This directory contains the first tenant-isolated backend skeleton. It is intentionally small and framework-agnostic so the repository can adopt Fastify, Express, Hono, or another HTTP framework without changing the core isolation contract.

## Isolation contract

Every authenticated request must resolve a `TenantContext` on the server:

```ts
{
  userId: "authenticated-user-id",
  workspaceId: "resolved-workspace-id",
  role: "owner"
}
```

The `workspaceId` must come from a verified membership or deployment relationship. It must not be trusted from an arbitrary request body, query parameter, or customer message.

Application code must call `withTenantTransaction(database, context, callback)`. That helper starts a transaction and installs `app.user_id` and `app.workspace_id` using transaction-local PostgreSQL settings. The migration enables and forces row-level security on workspace-owned tables, so queries are filtered by the active context even when a repository method forgets an explicit workspace predicate.

## Files

| File | Purpose |
| --- | --- |
| `src/auth/tenant-context.ts` | Authenticated user, workspace, and role types |
| `src/db/database.ts` | Pool creation and RLS-aware transaction wrapper |
| `src/repositories/workspace-repository.ts` | Parameterized workspace-scoped reads and audit writes |
| `src/http/reply-service.ts` | Model-agnostic reply-decision service example |
| `../db/migrations/001_initial_multi_tenant.sql` | Tables, indexes, helper functions, and RLS policies |

## Migration and runtime expectations

Run the SQL migration with a privileged migration role. The runtime role should not own the tables and should not have a bypass-RLS attribute. Grant it only the privileges required by the application.

For production, place the database pool behind a request-scoped transaction boundary, use a secret manager for `DATABASE_URL`, and configure connection limits according to the deployment environment. Do not log raw credentials, full customer messages, or unrestricted model context.

## Next implementation steps

The next backend slice should add authenticated workspace resolution, conversation/message repositories, a real model gateway, policy validation, and integration tests that attempt cross-workspace reads and writes. Those tests should prove that a request with workspace A’s context cannot see or modify workspace B’s records.

## HTTP API

The Fastify server is created by `src/server.ts`. It exposes an unauthenticated `GET /health` endpoint and authenticated routes under `/v1`.

| Endpoint | Required role | Purpose |
| --- | --- | --- |
| `GET /v1/deployments/active` | Any member | Resolve the active deployment visible to the current workspace |
| `GET /v1/knowledge-sources` | Any member | List approved, currently effective sources |
| `POST /v1/knowledge-sources` | Owner, admin, operator | Add a pending source for later approval and ingestion |
| `POST /v1/reply-decisions` | Any member | Create a persisted draft decision for a conversation |
| `POST /v1/reply-decisions/:decisionId/approve` | Owner, admin, operator, reviewer | Approve a draft for delivery |
| `POST /v1/reply-decisions/:decisionId/send` | Owner, admin, operator | Queue a ready or authorized automatic decision for delivery |
| `POST /v1/reply-decisions/:decisionId/feedback` | Owner, admin, operator, reviewer | Record quality feedback against a decision |

Every protected request must include `Authorization: Bearer <JWT>`. The token must use `HS256`, contain a `sub` claim, and may include `exp`, `iss`, `aud`, and `workspace_id`. A client can select a workspace with `X-Workspace-Id`, but the server verifies that the authenticated subject is a member before attaching the tenant context. The workspace ID is never accepted from a request body as an authorization source.

The server requires `AUTH_JWT_SECRET` with at least 32 characters. Optional `AUTH_JWT_ISSUER` and `AUTH_JWT_AUDIENCE` values enforce issuer and audience checks. `DATABASE_URL`, `PORT`, and `HOST` configure the database and listener.

## Local development

Install dependencies and run the checks from this directory:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

The current reply service intentionally creates a review-required fallback draft until a model gateway is connected. The `/send` endpoint queues delivery in the database; it does not call an external channel provider yet. A future channel worker should claim queued decisions, send them through a verified adapter, and update `delivery_status` idempotently.

## Authentication boundary

The included JWT verifier is a minimal HS256 foundation for local development and a controlled first deployment. In production, it should be replaced or extended with the project’s identity provider and key rotation strategy. The rest of the request contract should remain the same: authenticate the subject, resolve a membership, install transaction-local RLS settings, then access repositories.
