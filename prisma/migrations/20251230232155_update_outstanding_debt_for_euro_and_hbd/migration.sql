-- AlterTable: Update outstanding_debt to support EURO-denominated debt and HBD transfers
-- Make existing fields nullable/optional and add new fields for complete debt tracking

-- Add amount_euro column if it doesn't exist (EURO-denominated debt)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outstanding_debt' AND column_name = 'amount_euro'
  ) THEN
    ALTER TABLE "outstanding_debt" ADD COLUMN "amount_euro" DECIMAL(10,2);
  END IF;
END $$;

-- Add hbd_tx_id column if it doesn't exist (HBD transfer transaction ID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outstanding_debt' AND column_name = 'hbd_tx_id'
  ) THEN
    ALTER TABLE "outstanding_debt" ADD COLUMN "hbd_tx_id" CHAR(40);
  END IF;
END $$;

-- Make euro_tx_id nullable (transfer might fail, so no tx_id)
ALTER TABLE "outstanding_debt" ALTER COLUMN "euro_tx_id" DROP NOT NULL;

-- Set default value for amount_hbd to 0 (when debt is EURO-only)
ALTER TABLE "outstanding_debt" ALTER COLUMN "amount_hbd" SET DEFAULT 0;

-- Update existing records to have amount_hbd = 0 if null
UPDATE "outstanding_debt" SET "amount_hbd" = 0 WHERE "amount_hbd" IS NULL;
