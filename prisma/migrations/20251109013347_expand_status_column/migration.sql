/*
  Warnings:

  - You are about to drop the `guestCheckout` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."guestCheckout";

-- CreateTable
CREATE TABLE "public"."guestcheckout" (
    "id" SERIAL NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "amountEuro" DECIMAL(10,2) NOT NULL,
    "amountHbd" DECIMAL(10,4) NOT NULL,
    "recipient" VARCHAR(16) NOT NULL,
    "memo" TEXT NOT NULL,
    "hiveTxId" CHAR(40),
    "status" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "guestcheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guestcheckout_stripeSessionId_key" ON "public"."guestcheckout"("stripeSessionId");
