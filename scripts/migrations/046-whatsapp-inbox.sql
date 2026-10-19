-- Platform-wide OpenWA gateway settings (singleton).
CREATE TABLE IF NOT EXISTS platform_openwa_settings (
  id VARCHAR(16) PRIMARY KEY DEFAULT 'default',
  base_url VARCHAR(512) NOT NULL DEFAULT '',
  api_key_encrypted TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_openwa_settings (id, base_url, enabled)
VALUES ('default', '', false)
ON CONFLICT (id) DO NOTHING;

-- Per-user WhatsApp connection within an organization.
CREATE TABLE IF NOT EXISTS user_whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  openwa_session_id UUID,
  openwa_session_name VARCHAR(50) NOT NULL,
  phone VARCHAR(32),
  push_name VARCHAR(100),
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  openwa_webhook_id UUID,
  webhook_secret_encrypted TEXT,
  last_backfill_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_whatsapp_connections_org
  ON user_whatsapp_connections (organization_id);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES user_whatsapp_connections(id) ON DELETE CASCADE,
  chat_id VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  is_group BOOLEAN NOT NULL DEFAULT false,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_connection_last
  ON whatsapp_conversations (connection_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  from_me BOOLEAN NOT NULL DEFAULT false,
  body TEXT,
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  media_metadata JSONB,
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_sent
  ON whatsapp_messages (conversation_id, sent_at DESC);
