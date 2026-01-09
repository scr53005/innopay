-- Seed data for initial 4 spokes
-- Run this after the migration: psql -d your_database -f seed_initial_spokes.sql

-- READY SPOKE 1: Indies (Independent Café)
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
  has_delivery,
  active,
  ready,
  created_at,
  updated_at
) VALUES (
  'indies',
  'Independent Café',
  'restaurant',
  'indies.innopay.lu',
  3001,
  '/menu',
  'table',
  '0',
  'cartTable',
  '/images/businesses/independent-cafe.jpg',
  false,
  true,
  true,
  NOW(),
  NOW()
);

-- READY SPOKE 2: Croque-Bedaine (Le Croque Bedaine)
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
  has_delivery,
  active,
  ready,
  created_at,
  updated_at
) VALUES (
  'croque-bedaine',
  'Le Croque Bedaine',
  'restaurant',
  'croque-bedaine.innopay.lu',
  8080,
  '/',
  'table',
  '0',
  'innopay_table',
  '/images/businesses/croque-bedaine.jpg',
  false,
  true,
  true,
  NOW(),
  NOW()
);

-- STUB 1: Al'21 Restaurant (Not Ready - Coming Soon)
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
  has_delivery,
  active,
  ready,
  created_at,
  updated_at
) VALUES (
  'al21',
  'Al''21 Restaurant',
  'restaurant',
  'indies.innopay.lu',
  3001,
  '/menu',
  'table',
  '0',
  'cartTable',
  '/images/businesses/al21.jpg',
  false,
  true,
  false,
  NOW(),
  NOW()
);

-- STUB 2: Brasserie Millewee (Not Ready - Coming Soon)
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
  has_delivery,
  active,
  ready,
  created_at,
  updated_at
) VALUES (
  'millewee',
  'Brasserie Millewee',
  'restaurant',
  'indies.innopay.lu',
  3001,
  '/menu',
  'table',
  '0',
  'cartTable',
  '/images/businesses/millewee.PNG',
  false,
  true,
  false,
  NOW(),
  NOW()
);

-- Verify the insert
SELECT id, name, type, ready, domain_prod, port_dev, path FROM spoke ORDER BY ready DESC, id;
