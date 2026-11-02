-- CreateTable
CREATE TABLE "wallet_payment_claim" (
    "customer_tx_id" VARCHAR(40) NOT NULL,
    "customer_account" VARCHAR(16) NOT NULL,
    "recipient" VARCHAR(16) NOT NULL,
    "token_symbol" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'claimed',
    "restaurant_tx_id" CHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_payment_claim_pkey" PRIMARY KEY ("customer_tx_id")
);
