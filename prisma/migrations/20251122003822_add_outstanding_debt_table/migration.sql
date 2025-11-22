-- CreateTable
CREATE TABLE "public"."outstanding_debt" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditor" VARCHAR(16) NOT NULL,
    "debtor" VARCHAR(16) NOT NULL DEFAULT 'innopay',
    "amount_hbd" DECIMAL(10,3) NOT NULL,
    "euro_tx_id" CHAR(40) NOT NULL,
    "eur_usd_rate" DECIMAL(10,4) NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "payment_tx_id" CHAR(40),
    "notes" TEXT,

    CONSTRAINT "outstanding_debt_pkey" PRIMARY KEY ("id")
);
