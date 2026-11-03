-- RUBIS used to pay part of an order (future split payments) earn no RUBIS; recorded for audit.
ALTER TABLE "rubis_reward" ADD COLUMN "rubis_spent" DECIMAL(12,2) NOT NULL DEFAULT 0;
