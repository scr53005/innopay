-- Backfill userId in walletuser table from bip39seedandaccount links
-- Run this AFTER adding the userId column but BEFORE making it NOT NULL

-- Update walletuser records that have a matching account in bip39seedandaccount
UPDATE walletuser w
SET "userId" = b."userId"
FROM bip39seedandaccount b
WHERE w."accountName" = b."accountName"
  AND w."userId" IS NULL;

-- Check results:
-- SELECT
--   w.id,
--   w."accountName",
--   w."userId",
--   i.email,
--   b."accountName" as linked_account
-- FROM walletuser w
-- LEFT JOIN innouser i ON w."userId" = i.id
-- LEFT JOIN bip39seedandaccount b ON b."userId" = i.id
-- ORDER BY w."creationDate" DESC;

-- NOTE: Some walletuser records might not have a userId if:
-- 1. They were created without email (customerEmail was null)
-- 2. The bip39seedandaccount link was never created
-- This is OK - userId is nullable to allow accounts created without email
