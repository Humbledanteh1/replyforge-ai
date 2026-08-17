import type { TenantContext } from "../auth/tenant-context.js";
import { withTenantTransaction, type Database } from "../db/database.js";
import { WorkspaceRepository, type ReplyDecisionSummary } from "../repositories/workspace-repository.js";

export type CreateReplyDecisionInput = {
  conversationId: string;
  customerMessage: string;
};

/**
 * Model-agnostic first slice: generation is intentionally represented by a
 * deterministic review-required fallback until the model gateway is added.
 * The tenant boundary and persistence contract are already exercised here.
 */
export async function createReplyDecisionDraft(
  database: Database,
  context: TenantContext,
  input: CreateReplyDecisionInput,
): Promise<ReplyDecisionSummary> {
  return withTenantTransaction(database, context, async (client) => {
    const repository = new WorkspaceRepository(client);
    const deployment = await repository.getActiveDeployment();

    if (!deployment) {
      throw new Error("No active deployment exists for this workspace");
    }

    const sources = await repository.listApprovedKnowledgeSources();
    const proposedReply =
      "Thanks for reaching out. A member of our team will review your message and follow up shortly.";
    const evidenceIds = sources.slice(0, 3).map((source) => source.id);

    const decision = await repository.createReplyDecision({
      conversationId: input.conversationId,
      customerMessage: input.customerMessage,
      proposedReply,
      evidenceIds,
      promptVersion: "fallback-v1",
      modelName: "replyforge-fallback",
    });

    await repository.appendAuditEvent({
      eventType: "reply_decision.draft_created",
      entityType: "reply_decision",
      entityId: decision.id,
      payload: {
        deploymentId: deployment.deploymentId,
        evidenceIds,
        mode: deployment.automationMode,
      },
    });

    return decision;
  });
}
