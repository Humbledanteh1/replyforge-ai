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

/**
 * Executes a callback inside a transaction with RLS context installed using
 * SET LOCAL semantics. The settings disappear automatically at transaction end.
 */
export async function withTenantTransaction<T>(
  database: Database,
  rawContext: TenantContext,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const context = assertTenantContext(rawContext);
  const client = await database.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [context.workspaceId]);

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
