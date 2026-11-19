-- HUB-USER-FEATURES-PLAN §2: self-service recovery-email change.

-- AlterTable
ALTER TABLE "email_verification" ADD COLUMN "purpose" VARCHAR(16) NOT NULL DEFAULT 'recovery',
ADD COLUMN "revoked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_change" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "account_name" VARCHAR(16) NOT NULL,
    "old_email" VARCHAR(255) NOT NULL,
    "new_email" VARCHAR(255) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_change_user_id_idx" ON "email_change"("user_id");

-- AddForeignKey
ALTER TABLE "email_change" ADD CONSTRAINT "email_change_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "innouser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
