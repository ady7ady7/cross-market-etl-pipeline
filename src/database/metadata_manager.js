/**
 * Simple Metadata Manager
 * Creates metadata files for assets in database
 */

const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');

class MetadataManager {
  constructor() {
    this.pool = pool;
    this.metadataPath = './metadata';
  }

  /**
   * Generate metadata for all assets
   */
  async generateAllMetadata() {
    try {
      // Ensure metadata directories exist
      await fs.mkdir(path.join(this.metadataPath, 'tradfi'), { recursive: true });
      await fs.mkdir(path.join(this.metadataPath, 'crypto'), { recursive: true });
      
      console.log('📄 Generating metadata files...');
      
      let totalAssets = 0;
      
      // Generate TradFi metadata
      const tradfiAssets = await this.generateTradFiMetadata();
      totalAssets += tradfiAssets;
      
      // Generate Crypto metadata  
      const cryptoAssets = await this.generateCryptoMetadata();
      totalAssets += cryptoAssets;
      
      // Generate summary
      await this.generateSummary();
      
      console.log(`✅ Generated metadata for ${totalAssets} assets`);
      return totalAssets;
      
    } catch (error) {
      console.error('❌ Failed to generate metadata:', error);
      throw error;
    }
  }

  /**
   * Generate TradFi asset metadata
   */
  async generateTradFiMetadata() {
    try {
      const query = `
        SELECT 
          symbol,
          COUNT(*) as record_count,
          MIN(timestamp) as first_timestamp,
          MAX(timestamp) as last_timestamp,
          COUNT(CASE WHEN volume IS NOT NULL THEN 1 END) as records_with_volume
        FROM tradfi_ohlcv 
        GROUP BY symbol
      `;
      
      const result = await this.pool.query(query);
      
      for (const row of result.rows) {
        const metadata = {
          symbol: row.symbol,
          type: 'tradfi',
          name: this.getTradFiName(row.symbol),
          data_format: parseInt(row.records_with_volume) > 0 ? 'OHLCV' : 'OHLC',
          volume_available: parseInt(row.records_with_volume) > 0,
          first_timestamp: row.first_timestamp?.toISOString(),
          last_timestamp: row.last_timestamp?.toISOString(),
          total_records: parseInt(row.record_count),
          coverage_days: this.calculateDays(row.first_timestamp, row.last_timestamp),
          table_name: 'tradfi_ohlcv',
          last_metadata_update: new Date().toISOString()
        };
        
        const filename = path.join(this.metadataPath, 'tradfi', `${row.symbol}.json`);
        await fs.writeFile(filename, JSON.stringify(metadata, null, 2));
        
        console.log(`   📄 ${row.symbol}: ${metadata.total_records} records`);
      }
      
      return result.rows.length;
      
    } catch (error) {
      console.error('Failed to generate TradFi metadata:', error);
      return 0;
    }
  }

  /**
   * Generate Crypto asset metadata
   */
  async generateCryptoMetadata() {
    try {
      const query = `
        SELECT 
          symbol, exchange,
          COUNT(*) as record_count,
          MIN(timestamp) as first_timestamp,
          MAX(timestamp) as last_timestamp,
          COUNT(CASE WHEN volume IS NOT NULL THEN 1 END) as records_with_volume
        FROM crypto_ohlcv 
        GROUP BY symbol, exchange
      `;
      
      const result = await this.pool.query(query);
      
      for (const row of result.rows) {
        const metadata = {
          symbol: row.symbol,
          exchange: row.exchange,
          type: 'crypto',
          name: this.getCryptoName(row.symbol),
          data_format: parseInt(row.records_with_volume) > 0 ? 'OHLCV' : 'OHLC',
          volume_available: parseInt(row.records_with_volume) > 0,
          first_timestamp: row.first_timestamp?.toISOString(),
          last_timestamp: row.last_timestamp?.toISOString(),
          total_records: parseInt(row.record_count),
          coverage_days: this.calculateDays(row.first_timestamp, row.last_timestamp),
          table_name: 'crypto_ohlcv',
          last_metadata_update: new Date().toISOString()
        };
        
        const filename = path.join(this.metadataPath, 'crypto', `${row.symbol.replace('/', '_')}_${row.exchange}.json`);
        await fs.writeFile(filename, JSON.stringify(metadata, null, 2));
        
        console.log(`   📄 ${row.symbol} (${row.exchange}): ${metadata.total_records} records`);
      }
      
      return result.rows.length;
      
    } catch (error) {
      console.error('Failed to generate Crypto metadata:', error);
      return 0;
    }
  }

  /**
   * Generate summary metadata
   */
  async generateSummary() {
    try {
      const tradfiCount = await this.pool.query('SELECT COUNT(*) as count FROM tradfi_ohlcv');
      const cryptoCount = await this.pool.query('SELECT COUNT(*) as count FROM crypto_ohlcv');
      
      const summary = {
        generated_at: new Date().toISOString(),
        total_records: parseInt(tradfiCount.rows[0].count) + parseInt(cryptoCount.rows[0].count),
        tradfi_records: parseInt(tradfiCount.rows[0].count),
        crypto_records: parseInt(cryptoCount.rows[0].count),
        metadata_location: {
          tradfi: './metadata/tradfi/',
          crypto: './metadata/crypto/'
        }
      };
      
      const summaryPath = path.join(this.metadataPath, 'summary.json');
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
      
    } catch (error) {
      console.error('Failed to generate summary:', error);
    }
  }

  /**
   * Helper methods
   */
  getTradFiName(symbol) {
    const names = {
      'deuidxeur': 'DAX Index',
      'eurusd': 'EUR/USD',
      'gbpusd': 'GBP/USD'
    };
    return names[symbol] || symbol.toUpperCase();
  }

  getCryptoName(symbol) {
    const names = {
      'BTC/USDT': 'Bitcoin',
      'ETH/USDT': 'Ethereum'
    };
    return names[symbol] || symbol;
  }

  calculateDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    return Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
  }
}

module.exports = MetadataManager;