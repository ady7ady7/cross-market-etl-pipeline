/**
 * ═══════════════════════════════════════════════════════════════════
 * SCRIPT PURPOSE:
 * ═══════════════════════════════════════════════════════════════════
 *
 * Adds point_value column to symbol_metadata table to fix position sizing
 * and P&L calculation issues across all instruments.
 *
 * PROBLEM BEING SOLVED:
 * - Previous P&L calculation caused massive position sizes and unrealistic
 *   P&L values (trillions of dollars) due to different price scales
 * - Example: DAX at 15,000 with 0.1% SL (15 points) created enormous positions
 *
 * SOLUTION:
 * - Normalizes all instruments to micro contracts where 1 point ≈ $1 P&L
 * - Adds point_value to enable accurate position sizing and P&L calculation
 *
 * NEW FORMULAS:
 * - Position sizing: position_size = risk_amount / (risk_in_points * point_value)
 * - P&L calculation: pnl = price_change_in_points * point_value * position_size
 *
 * POINT VALUES SET:
 * 1. Crypto (BTC, ETH): 1.0 (1 coin = 1 unit, 1 point = $1)
 * 2. Indices (DAX, S&P, Nasdaq, Dow): 1.0 (1 micro contract, 1 point ≈ $1)
 * 3. Forex (EURUSD, GBPUSD, etc.): 0.1 (1 micro lot, 1 pip = $0.10)
 * 4. Commodities (Gold, Silver, Oil): 1.0 (default, may need adjustment)
 *
 * WHAT THIS SCRIPT DOES:
 * 1. Adds point_value column to symbol_metadata (if not exists)
 * 2. Updates point_value for all crypto symbols
 * 3. Updates point_value for all index symbols
 * 4. Updates point_value for all forex symbols
 * 5. Updates point_value for all commodity symbols
 * 6. Displays verification results grouped by asset type
 *
 * DATE CREATED: October 2, 2025
 *
 * ═══════════════════════════════════════════════════════════════════
 */

const { pool } = require('../src/config/database');
const fs = require('fs').promises;
const path = require('path');

async function addPointValue() {
  const client = await pool.connect();

  try {
    console.log('🔧 Adding point_value to symbol_metadata table...\n');

    // Read and execute the SQL file
    const sqlPath = path.join(__dirname, 'add_point_value_to_symbol_metadata.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.toUpperCase().includes('ALTER TABLE')) {
        console.log('📊 Adding point_value column...');
        await client.query(statement);
        console.log('✅ Column added (or already exists)\n');
      } else if (statement.toUpperCase().includes('UPDATE')) {
        const result = await client.query(statement);

        // Determine which asset type was updated
        if (statement.includes("asset_type = 'crypto'")) {
          console.log(`💰 Updated ${result.rowCount} Crypto records (point_value = 1.0)`);
        } else if (statement.includes('deuidxeur')) {
          console.log(`📈 Updated ${result.rowCount} Index records (point_value = 1.0)`);
        } else if (statement.includes('eurusd')) {
          console.log(`💱 Updated ${result.rowCount} Forex records (point_value = 0.1)`);
        } else if (statement.includes('xauusd')) {
          console.log(`🥇 Updated ${result.rowCount} Commodity records (point_value = 1.0)`);
        }
      } else if (statement.toUpperCase().includes('SELECT')) {
        // Execute verification queries
        const result = await client.query(statement);

        if (result.rows.length > 0) {
          // Check if it's the summary query or detailed query
          if (result.rows[0].symbol_count !== undefined) {
            console.log('\n📊 SUMMARY BY ASSET TYPE AND POINT VALUE:\n');
            console.log('Asset Type'.padEnd(15), 'Point Value'.padEnd(15), 'Count'.padEnd(10), 'Symbols');
            console.log('-'.repeat(100));

            result.rows.forEach(row => {
              const symbols = row.symbols ? row.symbols.slice(0, 5).join(', ') : '';
              const more = row.symbols && row.symbols.length > 5 ? ` (+${row.symbols.length - 5} more)` : '';
              console.log(
                (row.asset_type || '').padEnd(15),
                (row.point_value || '').toString().padEnd(15),
                (row.symbol_count || '').toString().padEnd(10),
                symbols + more
              );
            });
          } else {
            console.log('\n📋 ALL SYMBOL METADATA RECORDS:\n');
            console.log('Symbol'.padEnd(20), 'Type'.padEnd(10), 'Timeframe'.padEnd(12), 'Point Value'.padEnd(15), 'Exchange'.padEnd(12));
            console.log('-'.repeat(90));

            result.rows.forEach(row => {
              console.log(
                (row.symbol || '').padEnd(20),
                (row.asset_type || '').padEnd(10),
                (row.timeframe || '').padEnd(12),
                (row.point_value || '').toString().padEnd(15),
                (row.exchange || '').padEnd(12)
              );
            });
          }
        }
      }
    }

    console.log('\n✅ Point value migration complete!');
    console.log('\n📝 NEXT STEPS:');
    console.log('   1. Update position sizing logic to use: risk_amount / (risk_in_points * point_value)');
    console.log('   2. Update P&L calculation to use: price_change_in_points * point_value * position_size');
    console.log('   3. Verify that backtesting results are now realistic (no trillion-dollar P&Ls)');

  } catch (error) {
    console.error('❌ Error adding point_value:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
addPointValue().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
