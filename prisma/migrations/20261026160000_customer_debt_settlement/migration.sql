ALTER TABLE "outstanding_debt" ADD COLUMN "settlement_id" VARCHAR(30);
ALTER TABLE "debt_payment" ADD COLUMN "settlement_key" VARCHAR(100);
CREATE UNIQUE INDEX "debt_payment_settlement_key_key" ON "debt_payment"("settlement_key");
