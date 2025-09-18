/**
 * Metadata-Driven Weekly Scheduler
 * Reads symbols from database, not config.json
 * src/services/metadata_scheduler.js
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pool, testConnection } = require('../config/database');

class MetadataScheduler {
  constructor() {
    this.isRunning = false;
    this.runCount = 0;
  }

  /**
   * Start the weekly scheduler
   */
  async start() {
    console.log('🚀 Starting Metadata-Driven Weekly ETL Scheduler');
    console.log('📅 Current time:', new Date().toISOString());
    console.log('⏰ Schedule: Every Sunday at 4:00 AM UTC');
    console.log('🗄️  Uses: Database symbol_metadata (NOT config.json)\n');

    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    // Weekly run every Sunday at 4:00 AM UTC
    cron.schedule('0 4 * * 0', async () => {
      await this.runMetadataDrivenETL();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('✅ Scheduler started. Press Ctrl+C to stop.\n');
    
    // Keep process alive
    setInterval(() => {}, 60000);
  }

  /**
   * Run ETL based on database metadata
   */
  async runMetadataDrivenETL() {
    if (this.isRunning) {
      console.log('⚠️ ETL already running, skipping');
      return;
    }

    this.isRunning = true;
    this.runCount++;
    console.log('\n🔄 Starting Metadata-Driven ETL Run');
    console.log('📅 Time:', new Date().toISOString());
    console.log(`🔢 Run count: ${this.runCount}`);

    try {
      // 1. Update metadata BEFORE ETL (check current state)
      console.log('\n1️⃣ Updating metadata before ETL...');
      await this.updateAllMetadata();

      // 2. Read symbols from database metadata
      console.log('\n2️⃣ Reading symbols from database metadata...');
      const symbolsData = await this.getSymbolsFromMetadata();
      
      if (symbolsData.tradfi.length === 0 && symbolsData.crypto.length === 0) {
        console.log('❌ No symbols found in metadata - cannot proceed');
        return;
      }

      console.log(`📊 Found ${symbolsData.tradfi.length} TradFi symbols, ${symbolsData.crypto.length} Crypto symbols`);

      // 3. Calculate date ranges per symbol type
      const dateRanges = await this.calculateDateRanges(symbolsData);
      
      // 4. Run TradFi ETL if we have TradFi symbols
      if (symbolsData.tradfi.length > 0) {
        console.log('\n3️⃣ Running TradFi ETL...');
        const tradfiSuccess = await this.runTradFiETL(symbolsData.tradfi, dateRanges.tradfi);
        console.log(`📊 TradFi ETL: ${tradfiSuccess ? '✅' : '❌'}`);
      }

      // 5. Run Crypto ETL if we have Crypto symbols
      if (symbolsData.crypto.length > 0) {
        console.log('\n4️⃣ Running Crypto ETL...');
        const cryptoSuccess = await this.runCryptoETL(symbolsData.crypto, dateRanges.crypto);
        console.log(`🪙 Crypto ETL: ${cryptoSuccess ? '✅' : '❌'}`);
      }

      // 6. Import to database
      console.log('\n5️⃣ Importing to database...');
      const dbSuccess = await this.runDatabaseImport();
      console.log(`💾 Database import: ${dbSuccess ? '✅' : '❌'}`);

      // 7. Update metadata AFTER ETL (reflect new data)
      console.log('\n6️⃣ Updating metadata after ETL...');
      await this.updateAllMetadata();

      console.log('\n✅ Metadata-driven ETL completed');

    } catch (error) {
      console.error('❌ Metadata-driven ETL error:', error.message);
    } finally {
      this.isRunning = false;
      console.log(`🏁 ETL run finished: ${new Date().toISOString()}\n`);
    }
  }

  /**
   * Get symbols from database metadata (not config.json)
   */
  async getSymbolsFromMetadata() {
    const client = await pool.connect();
    
    try {
      const metadataQuery = `
        SELECT 
          symbol,
          asset_type,
          exchange,
          last_available_timestamp,
          total_records,
          can_update_from
        FROM symbol_metadata 
        ORDER BY asset_type, symbol
      `;

      const result = await client.query(metadataQuery);
      
      const tradfiSymbols = [];
      const cryptoSymbols = [];

      console.log('\n📋 Symbol Metadata Analysis:');
      
      result.rows.forEach(row => {
        // Show 2 key values per symbol as requested
        console.log(`   ${row.symbol} (${row.asset_type}): Records=${row.total_records}, Last=${row.last_available_timestamp?.toISOString().split('T')[0] || 'None'}`);
        
        if (row.asset_type === 'tradfi') {
          tradfiSymbols.push({
            symbol: row.symbol,
            name: row.symbol.toUpperCase(), // Generate name from symbol
            lastTimestamp: row.last_available_timestamp,
            canUpdateFrom: row.can_update_from,
            totalRecords: row.total_records
          });
        } else if (row.asset_type === 'crypto') {
          cryptoSymbols.push({
            symbol: row.symbol,
            name: row.symbol,
            exchange: row.exchange || 'binance',
            lastTimestamp: row.last_available_timestamp,
            canUpdateFrom: row.can_update_from,
            totalRecords: row.total_records
          });
        }
      });

      return {
        tradfi: tradfiSymbols,
        crypto: cryptoSymbols
      };

    } finally {
      client.release();
    }
  }

  /**
   * Calculate date ranges based on metadata
   */
  async calculateDateRanges(symbolsData) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // For TradFi: find oldest last_available_timestamp
    let tradfiStartDate;
    if (symbolsData.tradfi.length > 0) {
      const oldestTradfi = symbolsData.tradfi.reduce((oldest, symbol) => 
        (!oldest.lastTimestamp || (symbol.lastTimestamp && symbol.lastTimestamp < oldest.lastTimestamp)) 
          ? symbol : oldest
      );
      
      if (oldestTradfi.lastTimestamp) {
        tradfiStartDate = new Date(oldestTradfi.lastTimestamp);
        tradfiStartDate.setDate(tradfiStartDate.getDate() - 3); // 3-day overlap
      } else {
        tradfiStartDate = new Date(yesterday);
        tradfiStartDate.setDate(tradfiStartDate.getDate() - 10); // Default 10 days
      }
    }

    // For Crypto: find oldest last_available_timestamp
    let cryptoStartDate;
    if (symbolsData.crypto.length > 0) {
      const oldestCrypto = symbolsData.crypto.reduce((oldest, symbol) => 
        (!oldest.lastTimestamp || (symbol.lastTimestamp && symbol.lastTimestamp < oldest.lastTimestamp)) 
          ? symbol : oldest
      );
      
      if (oldestCrypto.lastTimestamp) {
        cryptoStartDate = new Date(oldestCrypto.lastTimestamp);
        cryptoStartDate.setDate(cryptoStartDate.getDate() - 3); // 3-day overlap
      } else {
        cryptoStartDate = new Date(yesterday);
        cryptoStartDate.setDate(cryptoStartDate.getDate() - 10); // Default 10 days
      }
    }

    const dateRanges = {
      tradfi: tradfiStartDate ? {
        from: tradfiStartDate.toISOString().split('T')[0],
        to: yesterday.toISOString().split('T')[0]
      } : null,
      crypto: cryptoStartDate ? {
        from: cryptoStartDate.toISOString().split('T')[0],
        to: yesterday.toISOString().split('T')[0]
      } : null
    };

    console.log('\n📅 Calculated Date Ranges:');
    if (dateRanges.tradfi) {
      console.log(`   📊 TradFi: ${dateRanges.tradfi.from} → ${dateRanges.tradfi.to}`);
    }
    if (dateRanges.crypto) {
      console.log(`   🪙 Crypto: ${dateRanges.crypto.from} → ${dateRanges.crypto.to}`);
    }

    return dateRanges;
  }

  /**
   * Run TradFi ETL with specific symbols and date range
   */
  async runTradFiETL(tradfiSymbols, dateRange) {
    // Create temporary config for TradFi
    const tradfiConfig = {
      assets: { tradfi: tradfiSymbols },
      dateRanges: { default: dateRange },
      tradfi: {
        timeframe: "m1",
        batchSize: 5,
        pauseBetweenBatchesMs: 5000
      }
    };

    const tempConfigPath = path.join(__dirname, '../../temp_tradfi_config.json');
    fs.writeFileSync(tempConfigPath, JSON.stringify(tradfiConfig, null, 2));

    try {
      console.log(`📊 Running TradFi import for ${tradfiSymbols.length} symbols...`);
      
      const result = await this.runCommand('node', [
        'src/etl/dukascopy_importer.js'
      ], {
        CONFIG_PATH: tempConfigPath
      });

      return result.success;

    } finally {
      // Cleanup temp config
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
    }
  }

  /**
   * Run Crypto ETL with specific symbols and date range
   */
  async runCryptoETL(cryptoSymbols, dateRange) {
    // Set environment variables for crypto importer
    const env = {
      ...process.env,
      ETL_CRYPTO_SYMBOLS: JSON.stringify(cryptoSymbols),
      ETL_CRYPTO_START_DATE: dateRange.from,
      ETL_CRYPTO_END_DATE: dateRange.to
    };

    console.log(`🪙 Running Crypto import for ${cryptoSymbols.length} symbols...`);
    
    const result = await this.runCommand('python3', [
      'src/etl/crypto_importer.py'
    ], env);

    return result.success;
  }

  /**
   * Update all metadata (before and after ETL)
   */
  async updateAllMetadata() {
    try {
      const SymbolMetadataManager = require('../database/symbol_metadata_manager');
      const metadataManager = new SymbolMetadataManager();
      await metadataManager.generateAllMetadata();
      console.log('✅ Metadata updated successfully');
    } catch (error) {
      console.error('❌ Metadata update failed:', error.message);
    }
  }

  /**
   * Run database import
   */
  async runDatabaseImport() {
    const result = await this.runCommand('node', ['scripts/import_to_database.js']);
    return result.success;
  }

  /**
   * Run a command with environment variables
   */
  async runCommand(command, args, env = {}) {
    return new Promise((resolve) => {
      const childProcess = spawn(command, args, {  // ← Renamed to avoid conflict
        stdio: 'inherit',
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, ...env }  // ← Now 'process' correctly refers to global
      });

      childProcess.on('close', (code) => {
        resolve({ success: code === 0, code });
      });

      childProcess.on('error', (error) => {
        console.error(`❌ Command error (${command} ${args.join(' ')}):`, error);
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * Test the scheduler (run once)
   */
  async runOnce() {
    console.log('🔄 Running metadata-driven ETL once...');
    await this.runMetadataDrivenETL();
    process.exit(0);
  }

  /**
   * Test metadata reading
   */
  async testMetadata() {
    console.log('🧪 Testing metadata reading...\n');

    try {
      const connected = await testConnection();
      console.log(`Database: ${connected ? '✅' : '❌'}`);

      const symbolsData = await this.getSymbolsFromMetadata();
      console.log(`\nFound ${symbolsData.tradfi.length} TradFi + ${symbolsData.crypto.length} Crypto symbols`);

      const dateRanges = await this.calculateDateRanges(symbolsData);
      console.log('\nDate ranges calculated successfully');

      console.log('\n✅ Metadata test completed');

    } catch (error) {
      console.error('\n❌ Metadata test failed:', error);
    }
  }
}

// Main execution
async function main() {
  const scheduler = new MetadataScheduler();
  const args = process.argv.slice(2);

  if (args.includes('--test-metadata')) {
    await scheduler.testMetadata();
  } else if (args.includes('--run-once')) {
    await scheduler.runOnce();
  } else {
    await scheduler.start();
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Received shutdown signal');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MetadataScheduler;