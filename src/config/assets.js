/**
 * Asset configuration for cross-market ETL pipeline
 * Defines which instruments to fetch from various data sources
 */

const fs = require('fs');
const path = require('path');

// Load master configuration
const masterConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8'));

// TradFi Assets List - simple symbol and name pairs
const TRADFI_ASSETS = [
  { symbol: 'deuidxeur', name: 'DAX Index' },
  // { symbol: 'eurusd', name: 'EUR/USD' },
  // { symbol: 'gbpusd', name: 'GBP/USD' },
  // { symbol: 'usdjpy', name: 'USD/JPY' },
  // { symbol: 'usdchf', name: 'USD/CHF' }
];

// Crypto Assets List - for Python ccxt implementation
const CRYPTO_ASSETS = [
  // Will be populated when we implement crypto data fetching
  // { symbol: 'BTC/USDT', name: 'Bitcoin', exchange: 'binance' },
  // { symbol: 'ETH/USDT', name: 'Ethereum', exchange: 'binance' },
  // { symbol: 'ADA/USDT', name: 'Cardano', exchange: 'binance' }
];

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