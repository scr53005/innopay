-- CreateTable
CREATE TABLE "email_verification" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "ip_address" VARCHAR(45),

    CONSTRAINT "email_verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verification_email_verified_idx" ON "email_verification"("email", "verified");

-- CreateIndex
CREATE INDEX "email_verification_user_id_verified_idx" ON "email_verification"("user_id", "verified");

-- AddForeignKey
ALTER TABLE "email_verification" ADD CONSTRAINT "email_verification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "innouser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
