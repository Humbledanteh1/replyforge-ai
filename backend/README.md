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
