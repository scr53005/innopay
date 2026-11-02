-- Receipt written by sign-and-broadcast (recipient unknown at that point) + leg-1 memo.
ALTER TABLE "wallet_payment_claim" ALTER COLUMN "recipient" DROP NOT NULL;
ALTER TABLE "wallet_payment_claim" ADD COLUMN "memo" TEXT;
