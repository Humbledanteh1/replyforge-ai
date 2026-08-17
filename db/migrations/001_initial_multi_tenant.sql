-- ReplyForge AI: initial multi-tenant foundation
--
-- The application must set both session variables inside every transaction:
--   SELECT set_config('app.user_id', '<authenticated-user-uuid>', true);
--   SELECT set_config('app.workspace_id', '<resolved-workspace-uuid>', true);
--
-- RLS is a defense-in-depth boundary. The API must still authorize access before
-- opening a tenant-scoped transaction.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid;
$$;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject text NOT NULL UNIQUE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'reviewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES app_users(id),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES app_users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS agent_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_version_id uuid NOT NULL REFERENCES agent_template_versions(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  automation_mode text NOT NULL DEFAULT 'draft_for_approval'
    CHECK (automation_mode IN ('draft_for_approval', 'human_approval', 'automatic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, template_version_id)
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('faq', 'document', 'url', 'structured')),
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'archived')),
  source_version integer NOT NULL DEFAULT 1 CHECK (source_version > 0),
  effective_from timestamptz,
  effective_until timestamptz,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL REFERENCES agent_deployments(id),
  channel text NOT NULL,
  external_conversation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel, external_conversation_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'agent', 'human_operator', 'system')),
  body text NOT NULL,
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider_message_id)
);

CREATE TABLE IF NOT EXISTS reply_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('ready', 'needs_review', 'clarify', 'escalate', 'refuse')),
  customer_message text NOT NULL,
  proposed_reply text NOT NULL,
  intent text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_information jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalation_reason text,
  requested_action text NOT NULL DEFAULT 'none',
  automation_recommendation text NOT NULL DEFAULT 'do_not_send'
    CHECK (automation_recommendation IN ('draft', 'human_approval', 'send', 'do_not_send')),
  prompt_version text NOT NULL,
  model_name text NOT NULL,
  policy_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid REFERENCES app_users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_deployments_workspace ON agent_deployments(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_workspace_status
  ON knowledge_sources(workspace_id, approval_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_updated
  ON conversations(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(workspace_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reply_decisions_workspace_created
  ON reply_decisions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_created
  ON audit_events(workspace_id, created_at DESC);

-- Tenant isolation policies. Every workspace-owned row must match the workspace
-- resolved by the server and installed in the current transaction.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_isolation ON workspaces
  USING (
    id = app.current_workspace_id()
    AND EXISTS (
      SELECT 1
      FROM workspace_members member
      WHERE member.workspace_id = workspaces.id
        AND member.user_id = app.current_user_id()
    )
  )
  WITH CHECK (id = app.current_workspace_id());

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_members_isolation ON workspace_members
  USING (
    workspace_id = app.current_workspace_id()
    AND user_id = app.current_user_id()
  )
  WITH CHECK (workspace_id = app.current_workspace_id());

ALTER TABLE agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_templates_isolation ON agent_templates
  USING (
    creator_id = app.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM agent_template_versions version
      JOIN agent_deployments deployment
        ON deployment.template_version_id = version.id
      WHERE version.template_id = agent_templates.id
        AND deployment.workspace_id = app.current_workspace_id()
    )
  );

ALTER TABLE agent_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_template_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_template_versions_isolation ON agent_template_versions
  USING (
    created_by = app.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM agent_deployments deployment
      WHERE deployment.template_version_id = agent_template_versions.id
        AND deployment.workspace_id = app.current_workspace_id()
    )
  );

ALTER TABLE agent_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_deployments FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_deployments_isolation ON agent_deployments
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_sources_isolation ON knowledge_sources
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY conversations_isolation ON conversations
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY messages_isolation ON messages
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());

ALTER TABLE reply_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY reply_decisions_isolation ON reply_decisions
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_isolation ON audit_events
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());

-- This view is intentionally workspace-scoped. It is useful to the orchestration
-- service when constructing model context without exposing unrelated deployments.
CREATE OR REPLACE VIEW workspace_deployment_context AS
SELECT
  deployment.id AS deployment_id,
  deployment.workspace_id,
  deployment.status,
  deployment.automation_mode,
  template.id AS template_id,
  template.name AS template_name,
  template.description AS template_description,
  version.id AS template_version_id,
  version.version AS template_version,
  version.config AS template_config
FROM agent_deployments deployment
JOIN agent_template_versions version ON version.id = deployment.template_version_id
JOIN agent_templates template ON template.id = version.template_id;
