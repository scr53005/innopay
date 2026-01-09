# Spoke Management SQL Reference

## Initial Setup

After running the migration, seed the initial 4 spokes:

```bash
# Connect to your database and run:
psql -d your_database -f prisma/migrations/seed_initial_spokes.sql
```

Or via Prisma:
```bash
npx prisma db execute --file prisma/migrations/seed_initial_spokes.sql --schema prisma/schema.prisma
```

## Common SQL Queries

### View All Spokes

```sql
SELECT
  id,
  name,
  type,
  ready,
  active,
  domain_prod,
  port_dev,
  path,
  attribute_name_1,
  attribute_storage_key_1
FROM spoke
ORDER BY ready DESC, id;
```

### View Active Spokes Only (What Hub Shows)

```sql
SELECT id, name, ready
FROM spoke
WHERE active = true
ORDER BY ready DESC, name;
```

### Add a New Spoke

```sql
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
  'new-spoke-id',
  'New Business Name',
  'restaurant',  -- or 'shop', 'service'
  'newspoke.innopay.lu',
  3005,
  '/',
  'table',
  '0',
  'innopay_table',
  '/images/businesses/new-spoke.jpg',
  false,
  true,
  false,  -- Set to true when spoke is ready
  NOW(),
  NOW()
);
```

### Update Spoke to Mark as Ready

```sql
UPDATE spoke
SET
  ready = true,
  updated_at = NOW()
WHERE id = 'al21';
```

### Update Spoke URL Configuration

```sql
UPDATE spoke
SET
  domain_prod = 'al21.innopay.lu',
  port_dev = 3003,
  path = '/',
  updated_at = NOW()
WHERE id = 'al21';
```

### Enable Delivery for a Spoke

```sql
UPDATE spoke
SET
  has_delivery = true,
  updated_at = NOW()
WHERE id = 'croque-bedaine';
```

### Deactivate a Spoke (Hide from Hub)

```sql
UPDATE spoke
SET
  active = false,
  updated_at = NOW()
WHERE id = 'old-spoke';
```

### Change Spoke Images

```sql
UPDATE spoke
SET
  image_1 = '/images/businesses/new-primary.jpg',
  image_2 = '/images/businesses/new-secondary.jpg',
  image_3 = '/images/businesses/new-tertiary.jpg',
  updated_at = NOW()
WHERE id = 'indies';
```

### Add Multiple Attributes to a Spoke

```sql
UPDATE spoke
SET
  attribute_name_2 = 'special_code',
  attribute_default_2 = NULL,
  attribute_storage_key_2 = 'innopay_special_code',

  attribute_name_3 = 'loyalty_card',
  attribute_default_3 = NULL,
  attribute_storage_key_3 = 'innopay_loyalty_card',

  updated_at = NOW()
WHERE id = 'croque-bedaine';
```

### Delete a Spoke

```sql
DELETE FROM spoke WHERE id = 'old-spoke';
```

## Field Reference

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | VARCHAR(50) | Unique spoke identifier | `'indies'`, `'croque-bedaine'` |
| `name` | VARCHAR(100) | Display name | `'Independent Café'` |
| `type` | VARCHAR(50) | Business type | `'restaurant'`, `'shop'`, `'service'` |
| `domain_prod` | VARCHAR(255) | Production domain | `'indies.innopay.lu'` |
| `port_dev` | INT | Development port | `3001`, `8080` |
| `path` | VARCHAR(100) | URL path | `'/menu'`, `'/'` |
| `attribute_name_1` | VARCHAR(50) | Query param name | `'table'`, `'delivery_address'` |
| `attribute_default_1` | VARCHAR(100) | Static default value | `'0'` |
| `attribute_storage_key_1` | VARCHAR(100) | localStorage key | `'cartTable'`, `'innopay_table'` |
| `image_1/2/3` | VARCHAR(255) | Image paths | `'/images/businesses/...'` |
| `has_delivery` | BOOLEAN | Future delivery flag | `false` (default) |
| `active` | BOOLEAN | Show in hub | `true` (default) |
| `ready` | BOOLEAN | Spoke is developed | `false` (default), shows "Coming Soon" |

## Spoke Types

- **restaurant**: Dining establishments (current: indies, croque-bedaine, al21, millewee)
- **shop**: Retail stores (future)
- **service**: Service providers (future)

## Attribute System

The attribute system allows flexible query parameters:

1. **Static Default**: Set `attribute_default_X` for always-present params
   - Example: `table='0'` always added

2. **Dynamic from localStorage**: Set `attribute_storage_key_X` to read from browser
   - Example: Read saved delivery address from localStorage

3. **Priority**: localStorage value overrides default value

4. **Optional**: Leave both NULL to skip the attribute entirely
