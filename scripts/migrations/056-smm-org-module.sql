-- Enable SMM workspace module for existing organizations (on by default).
UPDATE organization_entitlements
SET enabled_modules = array_append(enabled_modules, 'smm')
WHERE NOT ('smm' = ANY(enabled_modules));
