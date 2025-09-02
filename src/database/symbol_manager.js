/**
 * Symbol-Based Database Manager
 * Manages individual tables per symbol with metadata-driven operations
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { pool } = require('../config/database');
const config = require('../config/database_import');
const SymbolMetadataManager = require('./symbol_metadata_manager');

class SymbolDatabaseManager {
  constructor() {
    this.pool = pool;
    this.metadataManager = new SymbolMetadataManager();
  }

  /**
   * Initialize database schema and functions
   */
  async initializeSchema() {
    try {
      const schemaSQL = await fsPromises.readFile(
        path.join(__dirname, 'schema', 'symbol_based_ohlcv.sql'),
        'utf8'
      );
      
      await this.pool.query(schemaSQL);
      console.log('✅ Database schema and functions initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Get table name for a symbol
   */
  getTableName(symbol, assetType, exchange = null) {
    if (assetType === 'tradfi') {
      return `${symbol.toLowerCase()}_tradfi_ohlcv`;
    } else if (assetType === 'crypto') {
      const cleanSymbol = symbol.replace('/', '').toLowerCase();
      return `${cleanSymbol}_${exchange.toLowerCase()}_crypto_ohlcv`;
    } else {
      throw new Error(`Invalid asset type: ${assetType}`);
    }
  }

  /**
   * Create table for a specific symbol
   */
  async createSymbolTable(symbol, assetType, exchange = null) {
    const client = await this.pool.connect();
    
    try {
      if (assetType === 'tradfi') {
        await client.query('SELECT create_tradfi_ohlcv_table($1)', [symbol]);
      } else if (assetType === 'crypto') {
        await client.query('SELECT create_crypto_ohlcv_table($1, $2)', [symbol, exchange]);
      }
      
      const tableName = this.getTableName(symbol, assetType, exchange);
      console.log(`✅ Created table: ${tableName}`);
      
    } catch (error) {
      console.error(`❌ Failed to create table for ${symbol}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if table exists for symbol
   */
  async tableExists(symbol, assetType, exchange = null) {
    const tableName = this.getTableName(symbol, assetType, exchange);
    
    try {
      const result = await this.pool.query('SELECT table_exists($1)', [tableName]);
      return result.rows[0].table_exists;
    } catch (error) {
      console.error(`Failed to check table existence for ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Import all CSV files with symbol-specific tables
   */
  async importAllCSVFiles() {
    console.log('🔄 Importing CSV files to symbol-specific tables...\n');
    
    try {
      // Import TradFi CSV files
      const tradfiResults = await this.importTradFiCSVs();
      
      // Import Crypto CSV files  
      const cryptoResults = await this.importCryptoCSVs();
      
      // Generate metadata after import
      console.log('\n📄 Generating metadata files...');
      await this.metadataManager.generateAllMetadata();
      
      const totalInserted = tradfiResults.inserted + cryptoResults.inserted;
      const totalUpdated = tradfiResults.updated + cryptoResults.updated;
      
      console.log('\n📊 Import Summary:');
      console.log(`✅ Total inserted: ${totalInserted.toLocaleString()}`);
      console.log(`🔄 Total updated: ${totalUpdated.toLocaleString()}`);
      console.log(`📁 TradFi files: ${tradfiResults.files}`);
      console.log(`📁 Crypto files: ${cryptoResults.files}`);
      
      return { inserted: totalInserted, updated: totalUpdated };
      
    } catch (error) {
      console.error('❌ Failed to import CSV files:', error);
      throw error;
    }
  }

  /**
   * Import TradFi CSV files
   */
  async importTradFiCSVs() {
    return this.importCSVFiles('./data/tradfi', 'tradfi');
  }

  /**
   * Import Crypto CSV files
   */
  async importCryptoCSVs() {
    return this.importCSVFiles('./data/crypto', 'crypto');
  }

  /**
   * Generic method to import CSV files from a directory
   */
  async importCSVFiles(dirPath, type) {
    let totalInserted = 0;
    let totalUpdated = 0;
    let filesProcessed = 0;

    try {
      const files = await fsPromises.readdir(dirPath);
      const csvFiles = files.filter(f => f.endsWith('.csv'));
      
      const typeEmoji = type === 'tradfi' ? '📊' : '🪙';
      const typeName = type === 'tradfi' ? 'TradFi' : 'Crypto';
      
      console.log(`${typeEmoji} Found ${csvFiles.length} ${typeName} CSV files`);
      
      for (const filename of csvFiles) {
        const filePath = path.join(dirPath, filename);
        
        let symbol, exchange;
        if (type === 'tradfi') {
          symbol = this.extractSymbolFromFilename(filename, 'tradfi');
          exchange = null;
        } else {
          const cryptoInfo = this.extractCryptoInfo(filename);
          symbol = cryptoInfo.symbol;
          exchange = cryptoInfo.exchange;
        }
        
        const displayName = exchange ? `${symbol} on ${exchange}` : symbol;
        console.log(`📄 Processing: ${filename} (${displayName})`);
        
        // Create table if it doesn't exist
        if (!(await this.tableExists(symbol, type, exchange))) {
          await this.createSymbolTable(symbol, type, exchange);
        }
        
        const { inserted, updated } = await this.importCSVFile(filePath, symbol, exchange, type);
        totalInserted += inserted;
        totalUpdated += updated;
        filesProcessed++;
        
        console.log(`   ✅ ${inserted} inserted, ${updated} updated`);
      }
      
      return { inserted: totalInserted, updated: totalUpdated, files: filesProcessed };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📁 No ${type} data directory found`);
        return { inserted: 0, updated: 0, files: 0 };
      }
      throw error;
    }
  }

  /**
   * Import CSV file to symbol-specific table
   */
  async importCSVFile(filePath, symbol, exchange, type) {
    return new Promise((resolve, reject) => {
      let records = [];
      let rowCount = 0;
      let totalInserted = 0;
      let totalUpdated = 0;
      let streamBatchNumber = 0;
      
      console.log(`   📊 Starting to read CSV file...`);
      
      const processStreamBatch = async () => {
        if (records.length === 0) return { inserted: 0, updated: 0 };
        
        streamBatchNumber++;
        console.log(`   💾 Processing stream batch ${streamBatchNumber} (${records.length} records)...`);
        
        const result = await this.insertRecordsBatched(records, symbol, type, exchange);
        totalInserted += result.inserted;
        totalUpdated += result.updated;
        
        records = []; // Clear the batch
        return result;
      };
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', async (row) => {
          // Data validation if enabled
          if (config.VALIDATE_NUMBERS && !this.isValidRecord(row)) {
            if (config.SKIP_MALFORMED_RECORDS) {
              return; // Skip this record
            }
          }

          const timestamp = new Date(row.timestamp);
          const dayOfWeek = this.getDayOfWeek(timestamp);

          const record = {
            timestamp: timestamp,
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
            volume: row.volume ? parseFloat(row.volume) : null,
            day_of_week: dayOfWeek
          };
          
          records.push(record);
          rowCount++;
          
          // Show progress
          if (rowCount % config.PROGRESS_INTERVAL === 0) {
            console.log(`   📈 Parsed ${rowCount.toLocaleString()} rows...`);
          }

          // Process stream batch when it gets large enough (memory management)
          if (config.ENABLE_STREAMING && records.length >= config.STREAM_BATCH_SIZE) {
            try {
              await processStreamBatch();
            } catch (error) {
              console.error('   ❌ Failed to process stream batch:', error.message);
            }
          }
        })
        .on('end', async () => {
          try {
            console.log(`   ✅ Finished parsing ${rowCount.toLocaleString()} rows`);
            
            // Process any remaining records
            if (records.length > 0) {
              console.log(`   💾 Processing final batch (${records.length} records)...`);
              await processStreamBatch();
            }
            
            console.log(`   🎉 Complete: ${totalInserted} inserted, ${totalUpdated} updated`);
            resolve({ inserted: totalInserted, updated: totalUpdated });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Insert records to specific symbol table
   */
  async insertRecordsBatched(records, symbol, assetType, exchange = null) {
    const BATCH_SIZE = config.INSERT_BATCH_SIZE;
    let totalInserted = 0;
    let totalUpdated = 0;
    let failedBatches = 0;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
    const tableName = this.getTableName(symbol, assetType, exchange);

    const startTime = Date.now();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      try {
        const batchStart = Date.now();
        const { inserted, updated } = await this.insertBatch(batch, tableName);
        const batchTime = Date.now() - batchStart;
        
        totalInserted += inserted;
        totalUpdated += updated;
        
        // Performance monitoring
        if (batchTime > config.SLOW_BATCH_THRESHOLD) {
          console.log(`     ⚠️  Slow batch ${batchNum}: ${batchTime}ms`);
        }
        
        // Show progress
        if (batchNum % config.STATS_INTERVAL === 0 || batchNum === totalBatches) {
          const progress = ((batchNum / totalBatches) * 100).toFixed(1);
          console.log(`     📦 Batch ${batchNum}/${totalBatches} (${progress}%): ${inserted} inserted, ${updated} updated`);
        }
        
      } catch (error) {
        failedBatches++;
        console.error(`     ❌ Failed batch ${batchNum}:`, error.message);
        
        // Check if we should continue or stop
        if (config.CONTINUE_ON_BATCH_FAILURE) {
          if (failedBatches >= config.MAX_FAILED_BATCHES) {
            console.error(`     🚫 Too many failed batches (${failedBatches}), stopping import`);
            break;
          }
          console.log(`     ⏭️  Continuing with next batch...`);
        } else {
          throw error;
        }
      }
    }

    if (config.ENABLE_TIMING_LOGS && totalBatches > 1) {
      const totalTime = Date.now() - startTime;
      console.log(`     ⏱️  Batch processing time: ${totalTime}ms (${(totalTime/totalBatches).toFixed(0)}ms/batch avg)`);
    }

    return { inserted: totalInserted, updated: totalUpdated, failedBatches };
  }

  /**
   * Insert batch into specific table
   */
  async insertBatch(batch, tableName) {
    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO ${tableName} (timestamp, open, high, low, close, volume, day_of_week)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (timestamp) 
        DO UPDATE SET 
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          day_of_week = EXCLUDED.day_of_week
        RETURNING (xmax = 0) AS inserted
      `;

      for (const record of batch) {
        const values = [
          record.timestamp,
          record.open,
          record.high,
          record.low,
          record.close,
          record.volume,
          record.day_of_week
        ];

        const result = await client.query(insertQuery, values);
        if (result.rows[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
      }

      await client.query('COMMIT');
      return { inserted, updated };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get day of week from timestamp
   */
  getDayOfWeek(timestamp) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[timestamp.getDay()];
  }

  /**
   * Validate record data
   */
  isValidRecord(record) {
    const { open, high, low, close, timestamp } = record;
    
    // Check for required numeric fields
    const prices = [open, high, low, close].map(p => parseFloat(p));
    if (prices.some(p => isNaN(p) || p < 0)) {
      return false;
    }
    
    // Check max price value
    if (prices.some(p => p > config.MAX_PRICE_VALUE)) {
      return false;
    }
    
    // Validate timestamp if enabled
    if (config.SKIP_INVALID_TIMESTAMPS) {
      const ts = new Date(timestamp);
      if (isNaN(ts.getTime())) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Extract symbol from filename
   */
  extractSymbolFromFilename(filename, type) {
    if (type === 'tradfi') {
      // TradFi: deuidxeur_m1_2025-08-20_to_2025-08-22.csv
      return filename.split('_')[0];
    }
    
    // Crypto: BTC_USDT_1m_2025-08-20_to_2025-08-22.csv  
    const parts = filename.replace('.csv', '').split('_');
    return `${parts[0]}/${parts[1]}`;
  }

  /**
   * Extract crypto symbol and exchange info
   */
  extractCryptoInfo(filename) {
    // BTC_USDT_1m_2025-08-20_to_2025-08-22.csv
    const parts = filename.replace('.csv', '').split('_');
    return {
      symbol: `${parts[0]}/${parts[1]}`,
      exchange: 'binance' // Default exchange
    };
  }
}

module.exports = SymbolDatabaseManager;