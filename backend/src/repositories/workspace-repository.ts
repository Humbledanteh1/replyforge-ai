import type { PoolClient } from "pg";

export type DeploymentSummary = {
  deploymentId: string;
  workspaceId: string;
  status: string;
  automationMode: string;
  templateName: string;
  templateVersion: number;
  templateConfig: Record<string, unknown>;
};

export type KnowledgeSourceSummary = {
  id: string;
  title: string;
  sourceType: string;
  content: string;
  sourceVersion: number;
};

export type ReplyDecisionSummary = {
  id: string;
  workspaceId: string;
  conversationId: string;
  state: string;
  proposedReply: string;
  automationRecommendation: string;
  deliveryStatus: string;
};

/**
 * Repository methods receive a transaction client whose RLS settings were
 * installed by withTenantTransaction(). Do not expose a pool directly here.
 */
export class WorkspaceRepository {
  public constructor(private readonly client: PoolClient) {}

  public async getActiveDeployment(): Promise<DeploymentSummary | null> {
    const result = await this.client.query<{
      deployment_id: string;
      workspace_id: string;
      status: string;
      automation_mode: string;
      template_name: string;
      template_version: number;
      template_config: Record<string, unknown>;
    }>(
      `
        SELECT
          deployment_id,
          workspace_id,
          status,
          automation_mode,
          template_name,
          template_version,
          template_config
        FROM workspace_deployment_context
        WHERE status = 'active'
        LIMIT 1
      `,
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      deploymentId: row.deployment_id,
      workspaceId: row.workspace_id,
      status: row.status,
      automationMode: row.automation_mode,
      templateName: row.template_name,
      templateVersion: row.template_version,
      templateConfig: row.template_config,
    };
  }

  public async createKnowledgeSource(input: {
    sourceType: "faq" | "document" | "url" | "structured";
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const result = await this.client.query<{ id: string }>(
      `
        INSERT INTO knowledge_sources (
          workspace_id, source_type, title, content, metadata,
          approval_status, created_by
        )
        VALUES (
          current_setting('app.workspace_id')::uuid,
          $1, $2, $3, $4::jsonb,
          'pending', current_setting('app.user_id')::uuid
        )
        RETURNING id
      `,
      [
        input.sourceType,
        input.title,
        input.content,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Knowledge source could not be created");
    return row.id;
  }

  public async listApprovedKnowledgeSources(limit = 20): Promise<KnowledgeSourceSummary[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const result = await this.client.query<{
      id: string;
      title: string;
      source_type: string;
      content: string;
      source_version: number;
    }>(
      `
        SELECT id, title, source_type, content, source_version
        FROM knowledge_sources
        WHERE approval_status = 'approved'
          AND (effective_from IS NULL OR effective_from <= now())
          AND (effective_until IS NULL OR effective_until > now())
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      [safeLimit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      content: row.content,
      sourceVersion: row.source_version,
    }));
  }

  public async createReplyDecision(input: {
    conversationId: string;
    customerMessage: string;
    proposedReply: string;
    evidenceIds: string[];
    promptVersion: string;
    modelName: string;
  }): Promise<ReplyDecisionSummary> {
    const result = await this.client.query<{
      id: string;
      workspace_id: string;
      conversation_id: string;
      state: string;
      proposed_reply: string;
      automation_recommendation: string;
      delivery_status: string;
    }>(
      `
        INSERT INTO reply_decisions (
          workspace_id,
          conversation_id,
          state,
          customer_message,
          proposed_reply,
          evidence_ids,
          prompt_version,
          model_name,
          automation_recommendation
        )
        VALUES (
          current_setting('app.workspace_id')::uuid,
          $1,
          'needs_review',
          $2,
          $3,
          $4::jsonb,
          $5,
          $6,
          'human_approval'
        )
        RETURNING id, workspace_id, conversation_id, state,
          proposed_reply, automation_recommendation, delivery_status
      `,
      [
        input.conversationId,
        input.customerMessage,
        input.proposedReply,
        JSON.stringify(input.evidenceIds),
        input.promptVersion,
        input.modelName,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Reply decision could not be created");
    return this.mapDecision(row);
  }

  public async approveReplyDecision(decisionId: string): Promise<ReplyDecisionSummary | null> {
    const result = await this.client.query<{
      id: string;
      workspace_id: string;
      conversation_id: string;
      state: string;
      proposed_reply: string;
      automation_recommendation: string;
      delivery_status: string;
    }>(
      `
        UPDATE reply_decisions
        SET state = 'ready',
            approved_by = current_setting('app.user_id')::uuid,
            approved_at = now(),
            automation_recommendation = 'send'
        WHERE id = $1
          AND state = 'needs_review'
        RETURNING id, workspace_id, conversation_id, state,
          proposed_reply, automation_recommendation, delivery_status
      `,
      [decisionId],
    );

    const row = result.rows[0];
    return row ? this.mapDecision(row) : null;
  }

  public async queueReplyForDelivery(decisionId: string): Promise<ReplyDecisionSummary | null> {
    const result = await this.client.query<{
      id: string;
      workspace_id: string;
      conversation_id: string;
      state: string;
      proposed_reply: string;
      automation_recommendation: string;
      delivery_status: string;
    }>(
      `
        UPDATE reply_decisions decision
        SET delivery_status = 'queued'
        FROM conversations conversation
        JOIN agent_deployments deployment
          ON deployment.id = conversation.deployment_id
        WHERE decision.id = $1
          AND decision.conversation_id = conversation.id
          AND decision.workspace_id = current_setting('app.workspace_id')::uuid
          AND decision.state IN ('ready', 'clarify')
          AND decision.delivery_status = 'not_queued'
          AND (
            deployment.automation_mode = 'automatic'
            OR decision.approved_at IS NOT NULL
          )
        RETURNING decision.id, decision.workspace_id, decision.conversation_id,
          decision.state, decision.proposed_reply,
          decision.automation_recommendation, decision.delivery_status
      `,
      [decisionId],
    );

    const row = result.rows[0];
    return row ? this.mapDecision(row) : null;
  }

  public async addFeedback(input: {
    decisionId: string;
    label: "helpful" | "incorrect" | "incomplete" | "off_brand" | "unsafe";
    note?: string;
  }): Promise<string> {
    const result = await this.client.query<{ id: string }>(
      `
        INSERT INTO reply_decision_feedback (
          workspace_id, reply_decision_id, reviewer_id, label, note
        )
        VALUES (
          current_setting('app.workspace_id')::uuid,
          $1,
          current_setting('app.user_id')::uuid,
          $2,
          $3
        )
        RETURNING id
      `,
      [input.decisionId, input.label, input.note ?? null],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Feedback could not be recorded");
    return row.id;
  }

  public async appendAuditEvent(input: {
    eventType: string;
    entityType: string;
    entityId?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.client.query(
      `
        INSERT INTO audit_events (workspace_id, actor_user_id, event_type, entity_type, entity_id, payload)
        VALUES (current_setting('app.workspace_id')::uuid,
                NULLIF(current_setting('app.user_id', true), '')::uuid,
                $1, $2, $3, $4::jsonb)
      `,
      [
        input.eventType,
        input.entityType,
        input.entityId ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
  }

  private mapDecision(row: {
    id: string;
    workspace_id: string;
    conversation_id: string;
    state: string;
    proposed_reply: string;
    automation_recommendation: string;
    delivery_status: string;
  }): ReplyDecisionSummary {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      conversationId: row.conversation_id,
      state: row.state,
      proposedReply: row.proposed_reply,
      automationRecommendation: row.automation_recommendation,
      deliveryStatus: row.delivery_status,
    };
  }
}
