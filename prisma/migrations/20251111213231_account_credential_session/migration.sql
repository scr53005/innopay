-- CreateTable
CREATE TABLE "public"."account_credential_session" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "masterPassword" VARCHAR(64) NOT NULL,
    "ownerPrivate" TEXT NOT NULL,
    "ownerPublic" TEXT NOT NULL,
    "activePrivate" TEXT NOT NULL,
    "activePublic" TEXT NOT NULL,
    "postingPrivate" TEXT NOT NULL,
    "postingPublic" TEXT NOT NULL,
    "memoPrivate" TEXT NOT NULL,
    "memoPublic" TEXT NOT NULL,
    "retrieved" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_credential_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_credential_session_stripeSessionId_key" ON "public"."account_credential_session"("stripeSessionId");
