#!/usr/bin/env node

/**
 * Run the fix_database_functions.sql script to clean up old function signatures
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

async function runFixScript() {
  const client = await pool.connect();

  try {
    console.log('🔧 Running database function fix script...');

    // Read the SQL fix script
    const sqlScript = fs.readFileSync(
      path.join(__dirname, 'fix_database_functions.sql'),
      'utf8'
    );

    // Execute the SQL script
    const result = await client.query(sqlScript);

    console.log('✅ Database functions cleaned up successfully!');
    console.log('💡 You can now run npm run db:import again');

  } catch (error) {
    console.error('❌ Failed to run fix script:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
runFixScript().catch(console.error);