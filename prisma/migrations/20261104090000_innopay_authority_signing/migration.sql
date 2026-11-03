-- Customer payments signed with @innopay's active key (no-key fallback). Read by Liman.
CREATE TABLE "innopay_authority_signing" (
    "id" TEXT NOT NULL,
    "signer" VARCHAR(16) NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "to_account" VARCHAR(16) NOT NULL,
    "tx_id" CHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "innopay_authority_signing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "innopay_authority_signing_created_at_idx" ON "innopay_authority_signing"("created_at");
CREATE INDEX "innopay_authority_signing_signer_idx" ON "innopay_authority_signing"("signer");
