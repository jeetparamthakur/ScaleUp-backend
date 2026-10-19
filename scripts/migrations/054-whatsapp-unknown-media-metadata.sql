-- OpenWA webhooks sometimes persist message_type = 'unknown' with null media_metadata,
-- which caused the inbox media API to skip OpenWA fetch. Seed minimal metadata so
-- on-demand download can run (bytes still come from OpenWA; mimetype is refined after fetch).
UPDATE whatsapp_messages
SET media_metadata = COALESCE(
  media_metadata,
  '{"mimetype":"application/octet-stream"}'::jsonb
)
WHERE lower(message_type) = 'unknown'
  AND media_metadata IS NULL;
