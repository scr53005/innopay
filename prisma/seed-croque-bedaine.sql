-- Check if croque-bedaine spoke exists
SELECT * FROM spoke WHERE id = 'croque-bedaine';

-- Insert croque-bedaine spoke if it doesn't exist
-- Run this if the above query returns no rows:

INSERT INTO spoke (
  id,
  name,
  type,
  domain_prod,
  port_dev,
  path,
  attribute_name_1,
  attribute_default_1,
  attribute_storage_key_1,
  image_1,
  image_2,
  image_3,
  has_delivery,
  active,
  ready,
  created_at,
  updated_at
) VALUES (
  'croque-bedaine',
  'Croque Bedaine',
  'restaurant',
  'croque-bedaine.innopay.lu',
  8080,
  '/',
  'table',
  '1',
  'croque_table',
  '/images/spokes/croque-bedaine-1.jpg',
  '/images/spokes/croque-bedaine-2.jpg',
  '/images/spokes/croque-bedaine-3.jpg',
  false,
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  port_dev = 8080,
  path = '/',
  ready = true,
  updated_at = NOW();

-- Verify the insert/update
SELECT * FROM spoke WHERE id = 'croque-bedaine';
