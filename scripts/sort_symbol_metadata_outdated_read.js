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
 * This script was created to physically reorder rows in the
 * symbol_metadata table alphabetically by table_name.
 *
 * PROBLEM IT SOLVED:
 * - After multiple imports and updates, the physical row order in
 *   symbol_metadata was random/insertion-order based
 * - User wanted rows sorted alphabetically by table_name for easier
 *   browsing and management
 * - Alphabetical sorting groups all timeframes for each symbol together
 *   (e.g., deuidxeur_h1, deuidxeur_m1, deuidxeur_m5)
 *
 * WHAT IT DID:
 * 1. Created a temporary table with all data sorted by table_name
 * 2. Deleted all rows from the original symbol_metadata table
 * 3. Re-inserted all rows in alphabetical order
 * 4. Displayed verification showing the new sorted order
 *
 * TECHNIQUE USED:
 * - CREATE TEMP TABLE symbol_metadata_sorted AS SELECT * ORDER BY table_name
 * - DELETE FROM symbol_metadata
 * - INSERT INTO symbol_metadata SELECT * FROM temp table
 *
 * WHY IT'S OUTDATED:
 * - The physical reordering has already been completed (October 2025)
 * - All SQL queries now include "ORDER BY table_name" by default:
 *   * getAllMetadata() in db_metadata_manager.js
 *   * get_symbols_needing_update() function in metadata_tables.sql
 * - Physical row order in database tables doesn't matter when queries
 *   always use ORDER BY
 * - Running this script again is unnecessary since queries handle sorting
 * - PostgreSQL can reorder rows internally anyway during VACUUM operations
 *
 * BETTER APPROACH NOW:
 * - Instead of physically reordering, all queries use ORDER BY table_name
 * - This is more maintainable and doesn't require periodic re-sorting
 * - Database indexes make ORDER BY efficient
 *
 * RELATED FILES:
 * - src/database/db_metadata_manager.js (getAllMetadata with ORDER BY)
 * - src/database/schema/metadata_tables.sql (functions with ORDER BY)
 *
 * DATE CREATED: October 2, 2025
 * DATE DEPRECATED: October 2, 2025 (same day - one-time operation)
 *
 * ═══════════════════════════════════════════════════════════════════
 */

const { pool } = require('../src/config/database');

async function sortSymbolMetadata() {
  const client = await pool.connect();

  try {
    console.log('⚠️  WARNING: This script is OUTDATED and should not be run!');
    console.log('ℹ️  All queries now use ORDER BY table_name automatically.');
    console.log('🔄 Sorting symbol_metadata by table_name...\n');

    // Create a temporary table with sorted data
    console.log('📋 Creating sorted copy...');
    await client.query(`
      CREATE TEMP TABLE symbol_metadata_sorted AS
      SELECT * FROM symbol_metadata
      ORDER BY table_name;
    `);

    // Clear the original table
    console.log('🗑️  Clearing original table...');
    await client.query('DELETE FROM symbol_metadata;');

    // Insert back in sorted order
    console.log('📥 Inserting sorted records...');
    const result = await client.query(`
      INSERT INTO symbol_metadata
      SELECT * FROM symbol_metadata_sorted
      ORDER BY table_name;
    `);

    console.log(`✅ Sorted ${result.rowCount} records\n`);

    // Verify the new order
    console.log('📋 Current symbol_metadata records (sorted by table_name):\n');
    const verifyResult = await client.query(`
      SELECT symbol, timeframe, table_name, asset_type, exchange
      FROM symbol_metadata
      ORDER BY table_name;
    `);

    console.log('Table Name'.padEnd(50), 'Symbol'.padEnd(20), 'Timeframe'.padEnd(10), 'Type'.padEnd(10), 'Exchange');
    console.log('-'.repeat(110));

    verifyResult.rows.forEach(row => {
      console.log(
        (row.table_name || '').padEnd(50),
        (row.symbol || '').padEnd(20),
        (row.timeframe || '').padEnd(10),
        (row.asset_type || '').padEnd(10),
        row.exchange || ''
      );
    });

    console.log('\n✅ Symbol metadata sorted successfully!');

  } catch (error) {
    console.error('❌ Error sorting symbol_metadata:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the sort
sortSymbolMetadata().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
