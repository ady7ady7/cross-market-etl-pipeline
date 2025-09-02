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

// Global TradFi Configuration - uses master config
const TRADFI_CONFIG = {
  timeframe: masterConfig.tradfi.timeframe,
  batchSize: masterConfig.tradfi.batchSize,
  pauseBetweenBatchesMs: masterConfig.tradfi.pauseBetweenBatchesMs,
  availableTimeframes: ['m1', 'm5', 'h1', 'd1']
};

// Global Crypto Configuration - uses master config  
const CRYPTO_CONFIG = {
  timeframe: masterConfig.crypto.timeframe,
  defaultExchange: masterConfig.crypto.defaultExchange,
  availableTimeframes: ['1m', '5m', '1h', '1d']
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