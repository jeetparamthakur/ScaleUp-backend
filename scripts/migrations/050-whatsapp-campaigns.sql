CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  message_body TEXT NOT NULL,
  contact_list_id UUID NOT NULL REFERENCES whatsapp_contact_lists(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  launch_at TIMESTAMPTZ,
  timezone VARCHAR(64),
  transport VARCHAR(16) NOT NULL DEFAULT 'openwa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_org_status
  ON whatsapp_campaigns (organization_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  sender_connection_id UUID NOT NULL REFERENCES whatsapp_sender_connections(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, sender_connection_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_senders_campaign
  ON whatsapp_campaign_senders (campaign_id);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  list_member_id UUID REFERENCES whatsapp_contact_list_members(id) ON DELETE SET NULL,
  phone_e164 VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  sender_connection_id UUID REFERENCES whatsapp_sender_connections(id) ON DELETE SET NULL,
  replied_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_campaign_status
  ON whatsapp_campaign_recipients (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_reply_lookup
  ON whatsapp_campaign_recipients (phone_e164, status, sent_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES whatsapp_campaign_recipients(id) ON DELETE CASCADE,
  external_message_id VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES whatsapp_campaign_recipients(id) ON DELETE SET NULL,
  event_type VARCHAR(32) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_events_campaign
  ON whatsapp_campaign_events (campaign_id, created_at DESC);
