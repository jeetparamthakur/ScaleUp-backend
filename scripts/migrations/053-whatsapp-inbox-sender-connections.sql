-- Inbox conversations can belong to a WhatsApp module sender connection.
ALTER TABLE whatsapp_sender_connections
  ADD COLUMN IF NOT EXISTS last_backfill_at TIMESTAMPTZ;

ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS sender_connection_id UUID
    REFERENCES whatsapp_sender_connections(id) ON DELETE CASCADE;

ALTER TABLE whatsapp_conversations
  ALTER COLUMN connection_id DROP NOT NULL;

ALTER TABLE whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_connection_id_chat_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_sender_chat
  ON whatsapp_conversations (sender_connection_id, chat_id)
  WHERE sender_connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_user_chat
  ON whatsapp_conversations (connection_id, chat_id)
  WHERE connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_sender_last
  ON whatsapp_conversations (sender_connection_id, last_message_at DESC NULLS LAST)
  WHERE sender_connection_id IS NOT NULL;
