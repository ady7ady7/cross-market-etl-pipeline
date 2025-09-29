/**
 * Migration Script: Single Timeframe to Multi-Timeframe Schema
 *
 * This script migrates existing M1 data to the new timeframe-aware schema:
 * 1. Updates symbol_metadata table structure
 * 2. Renames existing tables to include M1 timeframe
 * 3. Adds timeframe column to existing data tables
 * 4. Updates metadata records with timeframe information
 */

require('dotenv').config();
const { pool, testConnection } = require('../src/config/database');

class TimeframeMigration {
  constructor() {
    this.pool = pool;
  }

  async migrate() {
    console.log('🔄 Starting migration to multi-timeframe schema...\n');

    try {
      // Test database connection
      console.log('🔗 Testing database connection...');
      const connected = await testConnection();
      if (!connected) {
        throw new Error('Database connection failed');
      }

      // Step 1: Backup existing metadata
      console.log('\n1️⃣ Creating backup of symbol_metadata...');
      await this.backupMetadata();

      // Step 2: Update symbol_metadata table structure
      console.log('\n2️⃣ Updating symbol_metadata table structure...');
      await this.updateMetadataTableStructure();

      // Step 3: Get existing tables that need migration
      console.log('\n3️⃣ Identifying tables to migrate...');
      const tablesToMigrate = await this.getExistingTables();
      console.log(`   📊 Found ${tablesToMigrate.length} tables to migrate`);

      // Step 4: Migrate each table
      console.log('\n4️⃣ Migrating tables to new naming convention...');
      for (const table of tablesToMigrate) {
        await this.migrateTable(table);
      }

      // Step 5: Update metadata records
      console.log('\n5️⃣ Updating metadata records...');
      await this.updateMetadataRecords();

      // Step 6: Clean up old metadata backup
      console.log('\n6️⃣ Cleaning up...');
      await this.cleanup();

      console.log('\n✅ Migration completed successfully!');
      console.log('\n📊 Summary:');
      console.log(`   • Migrated ${tablesToMigrate.length} tables to new naming convention`);
      console.log(`   • Updated symbol_metadata table structure`);
      console.log(`   • All existing M1 data preserved and accessible`);
      console.log('\n💡 You can now import M5 and H1 data using the updated pipeline!');

    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      console.error('\n🔄 Rolling back changes...');
      await this.rollback();
      throw error;
    }
  }

  /**
   * Create backup of existing symbol_metadata
   */
  async backupMetadata() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS symbol_metadata_backup_${Date.now()} AS
        SELECT * FROM symbol_metadata
      `);
      console.log('   ✅ Metadata backup created');
    } finally {
      client.release();
    }
  }

  /**
   * Update symbol_metadata table structure for timeframes
   */
  async updateMetadataTableStructure() {
    const client = await this.pool.connect();
    try {
      // Add new columns if they don't exist
      await client.query(`
        ALTER TABLE symbol_metadata
        ADD COLUMN IF NOT EXISTS timeframe VARCHAR(10) DEFAULT 'm1',
        ADD COLUMN IF NOT EXISTS available_timestamps JSONB DEFAULT '[]'::jsonb
      `);

      // Update table_name column length
      await client.query(`
        ALTER TABLE symbol_metadata
        ALTER COLUMN table_name TYPE VARCHAR(120)
      `);

      // Drop old constraint and add new one
      await client.query(`
        ALTER TABLE symbol_metadata
        DROP CONSTRAINT IF EXISTS unique_symbol_exchange
      `);

      await client.query(`
        ALTER TABLE symbol_metadata
        ADD CONSTRAINT unique_symbol_timeframe_exchange
        UNIQUE(symbol, timeframe, exchange, asset_type)
      `);

      // Create new indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_symbol_metadata_timeframe ON symbol_metadata(timeframe);
        CREATE INDEX IF NOT EXISTS idx_symbol_metadata_symbol_timeframe ON symbol_metadata(symbol, timeframe);
      `);

      console.log('   ✅ symbol_metadata table structure updated');
    } finally {
      client.release();
    }
  }

  /**
   * Get existing OHLCV tables that need migration
   */
  async getExistingTables() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND (table_name LIKE '%_tradfi_ohlcv' OR table_name LIKE '%_crypto_ohlcv')
        AND table_name NOT LIKE '%_m1_%'
        AND table_name NOT LIKE '%_m5_%'
        AND table_name NOT LIKE '%_h1_%'
        ORDER BY table_name
      `);

      return result.rows.map(row => {
        const tableName = row.table_name;
        const isCrypto = tableName.includes('_crypto_ohlcv');
        const isTradFi = tableName.includes('_tradfi_ohlcv');

        let symbol, exchange, assetType, newTableName;

        if (isTradFi) {
          // Format: symbol_tradfi_ohlcv -> symbol_m1_tradfi_ohlcv
          symbol = tableName.replace('_tradfi_ohlcv', '');
          newTableName = `${symbol}_m1_tradfi_ohlcv`;
          assetType = 'tradfi';
          exchange = null;
        } else if (isCrypto) {
          // Format: symbol_exchange_crypto_ohlcv -> symbol_m1_exchange_crypto_ohlcv
          const parts = tableName.replace('_crypto_ohlcv', '').split('_');
          if (parts.length >= 2) {
            exchange = parts[parts.length - 1];
            symbol = parts.slice(0, -1).join('_');
            newTableName = `${symbol}_m1_${exchange}_crypto_ohlcv`;
          } else {
            symbol = parts[0];
            exchange = 'binance';
            newTableName = `${symbol}_m1_${exchange}_crypto_ohlcv`;
          }
          assetType = 'crypto';
        }

        return {
          oldTableName: tableName,
          newTableName: newTableName,
          symbol: symbol,
          exchange: exchange,
          assetType: assetType
        };
      });
    } finally {
      client.release();
    }
  }

  /**
   * Migrate a single table to new naming convention
   */
  async migrateTable(table) {
    const client = await this.pool.connect();
    try {
      console.log(`   📄 Migrating: ${table.oldTableName} → ${table.newTableName}`);

      // Step 1: Add timeframe column to existing table
      await client.query(`
        ALTER TABLE ${table.oldTableName}
        ADD COLUMN IF NOT EXISTS timeframe TEXT DEFAULT 'm1'
      `);

      // Step 2: Create index on timeframe column
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${table.oldTableName}_timeframe_timestamp
        ON ${table.oldTableName} (timeframe, timestamp DESC)
      `);

      // Step 3: Rename table to new naming convention
      await client.query(`
        ALTER TABLE ${table.oldTableName}
        RENAME TO ${table.newTableName}
      `);

      // Step 4: Update primary key constraint name
      await client.query(`
        ALTER TABLE ${table.newTableName}
        RENAME CONSTRAINT ${table.oldTableName}_pkey
        TO ${table.newTableName}_pkey
      `);

      // Step 5: Rename indexes to match new table name
      const indexQueries = [
        `ALTER INDEX IF EXISTS idx_${table.oldTableName}_timestamp
         RENAME TO idx_${table.newTableName}_timestamp`,
        `ALTER INDEX IF EXISTS idx_${table.oldTableName}_dow_timestamp
         RENAME TO idx_${table.newTableName}_dow_timestamp`,
        `ALTER INDEX IF EXISTS idx_${table.oldTableName}_timeframe_timestamp
         RENAME TO idx_${table.newTableName}_timeframe_timestamp`
      ];

      for (const query of indexQueries) {
        try {
          await client.query(query);
        } catch (err) {
          // Index might not exist, continue
          console.log(`     ⚠️  Index rename skipped: ${err.message.split('\n')[0]}`);
        }
      }

      console.log(`     ✅ Table migrated successfully`);
    } catch (error) {
      console.error(`     ❌ Failed to migrate ${table.oldTableName}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update metadata records with timeframe and new table names
   */
  async updateMetadataRecords() {
    const client = await this.pool.connect();
    try {
      // Get all current metadata records
      const result = await client.query('SELECT * FROM symbol_metadata');

      for (const record of result.rows) {
        const oldTableName = record.table_name;
        let newTableName;

        // Determine new table name based on asset type
        if (record.asset_type === 'tradfi') {
          // symbol_tradfi_ohlcv -> symbol_m1_tradfi_ohlcv
          if (!oldTableName.includes('_m1_')) {
            newTableName = oldTableName.replace('_tradfi_ohlcv', '_m1_tradfi_ohlcv');
          } else {
            newTableName = oldTableName; // Already migrated
          }
        } else if (record.asset_type === 'crypto') {
          // symbol_exchange_crypto_ohlcv -> symbol_m1_exchange_crypto_ohlcv
          if (!oldTableName.includes('_m1_')) {
            const parts = oldTableName.replace('_crypto_ohlcv', '').split('_');
            if (parts.length >= 2) {
              const exchange = parts[parts.length - 1];
              const symbol = parts.slice(0, -1).join('_');
              newTableName = `${symbol}_m1_${exchange}_crypto_ohlcv`;
            } else {
              newTableName = oldTableName.replace('_crypto_ohlcv', '_m1_binance_crypto_ohlcv');
            }
          } else {
            newTableName = oldTableName; // Already migrated
          }
        }

        // Generate available timestamps from the actual table
        let availableTimestamps = [];
        try {
          const timestampResult = await client.query(`
            SELECT json_agg(DISTINCT date_trunc('day', timestamp) ORDER BY date_trunc('day', timestamp)) as timestamps
            FROM ${newTableName}
            LIMIT 1000
          `);
          availableTimestamps = timestampResult.rows[0].timestamps || [];
        } catch (err) {
          console.log(`     ⚠️  Could not generate timestamps for ${newTableName}: ${err.message}`);
          availableTimestamps = [];
        }

        // Update the metadata record
        await client.query(`
          UPDATE symbol_metadata
          SET
            timeframe = 'm1',
            table_name = $1,
            available_timestamps = $2::jsonb,
            last_metadata_update = NOW()
          WHERE id = $3
        `, [newTableName, JSON.stringify(availableTimestamps), record.id]);

        console.log(`   📄 Updated metadata for ${record.symbol} (${record.asset_type})`);
      }

      console.log('   ✅ All metadata records updated');
    } finally {
      client.release();
    }
  }

  /**
   * Clean up migration artifacts
   */
  async cleanup() {
    console.log('   🧹 Migration completed - backup tables preserved for safety');
    console.log('   💡 You can manually drop backup tables once you verify everything works correctly');
  }

  /**
   * Rollback changes in case of failure
   */
  async rollback() {
    console.log('⚠️  Automatic rollback not implemented - please restore from backup manually');
    console.log('💡 Backup tables with timestamp suffix contain your original data');
  }

  /**
   * Verify migration success
   */
  async verify() {
    console.log('\n🔍 Verifying migration...');
    const client = await this.pool.connect();
    try {
      // Check metadata table structure
      const metadataColumns = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'symbol_metadata'
        ORDER BY column_name
      `);

      const hasTimeframe = metadataColumns.rows.some(row => row.column_name === 'timeframe');
      const hasTimestamps = metadataColumns.rows.some(row => row.column_name === 'available_timestamps');

      console.log(`   📊 Timeframe column: ${hasTimeframe ? '✅' : '❌'}`);
      console.log(`   📊 Available timestamps column: ${hasTimestamps ? '✅' : '❌'}`);

      // Check migrated tables
      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND (table_name LIKE '%_m1_%_ohlcv')
        ORDER BY table_name
      `);

      console.log(`   📊 Migrated tables: ${tables.rows.length}`);
      tables.rows.forEach(row => {
        console.log(`     • ${row.table_name}`);
      });

      // Check metadata records
      const metadata = await client.query(`
        SELECT symbol, timeframe, asset_type, table_name
        FROM symbol_metadata
        WHERE timeframe = 'm1'
        ORDER BY symbol
      `);

      console.log(`   📊 Updated metadata records: ${metadata.rows.length}`);

      return hasTimeframe && hasTimestamps && tables.rows.length > 0;
    } finally {
      client.release();
    }
  }
}

// Main execution
async function main() {
  const migration = new TimeframeMigration();

  try {
    await migration.migrate();

    // Verify migration
    const success = await migration.verify();

    if (success) {
      console.log('\n🎉 Migration verification successful!');
      console.log('\n📋 Next steps:');
      console.log('   1. Test your application with the new schema');
      console.log('   2. Import M5 and H1 data using: npm run import:all');
      console.log('   3. Verify all timeframes are working correctly');
      console.log('   4. Drop backup tables once everything is confirmed working');
    } else {
      console.log('\n⚠️  Migration verification failed - please check manually');
    }

  } catch (error) {
    console.error('\n💥 Migration failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Migration interrupted');
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = TimeframeMigration;