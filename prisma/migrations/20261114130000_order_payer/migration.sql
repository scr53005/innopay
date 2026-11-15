-- CreateTable: who paid which order (customer photos for RUBIS, DISH-PHOTOS-PLAN.md §4).
-- A wallet order reaches the restaurant from @innopay, so the spoke cannot tell the payer from
-- its own transfers; it asks the hub (GET /api/orders/payer).
CREATE TABLE "order_payer" (
    "order_key" VARCHAR(80) NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "customer_account" VARCHAR(16) NOT NULL,
    "recipient" VARCHAR(16) NOT NULL,
    "path" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payer_pkey" PRIMARY KEY ("order_key")
);

-- CreateIndex
CREATE INDEX "order_payer_customer_account_recipient_created_at_idx" ON "order_payer"("customer_account", "recipient", "created_at");
