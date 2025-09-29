/**
 * Asset configuration for cross-market ETL pipeline
 * Loads asset definitions from master config.json
 */

const fs = require('fs');
const path = require('path');

// Load master configuration
const masterConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8'));

// TradFi Assets List - from master config
const TRADFI_ASSETS = masterConfig.assets.tradfi;

// Crypto Assets List - from master config
const CRYPTO_ASSETS = masterConfig.assets.crypto;

// Global TradFi Configuration - updated for multi-timeframe support
const TRADFI_CONFIG = {
  timeframes: masterConfig.tradfi.timeframes,
  availableTimeframes: masterConfig.timeframes || ['m1', 'm5', 'h1'],
  // Legacy support - use m1 settings as default
  timeframe: 'm1',
  batchSize: masterConfig.tradfi.timeframes?.m1?.batchSize || 5,
  pauseBetweenBatchesMs: masterConfig.tradfi.timeframes?.m1?.pauseBetweenBatchesMs || 5000
};

// Global Crypto Configuration - updated for multi-timeframe support
const CRYPTO_CONFIG = {
  timeframes: masterConfig.crypto.timeframes,
  defaultExchange: masterConfig.crypto.defaultExchange,
  maxRetries: masterConfig.crypto.maxRetries,
  availableTimeframes: masterConfig.timeframes || ['m1', 'm5', 'h1'],
  // Legacy support - use m1 settings as default
  timeframe: 'm1',
  batchSize: masterConfig.crypto.timeframes?.m1?.batchSize || 2000,
  rateLimitDelay: masterConfig.crypto.timeframes?.m1?.rateLimitDelay || 3
};

const DATA_CONFIG = {
  // Default date range - from master config
  defaultDateRange: {
    from: new Date(masterConfig.dateRanges.default.from),
    to: new Date(masterConfig.dateRanges.default.to)
  },
  
  // Data storage paths - from master config
  dataPaths: {
    tradfi: masterConfig.paths.tradfiData,
    crypto: masterConfig.paths.cryptoData
  },
  
  // Logging configuration - from master config
  logConfig: {
    logsPath: masterConfig.paths.logs,
    enableFileLogging: true,
    enableConsoleLogging: true
  },
  
  // CSV output configuration
  csvConfig: {
    includeHeaders: true,
    dateFormat: 'YYYY-MM-DD HH:mm:ss'
  }
};

module.exports = {
  TRADFI_ASSETS,
  CRYPTO_ASSETS,
  TRADFI_CONFIG,
  CRYPTO_CONFIG,
  DATA_CONFIG
};