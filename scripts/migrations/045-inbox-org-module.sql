-- Enable inbox workspace module for existing organizations (on by default).
UPDATE organization_entitlements
SET enabled_modules = array_append(enabled_modules, 'inbox')
WHERE NOT ('inbox' = ANY(enabled_modules));

ALTER TABLE organization_entitlements
  ALTER COLUMN enabled_modules
  SET DEFAULT ARRAY['dashboard', 'email', 'inbox', 'crm', 'website', 'settings']::TEXT[];
