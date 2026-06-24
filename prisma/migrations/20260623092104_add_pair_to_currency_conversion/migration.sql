/*
  Warnings:

  - A unique constraint covering the columns `[date,pair]` on the table `currency_conversion` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "currency_conversion_date_key";

-- AlterTable
ALTER TABLE "currency_conversion" ADD COLUMN     "pair" VARCHAR(12) NOT NULL DEFAULT 'EUR/USD';

-- CreateIndex
CREATE UNIQUE INDEX "currency_conversion_date_pair_key" ON "currency_conversion"("date", "pair");
