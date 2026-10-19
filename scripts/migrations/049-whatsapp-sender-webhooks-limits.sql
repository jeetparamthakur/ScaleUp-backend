ALTER TABLE whatsapp_sender_connections
  ADD COLUMN IF NOT EXISTS daily_send_limit INT,
  ADD COLUMN IF NOT EXISTS sends_today_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sends_today_date DATE,
  ADD COLUMN IF NOT EXISTS openwa_webhook_id UUID,
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted TEXT;
