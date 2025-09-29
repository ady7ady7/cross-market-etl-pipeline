/**
 * Dukascopy TradFi Data Importer - Multi-Timeframe Support
 * Fetches historical rate data from Dukascopy with proper batching and logging
 */

const fs = require('fs');
const { getHistoricalRates } = require('dukascopy-node');
const { TRADFI_ASSETS, TRADFI_CONFIG, DATA_CONFIG } = require('../config/assets');
const Logger = require('../utils/logger');
const CSVWriter = require('../utils/csv_writer');

// Load master config for timeframe support
const masterConfig = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../../config.json'), 'utf8'));

class DukascopyImporter {
  constructor() {
    this.logger = new Logger(
      'Dukascopy TradFi Data Import',
      DATA_CONFIG.logConfig.enableFileLogging,
      DATA_CONFIG.logConfig.logsPath
    );
    this.csvWriter = new CSVWriter(DATA_CONFIG.dataPaths.tradfi);

    // Get active timeframes from config and environment
    this.activeTimeframes = this.getActiveTimeframes();
    console.log(`🎯 Active timeframes: ${this.activeTimeframes.join(', ')}`);
  }

  getActiveTimeframes() {
    // Check for environment variable override first
    if (process.env.TIMEFRAMES) {
      return process.env.TIMEFRAMES.split(',').map(tf => tf.trim());
    }

    // Use config.json timeframes array
    return masterConfig.timeframes || ['m1'];
  }

  async fetchHistoricalData(asset, dateRange = null, timeframe = null) {
    const dates = dateRange || DATA_CONFIG.defaultDateRange;
    const tf = timeframe || 'm1'; // Default to m1 if not specified

    // Get timeframe-specific config
    const timeframeConfig = masterConfig.tradfi.timeframes[tf] || {
      batchSize: 5,
      pauseBetweenBatchesMs: 5000
    };

    await this.logger.start();
    await this.logger.info(`Fetching ${asset.name} (${asset.symbol}) data`);
    await this.logger.info(`Timeframe: ${tf}`);
    await this.logger.info(`Date range: ${dates.from.toISOString()} to ${dates.to.toISOString()}`);
    await this.logger.info(`Batch size: ${timeframeConfig.batchSize}, Pause: ${timeframeConfig.pauseBetweenBatchesMs}ms`);

    try {
      const historicalRates = await getHistoricalRates({
        instrument: asset.symbol,
        dates: dates,
        timeframe: tf,
        batchSize: timeframeConfig.batchSize,
        pauseBetweenBatchesMs: timeframeConfig.pauseBetweenBatchesMs,
        
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
    const timeframesToProcess = timeframe ? [timeframe] : this.activeTimeframes;

    await this.logger.info(`📊 Processing ${timeframesToProcess.length} timeframe(s): ${timeframesToProcess.join(', ')}`);

    for (const tf of timeframesToProcess) {
      await this.logger.info(`\n🕒 Starting timeframe: ${tf.toUpperCase()}`);
      results[tf] = {};

      for (let i = 0; i < TRADFI_ASSETS.length; i++) {
        const asset = TRADFI_ASSETS[i];

        await this.logger.info(`\n${'='.repeat(60)}`);
        await this.logger.info(`Processing asset ${i + 1}/${TRADFI_ASSETS.length}: ${asset.name.toUpperCase()} (${tf.toUpperCase()})`);
        await this.logger.info(`${'='.repeat(60)}`);

        try {
          const result = await this.fetchHistoricalData(asset, dateRange, tf);
          results[tf][asset.symbol] = result;

          // Small delay between different assets to be respectful
          if (i < TRADFI_ASSETS.length - 1) {
            await this.logger.info('Waiting 3 seconds before next asset...');
            await this.sleep(3000);
          }
        } catch (error) {
          await this.logger.error(`Failed to process asset ${asset.symbol} (${tf})`, error);
          results[tf][asset.symbol] = { error: error.message, asset, timeframe: tf };
        }
      }

      // Longer delay between timeframes
      if (timeframesToProcess.indexOf(tf) < timeframesToProcess.length - 1) {
        await this.logger.info(`\n⏸️  Completed ${tf.toUpperCase()}, waiting 10 seconds before next timeframe...`);
        await this.sleep(10000);
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
    // Check for custom config path (for scheduler)
    const configPath = process.env.CONFIG_PATH;
    let assetsToProcess;
    
    if (configPath && fs.existsSync(configPath)) {
      console.log(`📄 Using custom config: ${configPath}`);
      const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      assetsToProcess = customConfig.assets.tradfi;
    } else {
      console.log('📄 Using default config');
      assetsToProcess = TRADFI_ASSETS;
    }

    if (assetsToProcess.length === 0) {
      console.error('❌ No TradFi assets configured');
      process.exit(1);
    }

    const firstAsset = assetsToProcess[0];
    console.log(`🎯 Fetching ${firstAsset.name || firstAsset.symbol} data with configured date range...\n`);
    
    const result = await importer.fetchAllAssets();
    
    console.log('\n📋 Summary:');
    // SAFE ACCESS - check if result and result.asset exist
    if (result && result.asset) {
      console.log(`- Asset: ${result.asset.name || result.asset.symbol || 'Unknown'} (${result.asset.symbol || 'Unknown'})`);
      console.log(`- Timeframe: ${result.timeframe || 'Unknown'}`);
      
      if (result.dateRange) {
        console.log(`- Date range: ${result.dateRange.from?.toISOString().split('T')[0] || 'Unknown'} to ${result.dateRange.to?.toISOString().split('T')[0] || 'Unknown'}`);
      }
      
      console.log(`- Records fetched: ${result.recordCount || 0}`);
      console.log(`- CSV file: ${result.filePath || 'None'}`);
      
      if (result.data && result.data.length > 0) {
        console.log('- Sample data (first 3 records):');
        
        // Safe data handling for display
        const sampleData = result.data.slice(0, 3).map(record => {
          if (Array.isArray(record)) {
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
    } else {
      console.log('❌ No results returned from ETL process');
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