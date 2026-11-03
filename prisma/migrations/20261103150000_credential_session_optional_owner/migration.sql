-- Existing-wallet sessions (Flow 5 Branch A) carry only active + memo keys.
ALTER TABLE "account_credential_session" ALTER COLUMN "masterPassword" DROP NOT NULL;
ALTER TABLE "account_credential_session" ALTER COLUMN "ownerPrivate" DROP NOT NULL;
ALTER TABLE "account_credential_session" ALTER COLUMN "ownerPublic" DROP NOT NULL;
ALTER TABLE "account_credential_session" ALTER COLUMN "postingPrivate" DROP NOT NULL;
ALTER TABLE "account_credential_session" ALTER COLUMN "postingPublic" DROP NOT NULL;
