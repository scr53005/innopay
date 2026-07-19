/*
  Warnings:

  - A unique constraint covering the columns `[memo_vendor_id]` on the table `spoke` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "spoke" ADD COLUMN     "memo_vendor_id" INTEGER,
ADD COLUMN     "service_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "service_model" VARCHAR(30) NOT NULL DEFAULT 'table_remote';

-- CreateIndex
CREATE UNIQUE INDEX "spoke_memo_vendor_id_key" ON "spoke"("memo_vendor_id");
