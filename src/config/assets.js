/**
 * Unified configuration loader for cross-market ETL pipeline
 * Loads all asset definitions and settings from master config.json
 * Replaces both assets.js and crypto_assets.py with single source of truth
 */

const fs = require('fs');
const path = require('path');

// Load master configuration
const masterConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8'));

// ============================================================================
// ASSET LISTS
// ============================================================================

// TradFi Assets List - from master config
const TRADFI_ASSETS = masterConfig.assets.tradfi;

// Crypto Assets List - from master config
const CRYPTO_ASSETS = masterConfig.assets.crypto;

// ============================================================================
// IMPORTER CONFIGURATIONS
// ============================================================================

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
  rateLimitDelay: masterConfig.crypto.timeframes?.m1?.rateLimitDelay || 3,
  timeout: 30000,
  enableRateLimit: true
};

// Exchange-specific configurations (consolidated from crypto_assets.py)
const EXCHANGE_CONFIGS = {
  binance: {
    sandbox: false,
    rateLimit: 1200,
    enableRateLimit: true,
    options: {
      defaultType: 'spot'
    }
  },
  coinbase: {
    sandbox: false,
    rateLimit: 10000,
    enableRateLimit: true
  },
  kraken: {
    rateLimit: 3000,
    enableRateLimit: true
  }
};

// ============================================================================
// DATA & PATH CONFIGURATION
// ============================================================================

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
    enableConsoleLogging: true,
    logLevel: 'INFO'
  },

  // CSV output configuration
  csvConfig: {
    includeHeaders: true,
    dateFormat: 'YYYY-MM-DD HH:mm:ss'
  }
};

// ============================================================================
// HELPER FUNCTIONS (from crypto_assets.py)
// ============================================================================

/**
 * Get the active timeframes from config or environment variable
 */
function getActiveTimeframes() {
  // Check for environment variable override first
  if (process.env.TIMEFRAMES) {
    return process.env.TIMEFRAMES.split(',').map(tf => tf.trim());
  }
  // Use config.json timeframes array
  return masterConfig.timeframes || ['m1'];
}

/**
 * Get configuration for a specific timeframe
 */
function getTimeframeConfig(timeframe) {
  const timeframeConfigs = masterConfig.crypto.timeframes;
  return timeframeConfigs[timeframe] || {
    ccxtTimeframe: '1m',
    batchSize: 2000,
    rateLimitDelay: 3
  };
}

/**
 * Find crypto asset by symbol
 */
function getAssetBySymbol(symbol) {
  return CRYPTO_ASSETS.find(asset => asset.symbol === symbol) || null;
}

/**
 * Get list of configured exchanges
 */
function getAvailableExchanges() {
  return Object.keys(EXCHANGE_CONFIGS);
}

/**
 * Get exchange configuration
 */
function getExchangeConfig(exchange) {
  return EXCHANGE_CONFIGS[exchange] || EXCHANGE_CONFIGS.binance;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Assets
  TRADFI_ASSETS,
  CRYPTO_ASSETS,

  // Configurations
  TRADFI_CONFIG,
  CRYPTO_CONFIG,
  DATA_CONFIG,
  EXCHANGE_CONFIGS,

  // Helper functions
  getActiveTimeframes,
  getTimeframeConfig,
  getAssetBySymbol,
  getAvailableExchanges,
  getExchangeConfig,

  // Master config access (for direct access if needed)
  masterConfig
};