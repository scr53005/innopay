-- RUBIS per-spoke contract (rate null = not distributing)
ALTER TABLE "spoke" ADD COLUMN "rubis_rate" DECIMAL(6,4);
ALTER TABLE "spoke" ADD COLUMN "rubis_tip_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "rubis_reward" (
    "id" TEXT NOT NULL,
    "order_key" VARCHAR(80) NOT NULL,
    "customer_account" VARCHAR(16) NOT NULL,
    "spoke_id" VARCHAR(50) NOT NULL,
    "recipient" VARCHAR(16) NOT NULL,
    "order_total" DECIMAL(10,2) NOT NULL,
    "tip" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(6,4) NOT NULL,
    "tip_multiplier" DECIMAL(4,2) NOT NULL,
    "rubis_amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "rubis_tx_id" CHAR(40),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rubis_reward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubis_reward_order_key_key" ON "rubis_reward"("order_key");
CREATE INDEX "rubis_reward_customer_account_idx" ON "rubis_reward"("customer_account");
CREATE INDEX "rubis_reward_status_idx" ON "rubis_reward"("status");
