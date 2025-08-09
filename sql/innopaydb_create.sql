-- Table 1: innouser
-- Stores user information.
CREATE TABLE innouser (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT innouser_pkey PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX innouser_email_key ON innouser("email");

-- Table 2: topup
-- Records successful top-up transactions.
CREATE TABLE topup (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amountEuro" DECIMAL(65, 2) NOT NULL,
    "topupAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT topup_pkey PRIMARY KEY ("id")
);
ALTER TABLE topup ADD CONSTRAINT topup_userId_fkey FOREIGN KEY ("userId") REFERENCES innouser("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table 3: bip39seedandaccount
-- Stores the generated seed and Hive account name for each user.
CREATE TABLE bip39seedandaccount (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "seed" TEXT NOT NULL,
    "accountName" VARCHAR(16) NOT NULL,
    "hivetxid" CHAR(40),
    CONSTRAINT bip39seedandaccount_pkey PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX bip39seedandaccount_userId_key ON bip39seedandaccount("userId");
CREATE UNIQUE INDEX bip39seedandaccount_accountName_key ON bip39seedandaccount("accountName");
ALTER TABLE bip39seedandaccount ADD CONSTRAINT bip39seedandaccount_userId_fkey FOREIGN KEY ("userId") REFERENCES innouser("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Change ownership of tables
ALTER TABLE innouser OWNER TO "Sorin";
ALTER TABLE topup OWNER TO "Sorin";
ALTER TABLE bip39seedandaccount OWNER TO "Sorin";

-- Change ownership of the sequences for the SERIAL columns
ALTER SEQUENCE innouser_id_seq OWNER TO "Sorin";
ALTER SEQUENCE topup_id_seq OWNER TO "Sorin";
ALTER SEQUENCE bip39seedandaccount_id_seq OWNER TO "Sorin";

-- Grant all privileges on all tables in the 'public' schema to Sorin.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "Sorin";

-- Grant all privileges on all sequences in the 'public' schema to Sorin.
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "Sorin";

-- Grant usage on the 'public' schema itself.
GRANT USAGE ON SCHEMA public TO "Sorin";
