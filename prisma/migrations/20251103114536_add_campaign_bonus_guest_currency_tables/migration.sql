-- CreateTable
CREATE TABLE "public"."campaign" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "minAmount50" DECIMAL(10,2) NOT NULL,
    "bonus50" DECIMAL(10,2) NOT NULL,
    "maxUsers50" INTEGER NOT NULL,
    "minAmount100" DECIMAL(10,2) NOT NULL,
    "bonus100" DECIMAL(10,2) NOT NULL,
    "maxUsers100" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bonus" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "userId" INTEGER,
    "walletUserId" INTEGER,
    "accountName" VARCHAR(16) NOT NULL,
    "bonusAmount" DECIMAL(10,2) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."guestCheckout" (
    "id" SERIAL NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "amountEuro" DECIMAL(10,2) NOT NULL,
    "amountHbd" DECIMAL(10,4) NOT NULL,
    "recipient" VARCHAR(16) NOT NULL,
    "memo" TEXT NOT NULL,
    "hiveTxId" CHAR(40),
    "status" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "guestCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."currency_conversion" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "conversionRate" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guestCheckout_stripeSessionId_key" ON "public"."guestCheckout"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "currency_conversion_date_key" ON "public"."currency_conversion"("date");

-- AddForeignKey
ALTER TABLE "public"."bonus" ADD CONSTRAINT "bonus_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bonus" ADD CONSTRAINT "bonus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."innouser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bonus" ADD CONSTRAINT "bonus_walletUserId_fkey" FOREIGN KEY ("walletUserId") REFERENCES "public"."walletuser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
