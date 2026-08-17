import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "../db/database.js";
import { withTenantTransaction } from "../db/database.js";
import { createReplyDecisionDraft } from "./reply-service.js";
import { createAuthMiddleware, requireRoles, tenantFrom } from "./auth-middleware.js";
import { WorkspaceRepository } from "../repositories/workspace-repository.js";

export type ApiRouteOptions = {
  database: Database;
  auth: Parameters<typeof createAuthMiddleware>[1];
};

type KnowledgeSourceType = "faq" | "document" | "url" | "structured";
type FeedbackLabel = "helpful" | "incorrect" | "incomplete" | "off_brand" | "unsafe";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(body: unknown, key: string, maxLength: number): string {
  if (!isRecord(body) || typeof body[key] !== "string") {
    throw new Error(`${key} is required`);
  }
  const value = body[key].trim();
  if (!value || value.length > maxLength) {
    throw new Error(`${key} must be between 1 and ${maxLength} characters`);
  }
  return value;
}

function optionalRecord(body: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(body) || body[key] === undefined) return undefined;
  if (!isRecord(body[key])) throw new Error(`${key} must be an object`);
  return body[key];
}

function oneOf<T extends string>(value: string, allowed: readonly T[], key: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${key} is invalid`);
  return value as T;
}

function decisionId(request: FastifyRequest<{ Params: { decisionId: string } }>): string {
  const value = request.params.decisionId;
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("decisionId is invalid");
  return value;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  options: ApiRouteOptions,
): Promise<void> {
  const authenticate = createAuthMiddleware(options.database, options.auth);

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/v1/deployments/active", { preHandler: authenticate }, async (request) => {
    const context = tenantFrom(request);
    return withTenantTransaction(options.database, context, async (client) => {
      const deployment = await new WorkspaceRepository(client).getActiveDeployment();
      if (!deployment) return { deployment: null };
      return { deployment };
    });
  });

  app.get("/v1/knowledge-sources", { preHandler: authenticate }, async (request) => {
    const context = tenantFrom(request);
    return withTenantTransaction(options.database, context, async (client) => ({
      sources: await new WorkspaceRepository(client).listApprovedKnowledgeSources(),
    }));
  });

  app.post<{ Body: unknown }>(
    "/v1/knowledge-sources",
    { preHandler: [authenticate, requireRoles("owner", "admin", "operator")] },
    async (request, reply) => {
      const sourceType = oneOf(
        requiredString(request.body, "sourceType", 20),
        ["faq", "document", "url", "structured"] as const,
        "sourceType",
      );
      const title = requiredString(request.body, "title", 200);
      const content = requiredString(request.body, "content", 100_000);
      const metadata = optionalRecord(request.body, "metadata");
      const context = tenantFrom(request);

      const id = await withTenantTransaction(options.database, context, (client) =>
        new WorkspaceRepository(client).createKnowledgeSource({
          sourceType,
          title,
          content,
          ...(metadata ? { metadata } : {}),
        }),
      );

      return reply.code(201).send({ id, approvalStatus: "pending" });
    },
  );

  app.post<{ Body: unknown }>(
    "/v1/reply-decisions",
    { preHandler: authenticate },
    async (request, reply) => {
      const conversationId = requiredString(request.body, "conversationId", 100);
      const customerMessage = requiredString(request.body, "customerMessage", 20_000);
      const context = tenantFrom(request);
      const decision = await createReplyDecisionDraft(options.database, context, {
        conversationId,
        customerMessage,
      });
      return reply.code(201).send({ decision });
    },
  );

  app.post<{ Params: { decisionId: string }; Body: unknown }>(
    "/v1/reply-decisions/:decisionId/approve",
    { preHandler: [authenticate, requireRoles("owner", "admin", "operator", "reviewer")] },
    async (request, reply) => {
      const context = tenantFrom(request);
      const decision = await withTenantTransaction(options.database, context, async (client) => {
        const repository = new WorkspaceRepository(client);
        const approved = await repository.approveReplyDecision(decisionId(request));
        if (approved) {
          await repository.appendAuditEvent({
            eventType: "reply_decision.approved",
            entityType: "reply_decision",
            entityId: approved.id,
          });
        }
        return approved;
      });

      if (!decision) return reply.code(404).send({ error: "not_found", message: "Decision not found or already approved" });
      return { decision };
    },
  );

  app.post<{ Params: { decisionId: string }; Body: unknown }>(
    "/v1/reply-decisions/:decisionId/send",
    { preHandler: [authenticate, requireRoles("owner", "admin", "operator")] },
    async (request, reply) => {
      const context = tenantFrom(request);
      const decision = await withTenantTransaction(options.database, context, async (client) => {
        const repository = new WorkspaceRepository(client);
        const queued = await repository.queueReplyForDelivery(decisionId(request));
        if (queued) {
          await repository.appendAuditEvent({
            eventType: "reply_decision.delivery_queued",
            entityType: "reply_decision",
            entityId: queued.id,
          });
        }
        return queued;
      });

      if (!decision) {
        return reply.code(409).send({
          error: "not_sendable",
          message: "Decision is not approved, already queued, or not allowed by deployment automation mode",
        });
      }
      return { decision, delivery: { status: "queued" } };
    },
  );

  app.post<{ Params: { decisionId: string }; Body: unknown }>(
    "/v1/reply-decisions/:decisionId/feedback",
    { preHandler: [authenticate, requireRoles("owner", "admin", "operator", "reviewer")] },
    async (request, reply) => {
      const label = oneOf(
        requiredString(request.body, "label", 20),
        ["helpful", "incorrect", "incomplete", "off_brand", "unsafe"] as const,
        "label",
      ) as FeedbackLabel;
      const note = isRecord(request.body) && typeof request.body.note === "string"
        ? request.body.note.trim().slice(0, 2_000)
        : undefined;
      const context = tenantFrom(request);
      const feedbackId = await withTenantTransaction(options.database, context, async (client) => {
        const repository = new WorkspaceRepository(client);
        const id = await repository.addFeedback({
          decisionId: decisionId(request),
          label,
          ...(note ? { note } : {}),
        });
        await repository.appendAuditEvent({
          eventType: "reply_decision.feedback_added",
          entityType: "reply_decision",
          entityId: decisionId(request),
          payload: { label },
        });
        return id;
      });

      return reply.code(201).send({ feedbackId });
    },
  );
}
