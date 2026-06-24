-- AlterTable
ALTER TABLE "outstanding_debt" ADD COLUMN     "fiat_currency" VARCHAR(8) NOT NULL DEFAULT 'EUR',
ADD COLUMN     "token_symbol" VARCHAR(16) NOT NULL DEFAULT 'EURO';

-- AlterTable
ALTER TABLE "spoke" ADD COLUMN     "fiat_currency" VARCHAR(8) NOT NULL DEFAULT 'EUR',
ADD COLUMN     "iou_token" VARCHAR(16) NOT NULL DEFAULT 'EURO';
