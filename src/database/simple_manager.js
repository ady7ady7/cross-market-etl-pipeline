/**
 * Simple Database Manager
 * Uses existing CSV data from your current importers
 * Handles deduplication and metadata generation
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
    const tradfiPath = './data/tradfi';
    let totalInserted = 0;
    let totalUpdated = 0;
    let filesProcessed = 0;

    try {
      const files = await fsPromises.readdir(tradfiPath);
      const csvFiles = files.filter(f => f.endsWith('.csv'));
      
      console.log(`📊 Found ${csvFiles.length} TradFi CSV files`);
      
      for (const filename of csvFiles) {
        const filePath = path.join(tradfiPath, filename);
        const symbol = this.extractSymbolFromFilename(filename, 'tradfi');
        
        console.log(`📄 Processing: ${filename} (${symbol})`);
        
        const { inserted, updated } = await this.importTradFiCSV(filePath, symbol);
        totalInserted += inserted;
        totalUpdated += updated;
        filesProcessed++;
        
        console.log(`   ✅ ${inserted} inserted, ${updated} updated`);
      }
      
      return { inserted: totalInserted, updated: totalUpdated, files: filesProcessed };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 No TradFi data directory found');
        return { inserted: 0, updated: 0, files: 0 };
      }
      throw error;
    }
  }

  /**
   * Import single TradFi CSV file with streaming and progress
   */
  async importTradFiCSV(filePath, symbol) {
    return new Promise((resolve, reject) => {
      const records = [];
      let rowCount = 0;
      
      console.log(`   📊 Starting to read CSV file...`);
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Data validation if enabled
          if (config.VALIDATE_NUMBERS && !this.isValidRecord(row)) {
            if (config.SKIP_MALFORMED_RECORDS) {
              return; // Skip this record
            }
          }

          records.push({
            symbol: symbol,
            timestamp: new Date(row.timestamp),
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
            volume: row.volume ? parseFloat(row.volume) : null
          });
          
          rowCount++;
          
          // Show progress based on config
          if (rowCount % config.PROGRESS_INTERVAL === 0) {
            console.log(`   📈 Parsed ${rowCount.toLocaleString()} rows...`);
          }

          // Memory management
          if (rowCount >= config.MAX_RECORDS_IN_MEMORY) {
            console.log(`   ⚠️  Reached memory limit (${config.MAX_RECORDS_IN_MEMORY}), processing batch...`);
          }
        })
        .on('end', async () => {
          try {
            console.log(`   ✅ Finished parsing ${rowCount.toLocaleString()} rows`);
            console.log(`   💾 Starting database insertion...`);
            
            const result = await this.insertTradFiRecordsBatched(records, symbol);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Insert TradFi records in batches with progress
   */
  async insertTradFiRecordsBatched(records, symbol) {
    const BATCH_SIZE = config.INSERT_BATCH_SIZE;
    let totalInserted = 0;
    let totalUpdated = 0;
    let failedBatches = 0;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    console.log(`   🔄 Processing ${records.length.toLocaleString()} records in ${totalBatches} batches (size: ${BATCH_SIZE})...`);

    const startTime = Date.now();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      try {
        const batchStart = Date.now();
        const { inserted, updated } = await this.insertTradFiBatch(batch);
        const batchTime = Date.now() - batchStart;
        
        totalInserted += inserted;
        totalUpdated += updated;
        
        // Performance monitoring
        if (batchTime > config.SLOW_BATCH_THRESHOLD) {
          console.log(`   ⚠️  Slow batch ${batchNum}: ${batchTime}ms`);
        }
        
        // Show progress
        if (batchNum % config.STATS_INTERVAL === 0 || batchNum === totalBatches) {
          const progress = ((batchNum / totalBatches) * 100).toFixed(1);
          console.log(`   📦 Batch ${batchNum}/${totalBatches} (${progress}%): ${inserted} inserted, ${updated} updated`);
        }
        
      } catch (error) {
        failedBatches++;
        console.error(`   ❌ Failed batch ${batchNum}:`, error.message);
        
        // Check if we should continue or stop
        if (config.CONTINUE_ON_BATCH_FAILURE) {
          if (failedBatches >= config.MAX_FAILED_BATCHES) {
            console.error(`   🚫 Too many failed batches (${failedBatches}), stopping import`);
            break;
          }
          console.log(`   ⏭️  Continuing with next batch...`);
        } else {
          throw error;
        }
      }
    }

    if (config.ENABLE_TIMING_LOGS) {
      const totalTime = Date.now() - startTime;
      console.log(`   ⏱️  Total processing time: ${totalTime}ms (${(totalTime/totalBatches).toFixed(0)}ms/batch avg)`);
    }

    return { inserted: totalInserted, updated: totalUpdated, failedBatches };
  }

  /**
   * Insert a single batch of TradFi records
   */
  async insertTradFiBatch(batch) {
    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      const insertQuery = `
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

      for (const record of batch) {
        const values = [
          record.symbol,
          record.timestamp,
          record.open,
          record.high,
          record.low,
          record.close,
          record.volume
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
   * Import Crypto CSV files
   */
  async importCryptoCSVs() {
    const cryptoPath = './data/crypto';
    let totalInserted = 0;
    let totalUpdated = 0;
    let filesProcessed = 0;

    try {
      const files = await fsPromises.readdir(cryptoPath);
      const csvFiles = files.filter(f => f.endsWith('.csv'));
      
      console.log(`🪙 Found ${csvFiles.length} Crypto CSV files`);
      
      for (const filename of csvFiles) {
        const filePath = path.join(cryptoPath, filename);
        const { symbol, exchange } = this.extractCryptoInfo(filename);
        
        console.log(`📄 Processing: ${filename} (${symbol} on ${exchange})`);
        
        const { inserted, updated } = await this.importCryptoCSV(filePath, symbol, exchange);
        totalInserted += inserted;
        totalUpdated += updated;
        filesProcessed++;
        
        console.log(`   ✅ ${inserted} inserted, ${updated} updated`);
      }
      
      return { inserted: totalInserted, updated: totalUpdated, files: filesProcessed };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 No Crypto data directory found');
        return { inserted: 0, updated: 0, files: 0 };
      }
      throw error;
    }
  }

  /**
   * Import single Crypto CSV file
   */
  async importCryptoCSV(filePath, symbol, exchange) {
    return new Promise((resolve, reject) => {
      const records = [];
      let rowCount = 0;
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Data validation if enabled
          if (config.VALIDATE_NUMBERS && !this.isValidRecord(row)) {
            if (config.SKIP_MALFORMED_RECORDS) {
              return;
            }
          }

          records.push({
            symbol: symbol,
            exchange: exchange,
            timestamp: new Date(row.timestamp),
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
            volume: row.volume ? parseFloat(row.volume) : null
          });
          
          rowCount++;
          
          if (rowCount % config.PROGRESS_INTERVAL === 0) {
            console.log(`   📈 Parsed ${rowCount.toLocaleString()} rows...`);
          }
        })
        .on('end', async () => {
          try {
            console.log(`   ✅ Finished parsing ${rowCount.toLocaleString()} rows`);
            const result = await this.insertCryptoRecords(records);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Insert Crypto records with deduplication
   */
  async insertCryptoRecords(records) {
    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      const insertQuery = `
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

      for (const record of records) {
        const values = [
          record.symbol,
          record.exchange,
          record.timestamp,
          record.open,
          record.high,
          record.low,
          record.close,
          record.volume
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
   * Extract symbol from TradFi filename
   */
  extractSymbolFromFilename(filename, type) {
    // TradFi: deuidxeur_m1_2025-08-20_to_2025-08-22.csv
    if (type === 'tradfi') {
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