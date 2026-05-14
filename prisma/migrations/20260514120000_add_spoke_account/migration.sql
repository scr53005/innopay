-- CreateTable
CREATE TABLE "spoke_account" (
    "id" TEXT NOT NULL,
    "spoke_id" VARCHAR(50) NOT NULL,
    "hive_account" VARCHAR(16) NOT NULL,
    "environment" VARCHAR(20) NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "settlement_enabled" BOOLEAN NOT NULL DEFAULT false,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spoke_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spoke_account_spoke_id_hive_account_environment_role_key"
ON "spoke_account"("spoke_id", "hive_account", "environment", "role");

-- CreateIndex
CREATE INDEX "spoke_account_spoke_id_idx" ON "spoke_account"("spoke_id");

-- CreateIndex
CREATE INDEX "spoke_account_hive_account_idx" ON "spoke_account"("hive_account");

-- CreateIndex
CREATE INDEX "spoke_account_environment_idx" ON "spoke_account"("environment");

-- AddForeignKey
ALTER TABLE "spoke_account"
ADD CONSTRAINT "spoke_account_spoke_id_fkey"
FOREIGN KEY ("spoke_id") REFERENCES "spoke"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed settlement-enabled accounts. These rows are intentionally environment
-- scoped so Liman can select only the active settlement environment.
INSERT INTO "spoke_account" (
  "id", "spoke_id", "hive_account", "environment", "role",
  "active", "settlement_enabled", "primary", "notes", "updated_at"
)
SELECT
  'spokeacct_indies_prod_orders_and_tips',
  'indies',
  'indies.cafe',
  'prod',
  'orders_and_tips',
  true,
  true,
  true,
  'Seeded for Liman settlement authority checks',
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spoke" WHERE "id" = 'indies')
ON CONFLICT ("spoke_id", "hive_account", "environment", "role") DO UPDATE SET
  "active" = EXCLUDED."active",
  "settlement_enabled" = EXCLUDED."settlement_enabled",
  "primary" = EXCLUDED."primary",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "spoke_account" (
  "id", "spoke_id", "hive_account", "environment", "role",
  "active", "settlement_enabled", "primary", "notes", "updated_at"
)
SELECT
  'spokeacct_indies_dev_orders_and_tips',
  'indies',
  'indies-test',
  'dev',
  'orders_and_tips',
  true,
  true,
  false,
  'Seeded for Liman settlement authority checks',
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spoke" WHERE "id" = 'indies')
ON CONFLICT ("spoke_id", "hive_account", "environment", "role") DO UPDATE SET
  "active" = EXCLUDED."active",
  "settlement_enabled" = EXCLUDED."settlement_enabled",
  "primary" = EXCLUDED."primary",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "spoke_account" (
  "id", "spoke_id", "hive_account", "environment", "role",
  "active", "settlement_enabled", "primary", "notes", "updated_at"
)
SELECT
  'spokeacct_croque_prod_orders_and_tips',
  'croque-bedaine',
  'croque.bedaine',
  'prod',
  'orders_and_tips',
  true,
  true,
  true,
  'Seeded for Liman settlement authority checks',
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spoke" WHERE "id" = 'croque-bedaine')
ON CONFLICT ("spoke_id", "hive_account", "environment", "role") DO UPDATE SET
  "active" = EXCLUDED."active",
  "settlement_enabled" = EXCLUDED."settlement_enabled",
  "primary" = EXCLUDED."primary",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "spoke_account" (
  "id", "spoke_id", "hive_account", "environment", "role",
  "active", "settlement_enabled", "primary", "notes", "updated_at"
)
SELECT
  'spokeacct_croque_demo_orders_and_tips',
  'croque-bedaine',
  'croque.demo',
  'demo',
  'orders_and_tips',
  true,
  true,
  false,
  'Seeded for Liman settlement authority checks',
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spoke" WHERE "id" = 'croque-bedaine')
ON CONFLICT ("spoke_id", "hive_account", "environment", "role") DO UPDATE SET
  "active" = EXCLUDED."active",
  "settlement_enabled" = EXCLUDED."settlement_enabled",
  "primary" = EXCLUDED."primary",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "spoke_account" (
  "id", "spoke_id", "hive_account", "environment", "role",
  "active", "settlement_enabled", "primary", "notes", "updated_at"
)
SELECT
  'spokeacct_croque_dev_orders_and_tips',
  'croque-bedaine',
  'croque-test',
  'dev',
  'orders_and_tips',
  true,
  true,
  false,
  'Seeded for Liman settlement authority checks',
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spoke" WHERE "id" = 'croque-bedaine')
ON CONFLICT ("spoke_id", "hive_account", "environment", "role") DO UPDATE SET
  "active" = EXCLUDED."active",
  "settlement_enabled" = EXCLUDED."settlement_enabled",
  "primary" = EXCLUDED."primary",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "spoke_account" (
  "id", "spoke_id", "hive_account", "environment", "role",
  "active", "settlement_enabled", "primary", "notes", "updated_at"
)
SELECT
  'spokeacct_millewee_prod_orders_and_tips',
  'millewee',
  'millewee',
  'prod',
  'orders_and_tips',
  true,
  true,
  true,
  'Seeded for Liman settlement authority checks',
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spoke" WHERE "id" = 'millewee')
ON CONFLICT ("spoke_id", "hive_account", "environment", "role") DO UPDATE SET
  "active" = EXCLUDED."active",
  "settlement_enabled" = EXCLUDED."settlement_enabled",
  "primary" = EXCLUDED."primary",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "spoke_account" (
  "id", "spoke_id", "hive_account", "environment", "role",
  "active", "settlement_enabled", "primary", "notes", "updated_at"
)
SELECT
  'spokeacct_millewee_dev_orders_and_tips',
  'millewee',
  'innodemo',
  'dev',
  'orders_and_tips',
  true,
  true,
  false,
  'Seeded for Liman settlement authority checks',
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spoke" WHERE "id" = 'millewee')
ON CONFLICT ("spoke_id", "hive_account", "environment", "role") DO UPDATE SET
  "active" = EXCLUDED."active",
  "settlement_enabled" = EXCLUDED."settlement_enabled",
  "primary" = EXCLUDED."primary",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;
