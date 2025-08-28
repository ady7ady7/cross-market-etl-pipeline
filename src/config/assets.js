/**
 * Asset configuration for cross-market ETL pipeline
 * Defines which instruments to fetch from various data sources
 */

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

// Global TradFi Configuration
const TRADFI_CONFIG = {
  timeframe: 'm1',                    // Single timeframe for all TradFi assets
  batchSize: 5,                      // Batch size for all TradFi downloads
  pauseBetweenBatchesMs: 5000,        // Pause between batches for all TradFi assets
  availableTimeframes: ['m1', 'm5', 'h1', 'd1']
};

// Global Crypto Configuration (for Python implementation)
const CRYPTO_CONFIG = {
  timeframe: '1m',                    // Single timeframe for all crypto assets
  defaultExchange: 'binance',         // Default exchange
  availableTimeframes: ['1m', '5m', '1h', '1d']
};

const DATA_CONFIG = {
  // Default date range - YYYY-MM-DD format (use recent weekdays with market data)
  defaultDateRange: {
    from: new Date("2024-01-10"),     // Wednesday
    to: new Date("2025-08-26")        // Friday (ensure weekdays with market data)
  },
  
  // Data storage paths
  dataPaths: {
    tradfi: './data/tradfi',
    crypto: './data/crypto'
  },
  
  // Logging configuration
  logConfig: {
    logsPath: './logs',
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