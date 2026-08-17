import type { TenantContext } from "../auth/tenant-context.js";
import { withTenantTransaction, type Database } from "../db/database.js";
import { WorkspaceRepository } from "../repositories/workspace-repository.js";

export type CreateReplyDecisionInput = {
  conversationId: string;
  customerMessage: string;
};

export type ReplyDecisionDraft = {
  workspaceId: string;
  conversationId: string;
  state: "needs_review";
  customerMessage: string;
  proposedReply: string;
  evidenceIds: string[];
};

/**
 * This is intentionally model-agnostic. Retrieval and generation can be
 * plugged in after tenant-scoped data has been assembled. The important
 * invariant is that all workspace reads and writes happen in one RLS-aware
 * transaction.
 */
export async function createReplyDecisionDraft(
  database: Database,
  context: TenantContext,
  input: CreateReplyDecisionInput,
): Promise<ReplyDecisionDraft> {
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
    await repository.appendAuditEvent({
      eventType: "reply_decision.draft_created",
      entityType: "conversation",
      entityId: input.conversationId,
      payload: {
        deploymentId: deployment.deploymentId,
        evidenceIds,
        mode: deployment.automationMode,
      },
    });

    return {
      workspaceId: context.workspaceId,
      conversationId: input.conversationId,
      state: "needs_review",
      customerMessage: input.customerMessage,
      proposedReply,
      evidenceIds,
    };
  });
}
