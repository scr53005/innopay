-- Backfill missing migration history for the debt payment ledger.
-- Some development databases already have these objects from earlier manual
-- schema sync. Keep this migration idempotent so migrate dev can proceed
-- without resetting those local databases, while fresh databases still receive
-- the schema described by prisma/schema.prisma.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outstanding_debt'
      AND column_name = 'original_amount'
  ) THEN
    ALTER TABLE "outstanding_debt" ADD COLUMN "original_amount" DECIMAL(10,3);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "debt_payment" (
  "id" TEXT NOT NULL,
  "debt_id" TEXT NOT NULL,
  "amount_hbd" DECIMAL(10,3) NOT NULL,
  "tx_id" VARCHAR(64),
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,

  CONSTRAINT "debt_payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "debt_payment_debt_id_idx" ON "debt_payment"("debt_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'debt_payment'
      AND constraint_name = 'debt_payment_debt_id_fkey'
  ) THEN
    ALTER TABLE "debt_payment"
    ADD CONSTRAINT "debt_payment_debt_id_fkey"
    FOREIGN KEY ("debt_id") REFERENCES "outstanding_debt"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
