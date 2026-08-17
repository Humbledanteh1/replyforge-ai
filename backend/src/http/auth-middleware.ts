import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Database } from "../db/database.js";
import { verifyBearerToken, type TokenVerifierOptions } from "../auth/token.js";
import { resolveTenantContext } from "../auth/workspace-resolver.js";
import type { TenantContext, WorkspaceRole } from "../auth/tenant-context.js";

declare module "fastify" {
  interface FastifyRequest {
    tenant?: TenantContext;
  }
}

export type AuthMiddlewareOptions = TokenVerifierOptions & {
  workspaceHeader?: string;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createAuthMiddleware(
  database: Database,
  options: AuthMiddlewareOptions,
): preHandlerHookHandler {
  const workspaceHeader = (options.workspaceHeader ?? "x-workspace-id").toLowerCase();

  return async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
    let token;
    try {
      token = verifyBearerToken(request.headers.authorization, options);
    } catch (error) {
      return reply.code(401).send({
        error: "unauthorized",
        message: error instanceof Error ? error.message : "Bearer authentication failed",
      });
    }

    try {
      const requestedWorkspaceId = headerValue(request.headers[workspaceHeader]);
      request.tenant = await resolveTenantContext(database, {
        token,
        ...(requestedWorkspaceId ? { requestedWorkspaceId } : {}),
      });
    } catch (error) {
      return reply.code(403).send({
        error: "forbidden",
        message: error instanceof Error ? error.message : "Workspace access denied",
      });
    }
  };
}

export function requireRoles(...allowedRoles: WorkspaceRole[]): preHandlerHookHandler {
  return async function requireWorkspaceRole(request: FastifyRequest, reply: FastifyReply) {
    const role = request.tenant?.role;
    if (!role) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Tenant context is missing",
      });
    }

    if (!allowedRoles.includes(role)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "The workspace role does not permit this operation",
      });
    }
  };
}

export function tenantFrom(request: FastifyRequest): TenantContext {
  if (!request.tenant) {
    throw new Error("Tenant context is missing");
  }
  return request.tenant;
}
