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

const DatabaseMetadataManager = require('./db_metadata_manager');

class SymbolDatabaseManager {
  constructor() {
    this.pool = pool;
    this.metadataManager = new SymbolMetadataManager(); // Keep for backward compatibility
    this.dbMetadataManager = new DatabaseMetadataManager(); // New database-based metadata
  }

  /**
   * Initialize database schema and functions
   */
  async initializeSchema() {
    try {
      // Initialize OHLCV tables schema
      const schemaSQL = await fsPromises.readFile(
        path.join(__dirname, 'schema', 'symbol_based_ohlcv.sql'),
        'utf8'
      );
      await this.pool.query(schemaSQL);
      
      // Initialize metadata schema
      await this.dbMetadataManager.initializeMetadataSchema();
      
      console.log('✅ Database schema and functions initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Get table name for a symbol with timeframe
   */
  getTableName(symbol, assetType, timeframe = 'm1', exchange = null) {
    if (assetType === 'tradfi') {
      return `${symbol.toLowerCase()}_${timeframe.toLowerCase()}_tradfi_ohlcv`;
    } else if (assetType === 'crypto') {
      const cleanSymbol = symbol.replace('/', '').toLowerCase();
      return `${cleanSymbol}_${timeframe.toLowerCase()}_${exchange.toLowerCase()}_crypto_ohlcv`;
    } else {
      throw new Error(`Invalid asset type: ${assetType}`);
    }
  }

  /**
   * Create table for a specific symbol and timeframe
   */
  async createSymbolTable(symbol, assetType, timeframe = 'm1', exchange = null) {
    const client = await this.pool.connect();

    try {
      if (assetType === 'tradfi') {
        await client.query('SELECT create_tradfi_ohlcv_table($1, $2)', [symbol, timeframe]);
      } else if (assetType === 'crypto') {
        await client.query('SELECT create_crypto_ohlcv_table($1, $2, $3)', [symbol, exchange, timeframe]);
      }

      const tableName = this.getTableName(symbol, assetType, timeframe, exchange);
      console.log(`✅ Created table: ${tableName}`);

      // Create metadata record for this table
      await this.dbMetadataManager.upsertSymbolMetadata(symbol, tableName, assetType, exchange, timeframe);

    } catch (error) {
      console.error(`❌ Failed to create table for ${symbol} (${timeframe}):`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if table exists for symbol and timeframe
   */
  async tableExists(symbol, assetType, timeframe = 'm1', exchange = null) {
    const tableName = this.getTableName(symbol, assetType, timeframe, exchange);

    try {
      const result = await this.pool.query('SELECT table_exists($1)', [tableName]);
      return result.rows[0].table_exists;
    } catch (error) {
      console.error(`Failed to check table existence for ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Import all CSV files with symbol-specific tables for all timeframes
   */
  async importAllCSVFiles() {
    console.log('🔄 Importing CSV files to symbol-specific tables for all timeframes...\n');

    try {
      const config = require('../../config.json');
      const timeframes = config.timeframes || ['m1'];

      let totalResults = { inserted: 0, updated: 0, files: 0 };

      // Import for each timeframe
      for (const timeframe of timeframes) {
        console.log(`\n📊 Processing timeframe: ${timeframe.toUpperCase()}`);

        // Import TradFi CSV files for this timeframe
        const tradfiResults = await this.importTradFiCSVs(timeframe);

        // Import Crypto CSV files for this timeframe
        const cryptoResults = await this.importCryptoCSVs(timeframe);

        totalResults.inserted += tradfiResults.inserted + cryptoResults.inserted;
        totalResults.updated += tradfiResults.updated + cryptoResults.updated;
        totalResults.files += tradfiResults.files + cryptoResults.files;

        console.log(`✅ ${timeframe.toUpperCase()}: ${(tradfiResults.inserted + cryptoResults.inserted).toLocaleString()} inserted, ${(tradfiResults.updated + cryptoResults.updated).toLocaleString()} updated`);
      }

      // Generate metadata after import
      console.log('\n📄 Generating metadata files...');
      await this.metadataManager.generateAllMetadata();

      console.log('\n📊 Total Import Summary (All Timeframes):');
      console.log(`✅ Total inserted: ${totalResults.inserted.toLocaleString()}`);
      console.log(`🔄 Total updated: ${totalResults.updated.toLocaleString()}`);
      console.log(`📁 Total files processed: ${totalResults.files}`);
      console.log(`⏱️  Timeframes processed: ${timeframes.join(', ')}`);

      return totalResults;

    } catch (error) {
      console.error('❌ Failed to import CSV files:', error);
      throw error;
    }
  }

  /**
   * Import TradFi CSV files for specific timeframe
   */
  async importTradFiCSVs(timeframe = 'm1') {
    return this.importCSVFiles(`./data/tradfi`, 'tradfi', timeframe);
  }

  /**
   * Import Crypto CSV files for specific timeframe
   */
  async importCryptoCSVs(timeframe = 'm1') {
    return this.importCSVFiles(`./data/crypto`, 'crypto', timeframe);
  }

  /**
   * Generic method to import CSV files from a directory for specific timeframe
   */
  async importCSVFiles(dirPath, type, timeframe) {
    let totalInserted = 0;
    let totalUpdated = 0;
    let filesProcessed = 0;

    try {
      // Look for timeframe-specific directory first, then fallback to main directory
      const timeframePath = path.join(dirPath, timeframe);
      let actualPath = dirPath;

      try {
        await fsPromises.access(timeframePath);
        actualPath = timeframePath;
        console.log(`📁 Using timeframe-specific directory: ${timeframePath}`);
      } catch {
        console.log(`📁 Using main directory: ${dirPath} (no ${timeframe} subdirectory found)`);
      }

      const files = await fsPromises.readdir(actualPath);
      const csvFiles = files.filter(f => f.endsWith('.csv') && f.includes(timeframe));

      const typeEmoji = type === 'tradfi' ? '📊' : '🪙';
      const typeName = type === 'tradfi' ? 'TradFi' : 'Crypto';

      console.log(`${typeEmoji} Found ${csvFiles.length} ${typeName} CSV files for ${timeframe.toUpperCase()}`);

      for (const filename of csvFiles) {
        const filePath = path.join(actualPath, filename);

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
        console.log(`📄 Processing: ${filename} (${displayName}, ${timeframe.toUpperCase()})`);

        // Create table if it doesn't exist
        if (!(await this.tableExists(symbol, type, timeframe, exchange))) {
          await this.createSymbolTable(symbol, type, timeframe, exchange);
        }

        const { inserted, updated } = await this.importCSVFile(filePath, symbol, exchange, type, timeframe);
        totalInserted += inserted;
        totalUpdated += updated;
        filesProcessed++;

        console.log(`   ✅ ${inserted} inserted, ${updated} updated`);
      }

      return { inserted: totalInserted, updated: totalUpdated, files: filesProcessed };

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📁 No ${type} data directory found for ${timeframe}`);
        return { inserted: 0, updated: 0, files: 0 };
      }
      throw error;
    }
  }

  /**
   * Import CSV file to symbol-specific table with timeframe
   */
  async importCSVFile(filePath, symbol, exchange, type, timeframe) {
    return new Promise((resolve, reject) => {
      let records = [];
      let rowCount = 0;
      
      console.log(`   📊 Reading CSV file...`);
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
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
          
          // Show progress every 50,000 rows
          if (rowCount % config.PROGRESS_INTERVAL === 0) {
            console.log(`   📈 Parsed ${rowCount.toLocaleString()} rows...`);
          }
        })
        .on('end', async () => {
          try {
            console.log(`   ✅ Finished parsing ${rowCount.toLocaleString()} rows`);
            
            // Insert all records in one go
            console.log(`   💾 Inserting ${records.length.toLocaleString()} records...`);
            const result = await this.insertRecordsBatched(records, symbol, type, timeframe, exchange);

            console.log(`   🎉 Import complete: ${result.inserted.toLocaleString()} inserted, ${result.updated.toLocaleString()} updated`);

            // Update database metadata after successful import
            const tableName = this.getTableName(symbol, type, timeframe, exchange);
            await this.dbMetadataManager.markSymbolUpdated(tableName);
            
            resolve({ inserted: result.inserted, updated: result.updated });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Insert records to specific symbol table with timeframe
   */
  async insertRecordsBatched(records, symbol, assetType, timeframe, exchange = null) {
    const BATCH_SIZE = config.INSERT_BATCH_SIZE;
    let totalInserted = 0;
    let totalUpdated = 0;
    let failedBatches = 0;
    let errorMessages = [];
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
    const tableName = this.getTableName(symbol, assetType, timeframe, exchange);

    const startTime = Date.now();
    let lastProgressTime = startTime;

    console.log(`     💾 Processing ${records.length.toLocaleString()} records...`);

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      try {
        const batchStart = Date.now();
        const { inserted, updated } = await this.insertBatch(batch, tableName, timeframe);
        const batchTime = Date.now() - batchStart;
        
        totalInserted += inserted;
        totalUpdated += updated;
        
        // Only show meaningful progress updates (every 30 seconds or major milestones)
        const now = Date.now();
        if (now - lastProgressTime > 30000 || batchNum === totalBatches) {
          const progress = ((batchNum / totalBatches) * 100).toFixed(1);
          const recordsProcessed = Math.min(i + BATCH_SIZE, records.length);
          console.log(`     📈 Progress: ${recordsProcessed.toLocaleString()}/${records.length.toLocaleString()} records (${progress}%)`);
          lastProgressTime = now;
        }
        
        // Only warn about genuinely slow batches
        if (batchTime > config.SLOW_BATCH_THRESHOLD) {
          console.log(`     ⚠️  Slow batch detected: ${(batchTime/1000).toFixed(1)}s for ${batch.length} records`);
        }
        
      } catch (error) {
        failedBatches++;
        const errorMsg = `Batch ${batchNum} failed: ${error.message}`;
        errorMessages.push(errorMsg);
        
        // Only show first few batch errors, then summarize
        if (config.SHOW_INDIVIDUAL_BATCH_ERRORS && failedBatches <= 3) {
          console.error(`     ❌ ${errorMsg}`);
        }
        
        // Check if we should continue or stop
        if (config.CONTINUE_ON_BATCH_FAILURE) {
          if (failedBatches >= config.MAX_FAILED_BATCHES) {
            console.error(`     🚫 Too many failed batches (${failedBatches}), stopping import`);
            break;
          }
          
          // Only log this message ONCE
          if (failedBatches === 1) {
            console.log(`     ⏭️  Continuing despite errors (${config.MAX_FAILED_BATCHES - 1} more failures allowed)...`);
          }
        } else {
          throw error;
        }
      }
    }

    // Show final summary
    const totalTime = Date.now() - startTime;
    console.log(`     ✅ Database insert complete: ${totalInserted.toLocaleString()} inserted, ${totalUpdated.toLocaleString()} updated in ${(totalTime/1000).toFixed(1)}s`);
    
    // Show error summary only if there were errors
    if (failedBatches > 0) {
      console.log(`     ⚠️  ${failedBatches} batches failed. Sample errors:`);
      errorMessages.slice(0, 2).forEach((msg, idx) => {
        console.log(`        ${idx + 1}. ${msg}`);
      });
      if (errorMessages.length > 2) {
        console.log(`        ... and ${errorMessages.length - 2} more errors`);
      }
    }

    return { inserted: totalInserted, updated: totalUpdated, failedBatches, errorMessages };
  }

  /**
   * Insert batch into specific table with timeframe
   */
  async insertBatch(batch, tableName, timeframe) {
    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO ${tableName} (timestamp, open, high, low, close, volume, day_of_week, timeframe)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (timestamp)
        DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          day_of_week = EXCLUDED.day_of_week,
          timeframe = EXCLUDED.timeframe
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
          record.day_of_week,
          timeframe
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