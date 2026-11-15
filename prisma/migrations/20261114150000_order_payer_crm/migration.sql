-- order_payer for the CRM (CRM-PLAN.md §8, Priority 3): what each order cost and contained.
-- Nullable only for the few rows written on 2026-11-14 before this migration; every new row has them.
ALTER TABLE "order_payer" ADD COLUMN "order_total" DECIMAL(10,2);
ALTER TABLE "order_payer" ADD COLUMN "fiat" VARCHAR(3);
ALTER TABLE "order_payer" ADD COLUMN "memo" TEXT;
