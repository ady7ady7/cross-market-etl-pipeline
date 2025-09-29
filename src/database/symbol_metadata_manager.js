/**
 * Symbol Metadata Manager
 * Creates and manages lightweight metadata files for each symbol table
 */

const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');

class SymbolMetadataManager {
  constructor() {
    this.pool = pool;
    this.metadataPath = './metadata';
  }

  /**
   * Generate metadata for all symbol tables
   */
  async generateAllMetadata() {
    try {
      // Ensure metadata directories exist
      await fs.mkdir(path.join(this.metadataPath, 'symbols'), { recursive: true });
      
      console.log('📄 Generating metadata files for all symbol tables...');
      
      let totalTables = 0;
      
      // Get all OHLCV tables from database
      const tables = await this.getAllOHLCVTables();
      
      for (const table of tables) {
        await this.generateSymbolMetadata(table.table_name, table.asset_type, table.symbol, table.timeframe, table.exchange);
        totalTables++;
      }
      
      // Generate summary
      await this.generateSummary();
      
      console.log(`✅ Generated metadata for ${totalTables} symbol tables`);
      return totalTables;
      
    } catch (error) {
      console.error('❌ Failed to generate metadata:', error);
      throw error;
    }
  }

  /**
   * Get all OHLCV tables from database
   */
  async getAllOHLCVTables() {
    try {
      const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND (table_name LIKE '%_tradfi_ohlcv' OR table_name LIKE '%_crypto_ohlcv')
        ORDER BY table_name
      `;
      
      const result = await this.pool.query(query);
      
      return result.rows.map(row => {
        const tableName = row.table_name;
        const isCrypto = tableName.includes('_crypto_ohlcv');
        const isTradFi = tableName.includes('_tradfi_ohlcv');

        let symbol, exchange, assetType, timeframe;

        if (isTradFi) {
          assetType = 'tradfi';
          // Format: symbol_timeframe_tradfi_ohlcv
          const withoutSuffix = tableName.replace('_tradfi_ohlcv', '');
          const parts = withoutSuffix.split('_');
          if (parts.length >= 2) {
            timeframe = parts[parts.length - 1]; // Last part is timeframe
            symbol = parts.slice(0, -1).join('_'); // Everything before timeframe
          } else {
            symbol = parts[0];
            timeframe = 'm1'; // fallback
          }
          exchange = null;
        } else if (isCrypto) {
          assetType = 'crypto';
          // Format: symbol_timeframe_exchange_crypto_ohlcv
          const withoutSuffix = tableName.replace('_crypto_ohlcv', '');
          const parts = withoutSuffix.split('_');

          if (parts.length >= 3) {
            exchange = parts[parts.length - 1]; // Last part is exchange
            timeframe = parts[parts.length - 2]; // Second to last is timeframe
            const symbolPart = parts.slice(0, -2).join(''); // Everything before timeframe and exchange
            symbol = this.reconstructCryptoSymbol(symbolPart);
          } else {
            symbol = parts[0];
            timeframe = 'm1';
            exchange = 'unknown';
          }
        }

        return {
          table_name: tableName,
          asset_type: assetType,
          symbol: symbol,
          timeframe: timeframe,
          exchange: exchange
        };
      });
      
    } catch (error) {
      console.error('Failed to get OHLCV tables:', error);
      return [];
    }
  }

  /**
   * Generate metadata for a specific symbol table with timeframe
   */
  async generateSymbolMetadata(tableName, assetType, symbol, timeframe = 'm1', exchange = null) {
    try {
      const query = `
        SELECT 
          COUNT(*) as record_count,
          MIN(timestamp) as first_timestamp,
          MAX(timestamp) as last_timestamp,
          COUNT(CASE WHEN volume IS NOT NULL THEN 1 END) as records_with_volume,
          COUNT(CASE WHEN day_of_week = 'Monday' THEN 1 END) as monday_count,
          COUNT(CASE WHEN day_of_week = 'Tuesday' THEN 1 END) as tuesday_count,
          COUNT(CASE WHEN day_of_week = 'Wednesday' THEN 1 END) as wednesday_count,
          COUNT(CASE WHEN day_of_week = 'Thursday' THEN 1 END) as thursday_count,
          COUNT(CASE WHEN day_of_week = 'Friday' THEN 1 END) as friday_count,
          COUNT(CASE WHEN day_of_week = 'Saturday' THEN 1 END) as saturday_count,
          COUNT(CASE WHEN day_of_week = 'Sunday' THEN 1 END) as sunday_count
        FROM ${tableName}
      `;
      
      const result = await this.pool.query(query);
      const row = result.rows[0];
      
      const metadata = {
        symbol: symbol,
        timeframe: timeframe,
        table_name: tableName,
        asset_type: assetType,
        exchange: exchange,

        // Core statistics
        total_records: parseInt(row.record_count),
        first_available_timestamp: row.first_timestamp?.toISOString(),
        last_available_timestamp: row.last_timestamp?.toISOString(),
        coverage_days: this.calculateDays(row.first_timestamp, row.last_timestamp),
        
        // Data format info
        volume_available: parseInt(row.records_with_volume) > 0,
        data_format: parseInt(row.records_with_volume) > 0 ? 'OHLCV' : 'OHLC',
        
        // Day of week distribution
        day_of_week_distribution: {
          monday: parseInt(row.monday_count),
          tuesday: parseInt(row.tuesday_count),
          wednesday: parseInt(row.wednesday_count),
          thursday: parseInt(row.thursday_count),
          friday: parseInt(row.friday_count),
          saturday: parseInt(row.saturday_count),
          sunday: parseInt(row.sunday_count)
        },
        
        // Metadata management
        last_metadata_update: new Date().toISOString(),
        can_update_from: row.last_timestamp?.toISOString() || null
      };
      
      // Generate filename with timeframe
      let filename;
      if (assetType === 'tradfi') {
        filename = `metadata_${symbol}_${timeframe}_tradfi.json`;
      } else {
        const cleanSymbol = symbol.replace('/', '').toLowerCase();
        filename = `metadata_${cleanSymbol}_${timeframe}_${exchange}_crypto.json`;
      }
      
      const filePath = path.join(this.metadataPath, 'symbols', filename);
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
      
      console.log(`   📄 ${symbol} (${timeframe.toUpperCase()})${exchange ? ` (${exchange})` : ''}: ${metadata.total_records} records, ${metadata.coverage_days} days`);
      
      return metadata;
      
    } catch (error) {
      console.error(`Failed to generate metadata for ${tableName}:`, error);
      return null;
    }
  }

  /**
   * Check if symbol table needs updating
   */
  async checkSymbolNeedsUpdate(symbol, assetType, exchange = null, newDataTimestamp = null) {
    try {
      const metadata = await this.getSymbolMetadata(symbol, assetType, exchange);
      
      if (!metadata) {
        // No metadata exists, needs full import
        return { needsUpdate: true, reason: 'no_metadata', lastTimestamp: null };
      }
      
      if (!newDataTimestamp) {
        // Just checking general status
        return { 
          needsUpdate: false, 
          reason: 'up_to_date', 
          lastTimestamp: metadata.last_available_timestamp,
          totalRecords: metadata.total_records
        };
      }
      
      const lastAvailable = new Date(metadata.last_available_timestamp);
      const newData = new Date(newDataTimestamp);
      
      if (newData > lastAvailable) {
        return { 
          needsUpdate: true, 
          reason: 'new_data_available', 
          lastTimestamp: metadata.last_available_timestamp,
          gapDays: Math.ceil((newData - lastAvailable) / (1000 * 60 * 60 * 24))
        };
      }
      
      return { 
        needsUpdate: false, 
        reason: 'up_to_date', 
        lastTimestamp: metadata.last_available_timestamp
      };
      
    } catch (error) {
      console.error(`Failed to check update status for ${symbol}:`, error);
      return { needsUpdate: true, reason: 'check_failed', lastTimestamp: null };
    }
  }

  /**
   * Get metadata for a specific symbol
   */
  async getSymbolMetadata(symbol, assetType, exchange = null) {
    try {
      let filename;
      if (assetType === 'tradfi') {
        filename = `metadata_${symbol}_tradfi.json`;
      } else {
        const cleanSymbol = symbol.replace('/', '').toLowerCase();
        filename = `metadata_${cleanSymbol}_${exchange}_crypto.json`;
      }
      
      const filePath = path.join(this.metadataPath, 'symbols', filename);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Update metadata after data import
   */
  async updateSymbolMetadata(symbol, assetType, timeframe = 'm1', exchange = null) {
    const tableName = this.getTableName(symbol, assetType, timeframe, exchange);
    return this.generateSymbolMetadata(tableName, assetType, symbol, timeframe, exchange);
  }

  /**
   * Get all symbol metadata files
   */
  async getAllSymbolMetadata() {
    try {
      const symbolsDir = path.join(this.metadataPath, 'symbols');
      const files = await fs.readdir(symbolsDir);
      const metadataFiles = files.filter(f => f.startsWith('metadata_') && f.endsWith('.json'));
      
      const allMetadata = [];
      for (const filename of metadataFiles) {
        const filePath = path.join(symbolsDir, filename);
        const content = await fs.readFile(filePath, 'utf8');
        const metadata = JSON.parse(content);
        allMetadata.push(metadata);
      }
      
      return allMetadata;
      
    } catch (error) {
      console.error('Failed to get all symbol metadata:', error);
      return [];
    }
  }

  /**
   * Generate summary metadata
   */
  async generateSummary() {
    try {
      const allMetadata = await this.getAllSymbolMetadata();
      
      const tradfiAssets = allMetadata.filter(m => m.asset_type === 'tradfi');
      const cryptoAssets = allMetadata.filter(m => m.asset_type === 'crypto');
      
      const summary = {
        generated_at: new Date().toISOString(),
        total_symbols: allMetadata.length,
        total_records: allMetadata.reduce((sum, m) => sum + m.total_records, 0),
        
        tradfi_summary: {
          symbol_count: tradfiAssets.length,
          total_records: tradfiAssets.reduce((sum, m) => sum + m.total_records, 0),
          symbols: tradfiAssets.map(m => ({
            symbol: m.symbol,
            records: m.total_records,
            coverage_days: m.coverage_days,
            last_update: m.last_available_timestamp
          }))
        },
        
        crypto_summary: {
          symbol_count: cryptoAssets.length,
          total_records: cryptoAssets.reduce((sum, m) => sum + m.total_records, 0),
          exchanges: [...new Set(cryptoAssets.map(m => m.exchange))],
          symbols: cryptoAssets.map(m => ({
            symbol: m.symbol,
            exchange: m.exchange,
            records: m.total_records,
            coverage_days: m.coverage_days,
            last_update: m.last_available_timestamp
          }))
        },
        
        metadata_location: './metadata/symbols/',
        schema_version: '2.0'
      };
      
      const summaryPath = path.join(this.metadataPath, 'summary.json');
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
      
    } catch (error) {
      console.error('Failed to generate summary:', error);
    }
  }

  /**
   * Helper method to get table name with timeframe
   */
  getTableName(symbol, assetType, timeframe = 'm1', exchange = null) {
    if (assetType === 'tradfi') {
      return `${symbol.toLowerCase()}_${timeframe.toLowerCase()}_tradfi_ohlcv`;
    } else {
      const cleanSymbol = symbol.replace('/', '').toLowerCase();
      return `${cleanSymbol}_${timeframe.toLowerCase()}_${exchange.toLowerCase()}_crypto_ohlcv`;
    }
  }

  /**
   * Reconstruct crypto symbol from table name part
   */
  reconstructCryptoSymbol(symbolPart) {
    // Common crypto symbol patterns
    const patterns = [
      { pattern: /^btcusdt$/i, symbol: 'BTC/USDT' },
      { pattern: /^ethusdt$/i, symbol: 'ETH/USDT' },
      { pattern: /^adausdt$/i, symbol: 'ADA/USDT' },
      { pattern: /^solusdt$/i, symbol: 'SOL/USDT' },
      { pattern: /^dotusdt$/i, symbol: 'DOT/USDT' }
    ];
    
    for (const { pattern, symbol } of patterns) {
      if (pattern.test(symbolPart)) {
        return symbol;
      }
    }
    
    // Generic fallback for USDT pairs
    if (symbolPart.toLowerCase().endsWith('usdt')) {
      const base = symbolPart.slice(0, -4).toUpperCase();
      return `${base}/USDT`;
    }
    
    // Return as-is if no pattern matches
    return symbolPart.toUpperCase();
  }

  /**
   * Calculate days between two dates
   */
  calculateDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    return Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
  }
}

module.exports = SymbolMetadataManager;