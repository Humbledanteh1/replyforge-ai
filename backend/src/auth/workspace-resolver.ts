import type { AuthTokenClaims } from "./token.js";
import type { TenantContext, WorkspaceRole } from "./tenant-context.js";
import { withUserTransaction, type Database } from "../db/database.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceResolutionInput = {
  token: AuthTokenClaims;
  requestedWorkspaceId?: string;
};

export async function resolveTenantContext(
  database: Database,
  input: WorkspaceResolutionInput,
): Promise<TenantContext> {
  const workspaceId = input.requestedWorkspaceId ?? input.token.workspace_id;
  if (!workspaceId || !UUID_PATTERN.test(workspaceId)) {
    throw new Error("A valid workspace ID is required");
  }

  return withUserTransaction(database, input.token.sub, async (client) => {
    const result = await client.query<{ workspace_id: string; role: WorkspaceRole }>(
      `
        SELECT workspace_id, role
        FROM workspace_members
        WHERE workspace_id = $1
          AND user_id = current_setting('app.user_id')::uuid
        LIMIT 1
      `,
      [workspaceId],
    );

    const membership = result.rows[0];
    if (!membership) {
      throw new Error("The authenticated user is not a member of this workspace");
    }

    return {
      userId: input.token.sub,
      workspaceId: membership.workspace_id,
      role: membership.role,
    };
  });
}
