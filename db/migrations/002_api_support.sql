-- ReplyForge AI: API and authentication support
--
-- This migration preserves the RLS boundary while allowing the authenticated
-- user to resolve a requested workspace before app.workspace_id is installed.

DROP POLICY IF EXISTS workspace_members_isolation ON workspace_members;
CREATE POLICY workspace_members_isolation ON workspace_members
  USING (
    user_id = app.current_user_id()
    AND (
      app.current_workspace_id() IS NULL
      OR workspace_id = app.current_workspace_id()
    )
  )
  WITH CHECK (workspace_id = app.current_workspace_id());

ALTER TABLE reply_decisions
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'not_queued'
    CHECK (delivery_status IN ('not_queued', 'queued', 'sent', 'failed'));

ALTER TABLE reply_decisions
  ADD COLUMN IF NOT EXISTS delivery_error text;

ALTER TABLE reply_decisions
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE TABLE IF NOT EXISTS reply_decision_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  reply_decision_id uuid NOT NULL REFERENCES reply_decisions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES app_users(id),
  label text NOT NULL CHECK (label IN ('helpful', 'incorrect', 'incomplete', 'off_brand', 'unsafe')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_workspace_decision
  ON reply_decision_feedback(workspace_id, reply_decision_id, created_at DESC);

ALTER TABLE reply_decision_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_decision_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY reply_decision_feedback_isolation ON reply_decision_feedback
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (
    workspace_id = app.current_workspace_id()
    AND reviewer_id = app.current_user_id()
  );
