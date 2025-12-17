/**
 * CCXT Crypto Data Importer
 * Fetches historical crypto data from exchanges with proper rate limiting and logging
 * Unified JavaScript implementation replacing Python ccxt crypto_importer.py
 */

const ccxt = require('ccxt');
const Logger = require('../utils/logger');
const CsvWriter = require('../utils/csv_writer');
const {
  CRYPTO_ASSETS,
  CRYPTO_CONFIG,
  DATA_CONFIG,
  EXCHANGE_CONFIGS,
  getActiveTimeframes,
  getTimeframeConfig,
  getAssetBySymbol,
  getExchangeConfig,
  masterConfig
} = require('../config/assets');

class CryptoImporter {
  constructor() {
    this.logger = new Logger('CCXT Crypto Data Import', DATA_CONFIG.logConfig.logsPath);
    this.csvWriter = new CsvWriter(DATA_CONFIG.dataPaths.crypto);
    this.exchanges = {};

    // Get active timeframes from config and environment
    this.activeTimeframes = getActiveTimeframes();
    console.log(`🎯 Active timeframes: ${this.activeTimeframes.join(', ')}`);
  }

  /**
   * Initialize exchange with proper configuration
   */
  async _initExchange(exchangeName) {
    if (this.exchanges[exchangeName]) {
      return this.exchanges[exchangeName];
    }

    try {
      // Get exchange class
      const ExchangeClass = ccxt[exchangeName];
      if (!ExchangeClass) {
        throw new Error(`Exchange ${exchangeName} not found in CCXT`);
      }

      // Get exchange config
      const config = getExchangeConfig(exchangeName);

      // Create exchange instance (no API keys needed for public data)
      const exchange = new ExchangeClass({
        rateLimit: config.rateLimit || CRYPTO_CONFIG.rateLimitDelay * 1000,
        enableRateLimit: config.enableRateLimit !== false,
        timeout: CRYPTO_CONFIG.timeout || 30000,
        sandbox: config.sandbox || false,
        options: config.options || {}
      });

      // Initialize the exchange (loads markets)
      await exchange.loadMarkets();

      this.exchanges[exchangeName] = exchange;
      return exchange;
    } catch (error) {
      this.logger.error(`Failed to initialize exchange ${exchangeName}`, error);
      throw error;
    }
  }

  /**
   * Convert timeframe to milliseconds - supports both our format (m1, m5, h1) and CCXT format (1m, 5m, 1h)
   */
  _getTimeframeDurationMs(timeframe) {
    // Convert our format to CCXT format if needed
    const timeframeConversion = {
      'm1': '1m',
      'm5': '5m',
      'm15': '15m',
      'h1': '1h',
      'h4': '4h',
      'd1': '1d'
    };

    const ccxtTimeframe = timeframeConversion[timeframe] || timeframe;

    const timeframeMap = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };

    return timeframeMap[ccxtTimeframe] || 60 * 1000; // Default to 1m
  }

  /**
   * Sleep utility for rate limiting
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch historical data for a single crypto asset
   */
  async fetchHistoricalData(asset, dateRange = null, timeframe = null) {
    const dates = dateRange || {
      from: new Date(masterConfig.dateRanges.default.from),
      to: new Date(masterConfig.dateRanges.default.to)
    };
    const tf = timeframe || 'm1'; // Default to m1 if not specified
    const exchangeName = asset.exchange || CRYPTO_CONFIG.defaultExchange;

    // Get timeframe-specific config
    const timeframeConfig = getTimeframeConfig(tf);

    this.logger.start();
    this.logger.info(`Fetching ${asset.name} (${asset.symbol}) data`);
    this.logger.info(`Exchange: ${exchangeName}`);
    this.logger.info(`Timeframe: ${tf}`);
    this.logger.info(`Date range: ${dates.from.toISOString()} to ${dates.to.toISOString()}`);
    this.logger.info(`Rate limit delay: ${timeframeConfig.rateLimitDelay}s`);
    this.logger.info(`Batch size: ${timeframeConfig.batchSize}`);

    try {
      // Initialize exchange
      const exchange = await this._initExchange(exchangeName);

      // Check if exchange supports OHLCV
      if (!exchange.has.fetchOHLCV) {
        throw new Error(`Exchange ${exchangeName} does not support OHLCV data`);
      }

      // Convert dates to timestamps (milliseconds)
      const since = dates.from.getTime();
      const until = dates.to.getTime();

      // Get timeframe duration
      const timeframeDuration = this._getTimeframeDurationMs(tf);

      const allCandles = [];
      let currentTime = since;
      let batchCount = 0;

      const ccxtTimeframe = timeframeConfig.ccxtTimeframe || '1m';

      // Calculate approximate time range for progress estimation
      const timeRangeMs = until - since;
      const totalDays = Math.ceil(timeRangeMs / (24 * 60 * 60 * 1000));

      this.logger.info(`Starting data collection from ${new Date(since).toISOString()}`);
      this.logger.info(`Time range: ${totalDays} days | Batch size: ${timeframeConfig.batchSize} candles`);

      while (currentTime < until) {
        try {
          batchCount += 1;

          // Calculate progress based on time covered
          const timeCovered = currentTime - since;
          const progressPercent = ((timeCovered / timeRangeMs) * 100).toFixed(1);
          const candlesFetched = allCandles.length;

          // Log progress with actual data
          console.log(`📦 Batch ${batchCount} | Progress: ${progressPercent}% | Candles: ${candlesFetched.toLocaleString()}`);

          const candles = await exchange.fetchOHLCV(
            asset.symbol,
            ccxtTimeframe,
            currentTime,
            timeframeConfig.batchSize
          );

          if (!candles || candles.length === 0) {
            this.logger.warn(`No data returned for batch ${batchCount}`);
            break;
          }

          // Filter candles within our date range
          const validCandles = candles.filter(c => c[0] >= since && c[0] <= until);
          allCandles.push(...validCandles);

          this.logger.info(`Fetched ${candles.length} candles, ${validCandles.length} within range`);

          // Update current time for next batch
          if (candles.length > 0) {
            currentTime = candles[candles.length - 1][0] + timeframeDuration;
          } else {
            break;
          }

          // Exit if we've reached the end date
          if (currentTime >= until) {
            break;
          }

          // Rate limiting
          this.logger.pause(timeframeConfig.rateLimitDelay);
          await this.sleep(timeframeConfig.rateLimitDelay * 1000);
        } catch (error) {
          if (error instanceof ccxt.BaseError || error instanceof ccxt.NetworkError) {
            this.logger.error(`CCXT error in batch ${batchCount}: ${error.message}`, error);
            if (batchCount >= CRYPTO_CONFIG.maxRetries) {
              throw error;
            }
            // Longer wait on error
            await this.sleep(timeframeConfig.rateLimitDelay * 2000);
            continue;
          }
          throw error;
        }
      }

      // Remove duplicates and sort by timestamp
      const uniqueCandles = {};
      allCandles.forEach(candle => {
        uniqueCandles[candle[0]] = candle;
      });

      const sortedCandles = Object.values(uniqueCandles).sort((a, b) => a[0] - b[0]);

      this.logger.success(`Successfully fetched ${sortedCandles.length} data points`);

      // Save to CSV
      const filePath = this.csvWriter.writeCryptoData(
        sortedCandles,
        asset.symbol,
        tf,
        dates
      );

      this.logger.complete(sortedCandles.length, filePath);

      return {
        data: sortedCandles,
        filePath,
        recordCount: sortedCandles.length,
        asset,
        timeframe: tf,
        dateRange: dates
      };
    } catch (error) {
      this.logger.error('Failed to fetch historical data', error);
      throw error;
    }
  }

  /**
   * Fetch data for all configured crypto assets across multiple timeframes
   */
  async fetchAllAssets(dateRange = null, timeframe = null) {
    const results = {};
    const timeframesToProcess = timeframe ? [timeframe] : this.activeTimeframes;

    this.logger.info(`📊 Processing ${timeframesToProcess.length} timeframe(s): ${timeframesToProcess.join(', ')}`);

    for (const tf of timeframesToProcess) {
      this.logger.info(`\n🕒 Starting timeframe: ${tf.toUpperCase()}`);
      results[tf] = {};

      for (let i = 0; i < CRYPTO_ASSETS.length; i++) {
        const asset = CRYPTO_ASSETS[i];

        this.logger.info(`\n${'='.repeat(60)}`);
        this.logger.info(`Processing asset ${i + 1}/${CRYPTO_ASSETS.length}: ${asset.name.toUpperCase()} (${tf.toUpperCase()})`);
        this.logger.info(`${'='.repeat(60)}`);

        try {
          const result = await this.fetchHistoricalData(asset, dateRange, tf);
          results[tf][asset.symbol] = result;

          // Small delay between different assets to be respectful
          if (i < CRYPTO_ASSETS.length - 1) {
            this.logger.info('Waiting 3 seconds before next asset...');
            await this.sleep(3000);
          }
        } catch (error) {
          this.logger.error(`Failed to process asset ${asset.symbol} (${tf})`, error);
          results[tf][asset.symbol] = {
            error: error.message,
            asset,
            timeframe: tf
          };
        }
      }

      // Longer delay between timeframes
      const tfIndex = timeframesToProcess.indexOf(tf);
      if (tfIndex < timeframesToProcess.length - 1) {
        this.logger.info(`\n⏸️  Completed ${tf.toUpperCase()}, waiting 10 seconds before next timeframe...`);
        await this.sleep(10000);
      }
    }

    return results;
  }

  /**
   * Fetch specific asset by symbol
   */
  async fetchAssetBySymbol(symbol, dateRange = null, timeframe = null) {
    const asset = getAssetBySymbol(symbol);

    if (!asset) {
      throw new Error(`Asset with symbol '${symbol}' not found in CRYPTO_ASSETS`);
    }

    return this.fetchHistoricalData(asset, dateRange, timeframe);
  }

  /**
   * Fetch the first configured asset (for testing)
   */
  async fetchFirstAsset(dateRange = null) {
    if (!CRYPTO_ASSETS || CRYPTO_ASSETS.length === 0) {
      throw new Error('No assets configured in CRYPTO_ASSETS');
    }

    return this.fetchHistoricalData(CRYPTO_ASSETS[0], dateRange);
  }
}

/**
 * Main execution function for direct script running
 */
async function main() {
  const importer = new CryptoImporter();

  try {
    // Use the configured date range and fetch all configured assets for all timeframes
    if (!CRYPTO_ASSETS || CRYPTO_ASSETS.length === 0) {
      console.log('❌ No assets configured in CRYPTO_ASSETS');
      process.exit(1);
    }

    const firstAsset = CRYPTO_ASSETS[0];
    console.log(`🎯 Fetching ${firstAsset.name} data with configured date range...\n`);

    const results = await importer.fetchAllAssets();

    console.log('\n📋 Summary:');

    // Results are now nested by timeframe, then by symbol
    let totalFiles = 0;
    let totalRecords = 0;

    for (const [timeframe, timeframeResults] of Object.entries(results)) {
      console.log(`\n🕒 Timeframe: ${timeframe.toUpperCase()}`);
      for (const [symbol, result] of Object.entries(timeframeResults)) {
        if (!result.error) {
          console.log(`  ✅ ${result.asset.name} (${symbol}): ${result.recordCount} records`);
          console.log(`     📁 File: ${result.filePath}`);
          totalFiles++;
          totalRecords += result.recordCount;
        } else {
          console.log(`  ❌ ${symbol}: ${result.error}`);
        }
      }
    }

    console.log(`\n📊 Total: ${totalFiles} files, ${totalRecords.toLocaleString()} records across ${Object.keys(results).length} timeframes`);
  } catch (error) {
    console.error(`❌ Script execution failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Export for use as module
module.exports = CryptoImporter;

// Run if executed directly
if (require.main === module) {
  main();
}
