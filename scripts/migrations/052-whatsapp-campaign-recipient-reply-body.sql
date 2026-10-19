ALTER TABLE whatsapp_campaign_recipients
  ADD COLUMN IF NOT EXISTS reply_body TEXT NULL;
