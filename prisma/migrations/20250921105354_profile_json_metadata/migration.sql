-- AlterTable
ALTER TABLE "public"."walletuser" ADD COLUMN     "profileAbout" VARCHAR(255),
ADD COLUMN     "profileAvatar" VARCHAR(255),
ADD COLUMN     "profileBckgrd" VARCHAR(255),
ADD COLUMN     "profileLoc" VARCHAR(255),
ADD COLUMN     "profileName" VARCHAR(64),
ADD COLUMN     "profileWeb" VARCHAR(255);
