import { Pool, type PoolClient } from "pg";
import { assertTenantContext, type TenantContext } from "../auth/tenant-context.js";

export type Database = Pool;

export function createDatabase(connectionString = process.env.DATABASE_URL): Database {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

async function withTransaction<T>(
  database: Database,
  setup: (client: PoolClient) => Promise<void>,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();

  try {
    await client.query("BEGIN");
    await setup(client);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executes a callback with only the authenticated user installed. This is used
 * to resolve a workspace membership before the workspace setting is known.
 */
export function withUserTransaction<T>(
  database: Database,
  userId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!userId) throw new Error("userId is required");

  return withTransaction(
    database,
    (client) => client
      .query("SELECT set_config('app.user_id', $1, true)", [userId])
      .then(() => undefined),
    callback,
  );
}

/**
 * Executes a callback inside a transaction with RLS context installed using
 * transaction-local PostgreSQL settings.
 */
export function withTenantTransaction<T>(
  database: Database,
  rawContext: TenantContext,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const context = assertTenantContext(rawContext);

  return withTransaction(
    database,
    async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [context.workspaceId]);
    },
    callback,
  );
}
