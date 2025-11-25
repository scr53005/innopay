// Quick script to reset the innouser id sequence
require('dotenv').config();
const { Pool } = require('pg');

async function fixSequence() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');

    // Check current max ID
    const maxIdResult = await pool.query('SELECT MAX(id) as max_id FROM innouser');
    const maxId = maxIdResult.rows[0].max_id;
    console.log(`Current MAX(id) in innouser table: ${maxId}`);

    // Check current sequence value
    const seqResult = await pool.query("SELECT last_value FROM innouser_id_seq");
    const currentSeq = seqResult.rows[0].last_value;
    console.log(`Current sequence value: ${currentSeq}`);

    // Reset sequence
    const resetResult = await pool.query(
      "SELECT setval('innouser_id_seq', (SELECT COALESCE(MAX(id), 1) FROM innouser))"
    );
    console.log(`Sequence reset to: ${resetResult.rows[0].setval}`);

    // Verify new sequence value
    const newSeqResult = await pool.query("SELECT last_value FROM innouser_id_seq");
    const newSeq = newSeqResult.rows[0].last_value;
    console.log(`New sequence value: ${newSeq}`);
    console.log(`Next auto-generated ID will be: ${parseInt(newSeq) + 1}`);

    console.log('\n✅ Sequence fixed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

fixSequence();
