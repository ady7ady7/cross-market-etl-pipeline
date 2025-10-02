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
 * This script was created to fix incorrect timeframe values in the
 * symbol_metadata table after the initial timeframe migration.
 *
 * PROBLEM IT SOLVED:
 * - After implementing multi-timeframe support, tables were correctly
 *   named (e.g., symbol_m1_*, symbol_m5_*, symbol_h1_*)
 * - However, the 'timeframe' column in symbol_metadata was always
 *   showing 'm1' for ALL tables, regardless of actual timeframe
 * - This was because upsertSymbolMetadata() function wasn't accepting
 *   or storing the timeframe parameter
 *
 * WHAT IT DID:
 * 1. Fixed the upsertSymbolMetadata() function in db_metadata_manager.js
 *    to accept and store the timeframe parameter
 * 2. Used regex pattern matching to extract timeframe from table_name:
 *    - TradFi tables: symbol_TIMEFRAME_tradfi_ohlcv
 *    - Crypto tables: symbol_TIMEFRAME_exchange_crypto_ohlcv
 * 3. Updated all existing records (34 total: 33 TradFi + 1 Crypto)
 * 4. Verified correct timeframes: m1, m5, h1
 *
 * SQL PATTERNS USED:
 * - TradFi: substring(table_name FROM '_([^_]+)_tradfi_ohlcv$')
 * - Crypto: substring(table_name FROM '_([^_]+)_[^_]+_crypto_ohlcv$')
 *
 * WHY IT'S OUTDATED:
 * - The fix has already been applied (October 2025)
 * - All existing records now have correct timeframe values
 * - The upsertSymbolMetadata() function now properly handles timeframes
 * - New records will automatically have correct timeframes
 * - Running this again is unnecessary and redundant
 *
 * RELATED FILES:
 * - scripts/fix_symbol_metadata_timeframes.sql (SQL queries used)
 * - src/database/db_metadata_manager.js (fixed function)
 * - src/database/symbol_manager.js (calls the function with timeframe)
 *
 * DATE CREATED: October 2, 2025
 * DATE DEPRECATED: October 2, 2025 (same day - one-time fix)
 *
 * ═══════════════════════════════════════════════════════════════════
 */

const { pool } = require('../src/config/database');

async function fixTimeframes() {
  const client = await pool.connect();

  try {
    console.log('⚠️  WARNING: This script is OUTDATED and should not be run!');
    console.log('ℹ️  The timeframe fix has already been applied.');
    console.log('🔧 Fixing symbol_metadata timeframes...\n');

    // Execute TradFi update
    console.log('📊 Updating TradFi timeframes...');
    const tradfiQuery = `
      UPDATE symbol_metadata
      SET timeframe = (
          SELECT substring(table_name FROM '_([^_]+)_tradfi_ohlcv$')
      )
      WHERE asset_type = 'tradfi'
        AND table_name ~ '_[^_]+_tradfi_ohlcv$'
    `;
    const tradfiResult = await client.query(tradfiQuery);
    console.log(`✅ Updated ${tradfiResult.rowCount} TradFi records\n`);

    // Execute Crypto update
    console.log('🪙 Updating Crypto timeframes...');
    const cryptoQuery = `
      UPDATE symbol_metadata
      SET timeframe = (
          SELECT substring(table_name FROM '_([^_]+)_[^_]+_crypto_ohlcv$')
      )
      WHERE asset_type = 'crypto'
        AND table_name ~ '_[^_]+_[^_]+_crypto_ohlcv$'
    `;
    const cryptoResult = await client.query(cryptoQuery);
    console.log(`✅ Updated ${cryptoResult.rowCount} Crypto records\n`);

    // Show verification results
    console.log('📋 Current symbol_metadata records:\n');
    const verifyQuery = `
      SELECT
          symbol,
          timeframe,
          table_name,
          asset_type,
          exchange
      FROM symbol_metadata
      ORDER BY table_name
    `;
    const verifyResult = await client.query(verifyQuery);

    console.log('Symbol'.padEnd(20), 'Timeframe'.padEnd(10), 'Table Name'.padEnd(50), 'Type'.padEnd(10), 'Exchange');
    console.log('-'.repeat(110));

    verifyResult.rows.forEach(row => {
      console.log(
        (row.symbol || '').padEnd(20),
        (row.timeframe || '').padEnd(10),
        (row.table_name || '').padEnd(50),
        (row.asset_type || '').padEnd(10),
        row.exchange || ''
      );
    });

    console.log('\n✅ Timeframe fix complete!');
    console.log(`📊 Total records updated: ${tradfiResult.rowCount + cryptoResult.rowCount}`);

  } catch (error) {
    console.error('❌ Error fixing timeframes:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixTimeframes().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
