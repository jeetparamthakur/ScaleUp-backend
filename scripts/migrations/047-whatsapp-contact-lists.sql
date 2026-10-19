-- WhatsApp marketing contact lists (org-wide or private per user).
-- Run manually in production when synchronize is off.

CREATE TABLE IF NOT EXISTS whatsapp_contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_count INT NOT NULL DEFAULT 0,
  field_schema JSONB NOT NULL DEFAULT '{}',
  visibility VARCHAR(16) NOT NULL DEFAULT 'org',
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_contact_lists_visibility_check
    CHECK (visibility IN ('org', 'private'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contact_lists_org_name
  ON whatsapp_contact_lists (organization_id, name)
  WHERE visibility = 'org';

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contact_lists_private_name
  ON whatsapp_contact_lists (organization_id, created_by_user_id, name)
  WHERE visibility = 'private';

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_lists_org
  ON whatsapp_contact_lists (organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_lists_owner
  ON whatsapp_contact_lists (created_by_user_id);

CREATE TABLE IF NOT EXISTS whatsapp_contact_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES whatsapp_contact_lists(id) ON DELETE CASCADE,
  phone VARCHAR(32) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  company VARCHAR(255),
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (list_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_list_members_list
  ON whatsapp_contact_list_members (list_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_list_members_org
  ON whatsapp_contact_list_members (organization_id);
