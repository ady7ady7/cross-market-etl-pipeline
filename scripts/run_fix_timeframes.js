/**
 * Fix Symbol Metadata Timeframes
 * Updates timeframe column in symbol_metadata to reflect actual table timeframes
 */

const { pool } = require('../src/config/database');

async function fixTimeframes() {
  const client = await pool.connect();

  try {
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
      ORDER BY asset_type, symbol, timeframe
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
