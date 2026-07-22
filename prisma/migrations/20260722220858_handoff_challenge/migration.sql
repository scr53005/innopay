-- CreateTable
CREATE TABLE "handoff_challenge" (
    "id" TEXT NOT NULL,
    "account" VARCHAR(16) NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handoff_challenge_nonce_key" ON "handoff_challenge"("nonce");
