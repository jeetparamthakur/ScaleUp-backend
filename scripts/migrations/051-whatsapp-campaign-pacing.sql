ALTER TABLE whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS daily_batch_size INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS send_interval_seconds INT,
  ADD COLUMN IF NOT EXISTS distribute_recipients_equally BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sends_today_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sends_today_date DATE,
  ADD COLUMN IF NOT EXISTS next_send_eligible_at TIMESTAMPTZ;
