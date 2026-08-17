export type WorkspaceRole = "owner" | "admin" | "operator" | "reviewer";

export type TenantContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

/**
 * The authentication layer should create this context only after resolving the
 * user and workspace relationship server-side. Never accept workspaceId from
 * an untrusted request body as the source of tenant authorization.
 */
export function assertTenantContext(context: TenantContext): TenantContext {
  if (!context.userId || !context.workspaceId || !context.role) {
    throw new Error("A complete tenant context is required");
  }

  return context;
}
