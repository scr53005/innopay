-- Idempotent fix for the millewee spoke row.
--
-- Why: seed_initial_spokes.sql created 'millewee' as a "coming soon" stub
-- with indies' URL values. After millewee launched (Apr 2026), Flow 7 was
-- redirecting customers to indies.innopay.lu:3001/menu instead of millewee.
-- The hub at innopay/app/user/page.tsx reads spoke.domain_prod / port_dev /
-- path from the DB and ignores the return_url query param the spoke sends.
--
-- Run in both DEV and PROD innopay databases:
--   psql "$POSTGRES_URL" -f scripts/update-millewee-spoke.sql

UPDATE spoke
SET
  domain_prod             = 'millewee.innopay.lu',
  port_dev                = 3002,
  path                    = '/',
  attribute_storage_key_1 = 'millewee_table',
  ready                   = true,
  updated_at              = NOW()
WHERE id = 'millewee';

SELECT id, domain_prod, port_dev, path, attribute_storage_key_1, ready
FROM spoke
WHERE id = 'millewee';
