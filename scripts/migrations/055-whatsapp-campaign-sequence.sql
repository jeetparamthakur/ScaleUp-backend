CREATE TABLE IF NOT EXISTS whatsapp_campaign_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  body TEXT NOT NULL,
  delay_mode VARCHAR(16) NOT NULL DEFAULT 'relative',
  delay_days INT NOT NULL DEFAULT 0,
  scheduled_date DATE,
  UNIQUE (campaign_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_sequence_steps_campaign
  ON whatsapp_campaign_sequence_steps (campaign_id);

ALTER TABLE whatsapp_campaign_recipients
  ADD COLUMN IF NOT EXISTS current_step_order INT NOT NULL DEFAULT 1;

ALTER TABLE whatsapp_campaign_recipients
  ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMPTZ;

ALTER TABLE whatsapp_campaign_messages
  ADD COLUMN IF NOT EXISTS step_order INT NOT NULL DEFAULT 1;

INSERT INTO whatsapp_campaign_sequence_steps (campaign_id, step_order, body, delay_mode, delay_days)
SELECT c.id, 1, c.message_body, 'relative', 0
FROM whatsapp_campaigns c
WHERE NOT EXISTS (
  SELECT 1
  FROM whatsapp_campaign_sequence_steps s
  WHERE s.campaign_id = c.id
);
