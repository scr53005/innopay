-- AlterTable
ALTER TABLE "public"."walletuser" ADD COLUMN     "userId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."walletuser" ADD CONSTRAINT "walletuser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."innouser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
