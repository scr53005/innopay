-- Migration: Replace `paid` Boolean with `status` String on outstanding_debt
-- Status lifecycle: unpaid → withdrawal_pending → paid (or → settled_out_of_band)

-- Step 1: Add status column with default 'unpaid'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outstanding_debt' AND column_name = 'status'
  ) THEN
    ALTER TABLE "outstanding_debt" ADD COLUMN "status" VARCHAR(30) NOT NULL DEFAULT 'unpaid';
  END IF;
END $$;

-- Step 2: Backfill status from existing paid column
UPDATE "outstanding_debt" SET "status" = 'paid' WHERE "paid" = true AND "status" = 'unpaid';

-- Step 3: Mark pre-existing debts to real restaurants as settled out of band
-- These were repaid manually outside the system during the test phase
UPDATE "outstanding_debt"
SET "status" = 'settled_out_of_band'
WHERE "status" = 'unpaid'
  AND "creditor" IN ('indies.cafe', 'croque.bedaine');

-- Step 4: Drop the paid column (replaced by status)
ALTER TABLE "outstanding_debt" DROP COLUMN IF EXISTS "paid";
