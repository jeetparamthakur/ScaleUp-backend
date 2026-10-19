ALTER TABLE whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS sending_window_start_minutes INT,
  ADD COLUMN IF NOT EXISTS sending_window_end_minutes INT;
