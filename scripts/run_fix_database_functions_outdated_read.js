#!/usr/bin/env node

/**
 * ⚠️ OUTDATED - FOR REFERENCE ONLY ⚠️
 *
 * This script is OUTDATED and should NOT be run anymore.
 * It's kept for historical reference and documentation purposes only.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SCRIPT PURPOSE (Historical):
 * ═══════════════════════════════════════════════════════════════════
 *
 * This script was created to fix database function signature conflicts
 * during the migration to support multiple timeframes.
 *
 * PROBLEM IT SOLVED:
 * - When adding timeframe support, table creation functions needed to
 *   accept an additional 'timeframe' parameter
 * - PostgreSQL was complaining about ambiguous function calls because
 *   both old (without timeframe) and new (with timeframe) function
 *   signatures existed
 * - The old functions needed to be dropped before the new ones could
 *   be properly created
 *
 * WHAT IT DID:
 * - Dropped old function signatures for create_tradfi_ohlcv_table and
 *   create_crypto_ohlcv_table
 * - Recreated the functions with the new timeframe parameter
 * - Fixed the table_exists() function that had a naming conflict
 *
 * WHY IT'S OUTDATED:
 * - The fix has already been applied to the database schema
 * - The schema files (symbol_based_ohlcv.sql) now contain the correct
 *   function signatures
 * - Running this script again is unnecessary and could cause issues
 * - New installations will have the correct functions from the start
 *
 * RELATED FILES:
 * - scripts/fix_database_functions.sql (the SQL fix it executed)
 * - src/database/schema/symbol_based_ohlcv.sql (current correct schema)
 *
 * DATE CREATED: During timeframe migration (August 2025)
 * DATE DEPRECATED: October 2025
 *
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

async function runFixScript() {
  const client = await pool.connect();

  try {
    console.log('⚠️  WARNING: This script is OUTDATED and should not be run!');
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
