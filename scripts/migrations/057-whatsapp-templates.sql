CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  type VARCHAR(16) NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_org
  ON whatsapp_templates (organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_created_by
  ON whatsapp_templates (created_by_user_id);

CREATE TABLE IF NOT EXISTS whatsapp_template_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES whatsapp_templates(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  body TEXT NOT NULL,
  delay_mode VARCHAR(16) NOT NULL DEFAULT 'relative',
  delay_days INT NOT NULL DEFAULT 0,
  scheduled_date DATE,
  UNIQUE (template_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_template_steps_template
  ON whatsapp_template_steps (template_id);
