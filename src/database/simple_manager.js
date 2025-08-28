/**
 * Simple Database Manager
 * Uses existing CSV data from your current importers
 * Handles deduplication and metadata generation with streaming
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { pool } = require('../config/database');
const config = require('../config/database_import');
const MetadataManager = require('./metadata_manager');

class SimpleDatabaseManager {
  constructor() {
    this.pool = pool;
    this.metadataManager = new MetadataManager();
  }

  /**
   * Initialize database schema
   */
  async initializeSchema() {
    try {
      const schemaSQL = await fsPromises.readFile(
        path.join(__dirname, 'schema', 'simple_ohlcv.sql'),
        'utf8'
      );
      
      await this.pool.query(schemaSQL);
      console.log('✅ Database schema initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Import all CSV files from your existing ETL pipeline
   */
  async importAllCSVFiles() {
    console.log('🔄 Importing CSV files to database...\n');
    
    try {
      // Import TradFi CSV files
      const tradfiResults = await this.importTradFiCSVs();
      
      // Import Crypto CSV files  
      const cryptoResults = await this.importCryptoCSVs();
      
      // Generate metadata after import
      console.log('📄 Generating metadata files...');
      await this.metadataManager.generateAllMetadata();
      
      const totalInserted = tradfiResults.inserted + cryptoResults.inserted;
      const totalUpdated = tradfiResults.updated + cryptoResults.updated;
      
      console.log('\n📊 Import Summary:');
      console.log(`✅ Total inserted: ${totalInserted}`);
      console.log(`🔄 Total updated: ${totalUpdated}`);
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
   * Generic CSV import with streaming and batch processing
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
        
        const result = await this.insertRecordsBatched(records, type);
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

          const record = {
            symbol: symbol,
            timestamp: new Date(row.timestamp),
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
            volume: row.volume ? parseFloat(row.volume) : null
          };
          
          if (exchange) {
            record.exchange = exchange;
          }
          
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
   * Generic batch insert method for both TradFi and Crypto
   */
  async insertRecordsBatched(records, type) {
    const BATCH_SIZE = config.INSERT_BATCH_SIZE;
    let totalInserted = 0;
    let totalUpdated = 0;
    let failedBatches = 0;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    const startTime = Date.now();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      try {
        const batchStart = Date.now();
        const { inserted, updated } = await this.insertBatch(batch, type);
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
   * Generic batch insert method for database operations
   */
  async insertBatch(batch, type) {
    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      let insertQuery;
      if (type === 'tradfi') {
        insertQuery = `
          INSERT INTO tradfi_ohlcv (symbol, timestamp, open, high, low, close, volume)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (symbol, timestamp) 
          DO UPDATE SET 
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
          RETURNING (xmax = 0) AS inserted
        `;
      } else {
        insertQuery = `
          INSERT INTO crypto_ohlcv (symbol, exchange, timestamp, open, high, low, close, volume)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (symbol, exchange, timestamp) 
          DO UPDATE SET 
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
          RETURNING (xmax = 0) AS inserted
        `;
      }

      for (const record of batch) {
        let values;
        if (type === 'tradfi') {
          values = [
            record.symbol,
            record.timestamp,
            record.open,
            record.high,
            record.low,
            record.close,
            record.volume
          ];
        } else {
          values = [
            record.symbol,
            record.exchange,
            record.timestamp,
            record.open,
            record.high,
            record.low,
            record.close,
            record.volume
          ];
        }

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

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      const queries = {
        tradfi: `
          SELECT 
            symbol,
            COUNT(*) as record_count,
            MIN(timestamp) as first_timestamp,
            MAX(timestamp) as last_timestamp
          FROM tradfi_ohlcv 
          GROUP BY symbol
        `,
        crypto: `
          SELECT 
            symbol,
            exchange,
            COUNT(*) as record_count,
            MIN(timestamp) as first_timestamp,
            MAX(timestamp) as last_timestamp
          FROM crypto_ohlcv 
          GROUP BY symbol, exchange
        `
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        const result = await this.pool.query(query);
        results[key] = result.rows;
      }

      return results;
    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    }
  }
}

module.exports = SimpleDatabaseManager;