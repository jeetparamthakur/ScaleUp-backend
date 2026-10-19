-- Per-user WhatsApp sender connections for the WhatsApp module (campaigns / broadcasts).
-- Multiple rows per organization_id + user_id; not tied to inbox conversations.
CREATE TABLE IF NOT EXISTS whatsapp_sender_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(120),
  openwa_session_id UUID,
  openwa_session_name VARCHAR(50) NOT NULL,
  phone VARCHAR(32),
  push_name VARCHAR(100),
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sender_connections_org_user
  ON whatsapp_sender_connections (organization_id, user_id);
