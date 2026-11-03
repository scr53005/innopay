-- Per-spoke cap on the share of a bill (food subtotal) payable in RUBIS. Default 25 %.
ALTER TABLE "spoke" ADD COLUMN "rubis_max_redeem_fraction" DECIMAL(4,3) NOT NULL DEFAULT 0.25;
