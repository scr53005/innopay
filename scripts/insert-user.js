// Script to manually insert innouser and bip39seedandaccount records
require('dotenv').config();
const { Pool } = require('pg');
const { PrivateKey } = require('@hiveio/dhive');
const crypto = require('crypto');

// Simple CUID-like ID generator
function generateCuid() {
  return 'c' + crypto.randomBytes(12).toString('base64url');
}

/**
 * Generic function to fix sequence for a table when unique constraint is violated
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} tableName - Name of the table
 * @param {string} sequenceName - Name of the sequence (usually tableName_id_seq)
 */
async function fixSequence(pool, tableName, sequenceName) {
  console.log(`\n🔧 Fixing sequence for table: ${tableName}`);

  const maxIdResult = await pool.query(`SELECT MAX(id) as max_id FROM ${tableName}`);
  const maxId = maxIdResult.rows[0].max_id;
  console.log(`   Current MAX(id): ${maxId}`);

  const resetResult = await pool.query(
    `SELECT setval('${sequenceName}', (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`
  );
  console.log(`   Sequence reset to: ${resetResult.rows[0].setval}`);
  console.log(`   Next auto-generated ID will be: ${parseInt(resetResult.rows[0].setval) + 1}`);
}

/**
 * Execute a query with automatic sequence fix on unique constraint violation
 * @param {Client} client - PostgreSQL client
 * @param {Pool} pool - PostgreSQL pool (for sequence fix)
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {string} tableName - Table name for sequence fix
 * @returns {Promise} Query result
 */
async function executeWithSequenceFix(client, pool, query, params, tableName) {
  try {
    return await client.query(query, params);
  } catch (error) {
    // Check if it's a unique constraint violation on primary key
    if (error.code === '23505' && error.constraint && error.constraint.endsWith('_pkey')) {
      console.warn(`⚠️  Unique constraint violation detected on ${tableName}`);
      const sequenceName = `${tableName}_id_seq`;
      await fixSequence(pool, tableName, sequenceName);
      console.log(`   Retrying insert after sequence fix...`);
      return await client.query(query, params);
    }
    throw error;
  }
}

async function insertRecords() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log('Starting transaction...');
    await client.query('BEGIN');

    // ALREADY COMPLETED - Step 1: Insert innouser
    /*
    const insertUserResult = await client.query(
      `INSERT INTO innouser (email, verified)
       VALUES ($1, $2)
       RETURNING id`,
      ['brasseriemillewee@gmail.com', true]
    );
    const userId = insertUserResult.rows[0].id;
    console.log(`✅ Created innouser with id: ${userId}`);
    */
    const userId = 3; // Already created

    // ALREADY COMPLETED - Step 2: Insert bip39seedandaccount
    /*
    const insertAccountResult = await client.query(
      `INSERT INTO bip39seedandaccount ("userId", "accountName", hivetxid, seed)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        userId,
        'millewee',
        '1b38ba3d436717d76d4636185893ab9e4f389429',
        'bike notice rare pluck yard prepare fiber thank foster few match family'
      ]
    );
    const accountId = insertAccountResult.rows[0].id;
    console.log(`✅ Created bip39seedandaccount with id: ${accountId}`);
    */

    // Use provided masterPassword (deterministically generated from seed)
    const accountName = 'millewee';
    const seed = 'bike notice rare pluck yard prepare fiber thank foster few match family';
    const masterPassword = 'P5KhMnCv4FSBfjkGW5yb42cHi3vaY79bXqpHDy2Yx8MG2WrA8MgC';

    console.log('Using masterPassword:', masterPassword);

    // Step 3: Insert walletuser (with automatic sequence fix on collision)
    const insertWalletUserResult = await executeWithSequenceFix(
      client,
      pool,
      `INSERT INTO walletuser ("accountName", hivetxid, seed, "masterPassword", "userId", "creationDate")
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [
        accountName,
        '1b38ba3d436717d76d4636185893ab9e4f389429',
        seed,
        masterPassword,
        userId
      ],
      'walletuser'
    );
    const walletUserId = insertWalletUserResult.rows[0].id;
    console.log(`✅ Created walletuser with id: ${walletUserId}`);

    // Step 4: Insert accountCredentialSession
    const createdAt = new Date('2025-11-25T13:11:24Z');
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours later
    const credentialSessionId = generateCuid(); // Generate CUID for id

    const insertCredentialResult = await client.query(
      `INSERT INTO account_credential_session (
        id,
        "accountName",
        "stripeSessionId",
        "masterPassword",
        "ownerPrivate",
        "ownerPublic",
        "activePrivate",
        "activePublic",
        "postingPrivate",
        "postingPublic",
        "memoPrivate",
        "memoPublic",
        "euroBalance",
        "createdAt",
        "expiresAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        credentialSessionId,
        accountName,
        'cs_live_a1tCZQaHZALhDnJG3SFgesRFNz0i7LJu9056TQA80QsGvL7BePCVLI1de2',
        masterPassword,
        '5JaxgXJKSA7yCkwzUeFFw8pPhNJvCaA8HTtAaHit9maamwPWsEW',
        'STM8U8xGJ5pJNCCpLMaXMX45ETnLyRYHVDfZxXmb5QXdp94eZusF6',
        '5JrDk6xtbdhidyTQoYzw3oxb28j4fp1xvFNj6C5YiBfXMjt36nZ',
        'STM7VJLjUg9VfhrL62BMe2ozbjXiKxaxL5MWfHVgUAzxgf1jVvD2K',
        '5HtR3btfxrYK8FBKd94jdFCgiAgQPWot1MJduPXfLXZcCccRt2E',
        'STM8eiTc6vDx8UNtfn29g3AD8hX1ASqEex8MWkcjECNEv2rTLtf3B',
        '5K4GiK6RmcN7JpzeRmNDJyrWFTyWvpsiCg6sa5W9xXnVURs5AcD',
        'STM7KxreGy6ZmymWuSC3rmAZJjVfcH4mJcqtCTLbfyPVNh55zXwkr',
        0.00, // euroBalance - set to 0, adjust if needed
        createdAt,
        expiresAt
      ]
    );
    console.log(`✅ Created account_credential_session with id: ${credentialSessionId}`);

    // Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!');
    console.log(`   - walletuser id: ${walletUserId}`);
    console.log(`   - account_credential_session id: ${credentialSessionId}`);
    console.log(`   - masterPassword: ${masterPassword}`);
    console.log(`   - createdAt: ${createdAt.toISOString()}`);
    console.log(`   - expiresAt: ${expiresAt.toISOString()}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error, transaction rolled back:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

insertRecords();
