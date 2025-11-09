-- AlterTable
ALTER TABLE "public"."walletuser" ADD COLUMN     "masterPassword" VARCHAR(64),
ADD COLUMN     "seed" TEXT;
