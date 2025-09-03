/**
 * Dukascopy TradFi Data Importer
 * Fetches historical rate data from Dukascopy with proper batching and logging
 */

const { getHistoricalRates } = require('dukascopy-node');
const { TRADFI_ASSETS, TRADFI_CONFIG, DATA_CONFIG } = require('../config/assets');
const Logger = require('../utils/logger');
const CSVWriter = require('../utils/csv_writer');

class DukascopyImporter {
  constructor() {
    this.logger = new Logger(
      'Dukascopy TradFi Data Import',
      DATA_CONFIG.logConfig.enableFileLogging,
      DATA_CONFIG.logConfig.logsPath
    );
    this.csvWriter = new CSVWriter(DATA_CONFIG.dataPaths.tradfi);
  }

  async fetchHistoricalData(asset, dateRange = null, timeframe = null) {
    const dates = dateRange || DATA_CONFIG.defaultDateRange;
    const tf = timeframe || TRADFI_CONFIG.timeframe;
    
    await this.logger.start();
    await this.logger.info(`Fetching ${asset.name} (${asset.symbol}) data`);
    await this.logger.info(`Timeframe: ${tf}`);
    await this.logger.info(`Date range: ${dates.from.toISOString()} to ${dates.to.toISOString()}`);
    await this.logger.info(`Batch size: ${TRADFI_CONFIG.batchSize}, Pause: ${TRADFI_CONFIG.pauseBetweenBatchesMs}ms`);

    try {
      const historicalRates = await getHistoricalRates({
        instrument: asset.symbol,
        dates: dates,
        timeframe: tf,
        batchSize: TRADFI_CONFIG.batchSize,
        pauseBetweenBatchesMs: TRADFI_CONFIG.pauseBetweenBatchesMs,
        
        // Request configuration for better reliability
        format: 'json',
        retryCount: 5,
        retryOnEmpty: true,
        failAfterRetryCount: false,
        
        // Progress callback for detailed logging
        onProgress: async (progress) => {
          if (progress.totalBatches > 1) {
            await this.logger.batch(progress.currentBatch, progress.totalBatches, progress.itemsInCurrentBatch);
          }
          
          if (progress.pauseDuration > 0) {
            await this.logger.pause(progress.pauseDuration);
          }
        }
      });

      await this.logger.success(`Successfully fetched ${historicalRates.length} data points`);
      
      // Save to CSV
      const filePath = await this.csvWriter.writeTradFiData(
        historicalRates, 
        asset.symbol, 
        tf, 
        dates
      );

      await this.logger.complete(historicalRates.length, filePath);
      
      return {
        data: historicalRates,
        filePath: filePath,
        recordCount: historicalRates.length,
        asset: asset,
        timeframe: tf,
        dateRange: dates
      };

    } catch (error) {
      await this.logger.error('Failed to fetch historical data', error);
      throw error;
    }
  }

  async fetchAllAssets(dateRange = null, timeframe = null) {
    const results = {};
    
    for (let i = 0; i < TRADFI_ASSETS.length; i++) {
      const asset = TRADFI_ASSETS[i];
      
      await this.logger.info(`\n${'='.repeat(60)}`);
      await this.logger.info(`Processing asset ${i + 1}/${TRADFI_ASSETS.length}: ${asset.name.toUpperCase()}`);
      await this.logger.info(`${'='.repeat(60)}`);
      
      try {
        const result = await this.fetchHistoricalData(asset, dateRange, timeframe);
        results[asset.symbol] = result;
        
        // Small delay between different assets to be respectful
        if (i < TRADFI_ASSETS.length - 1) {
          await this.logger.info('Waiting 3 seconds before next asset...');
          await this.sleep(3000);
        }
      } catch (error) {
        await this.logger.error(`Failed to process asset ${asset.symbol}`, error);
        results[asset.symbol] = { error: error.message, asset };
      }
    }

    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience method for fetching specific asset by symbol
  async fetchAssetBySymbol(symbol, dateRange = null, timeframe = null) {
    const asset = TRADFI_ASSETS.find(a => a.symbol === symbol);
    if (!asset) {
      throw new Error(`Asset with symbol '${symbol}' not found in TRADFI_ASSETS`);
    }
    return this.fetchHistoricalData(asset, dateRange, timeframe);
  }

  // Convenience method for testing with any configured asset
  async fetchFirstAsset(dateRange = null) {
    if (TRADFI_ASSETS.length === 0) {
      throw new Error('No assets configured in TRADFI_ASSETS');
    }
    return this.fetchHistoricalData(TRADFI_ASSETS[0], dateRange);
  }
}

// Main execution function for direct script running
async function main() {
  const importer = new DukascopyImporter();
  
  try {
    // Use the configured date range from assets.js and fetch the first configured asset
    if (TRADFI_ASSETS.length === 0) {
      console.error('❌ No assets configured in TRADFI_ASSETS');
      process.exit(1);
    }

    const firstAsset = TRADFI_ASSETS[0];
    console.log(`🎯 Fetching ${firstAsset.name} data with configured date range...\n`);
    
    const result = await importer.fetchAllAssets();
    
    console.log('\n📋 Summary:');
    console.log(`- Asset: ${result.asset.name} (${result.asset.symbol})`);
    console.log(`- Timeframe: ${result.timeframe}`);
    console.log(`- Date range: ${result.dateRange.from.toISOString().split('T')[0]} to ${result.dateRange.to.toISOString().split('T')[0]}`);
    console.log(`- Records fetched: ${result.recordCount}`);
    console.log(`- CSV file: ${result.filePath}`);
    
    if (result.data.length > 0) {
      console.log('- Sample data (first 3 records):');
      
      // Safe data handling for display
      const sampleData = result.data.slice(0, 3).map(record => {
        if (Array.isArray(record)) {
          // Array format: [timestamp, open, high, low, close, volume]
          const [timestamp, open, high, low, close, volume] = record;
          return {
            timestamp: new Date(timestamp).toISOString(),
            open: open,
            high: high,
            low: low,
            close: close,
            volume: volume || 0
          };
        } else if (typeof record === 'object' && record !== null) {
          // Object format
          let displayTimestamp;
          try {
            if (typeof record.timestamp === 'number') {
              displayTimestamp = new Date(record.timestamp).toISOString();
            } else {
              displayTimestamp = String(record.timestamp);
            }
          } catch (error) {
            displayTimestamp = 'Invalid timestamp';
          }
          
          return {
            timestamp: displayTimestamp,
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
            volume: record.volume || 0
          };
        } else {
          return { error: 'Unknown record format', raw: record };
        }
      });
      
      console.log(sampleData);
    }

  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// Export the class for use in other modules
module.exports = DukascopyImporter;

// Run main function if this script is executed directly
if (require.main === module) {
  main();
}