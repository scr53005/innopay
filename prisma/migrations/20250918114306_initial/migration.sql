-- CreateTable
CREATE TABLE "public"."bip39seedandaccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "seed" TEXT NOT NULL,
    "accountName" VARCHAR(16) NOT NULL,
    "hivetxid" TEXT,

    CONSTRAINT "bip39seedandaccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."innouser" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "innouser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."topup" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amountEuro" DECIMAL(65,2) NOT NULL,
    "topupAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."walletuser" (
    "id" SERIAL NOT NULL,
    "accountName" TEXT NOT NULL,
    "creationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hivetxid" CHAR(40) NOT NULL,

    CONSTRAINT "walletuser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bip39seedandaccount_userid_key" ON "public"."bip39seedandaccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bip39seedandaccount_accountname_key" ON "public"."bip39seedandaccount"("accountName");

-- CreateIndex
CREATE UNIQUE INDEX "bip39seedandaccount_hivetxid_key" ON "public"."bip39seedandaccount"("hivetxid");

-- CreateIndex
CREATE UNIQUE INDEX "innouser_email_key" ON "public"."innouser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "walletuser_accountName_key" ON "public"."walletuser"("accountName");

-- AddForeignKey
ALTER TABLE "public"."bip39seedandaccount" ADD CONSTRAINT "bip39seedandaccount_userid_fkey" FOREIGN KEY ("userId") REFERENCES "public"."innouser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."topup" ADD CONSTRAINT "topup_userid_fkey" FOREIGN KEY ("userId") REFERENCES "public"."innouser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
