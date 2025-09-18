/**
 * Database Metadata Manager
 * Manages symbol metadata stored directly in PostgreSQL database
 */

const { pool } = require('../config/database');

class DatabaseMetadataManager {
  constructor() {
    this.pool = pool;
  }

  /**
   * Initialize metadata tables and functions
   */
  async initializeMetadataSchema() {
    try {
      const schemaSQL = require('fs').readFileSync(
        require('path').join(__dirname, 'schema', 'metadata_tables.sql'),
        'utf8'
      );
      
      await this.pool.query(schemaSQL);
      console.log('✅ Metadata schema initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize metadata schema:', error);
      throw error;
    }
  }

  /**
   * Create or update metadata record for a symbol
   */
  async upsertSymbolMetadata(symbol, tableName, assetType, exchange = null) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO symbol_metadata (
          symbol, table_name, asset_type, exchange
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (table_name) 
        DO UPDATE SET
          symbol = EXCLUDED.symbol,
          asset_type = EXCLUDED.asset_type,
          exchange = EXCLUDED.exchange,
          last_metadata_update = NOW()
        RETURNING id
      `;
      
      const result = await client.query(query, [symbol, tableName, assetType, exchange]);
      
      console.log(`✅ Metadata record created/updated for ${symbol}`);
      return result.rows[0].id;
      
    } catch (error) {
      console.error(`❌ Failed to create metadata for ${symbol}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
  /**
   * Refresh metadata statistics from actual table data
   */
  async refreshMetadata(tableName) {
    const client = await this.pool.connect();
    
    try {
      await client.query('SELECT refresh_symbol_metadata($1)', [tableName]);
      console.log(`✅ Refreshed metadata for table: ${tableName}`);
      
    } catch (error) {
      console.error(`❌ Failed to refresh metadata for ${tableName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get symbols that need updating
   */
  async getSymbolsNeedingUpdate() {
    try {
      const result = await this.pool.query('SELECT * FROM get_symbols_needing_update()');
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get symbols needing update:', error);
      throw error;
    }
  }

  /**
   * Get metadata for specific symbol
   */
  async getSymbolMetadata(symbol, assetType, exchange = null) {
    try {
      const query = `
        SELECT * FROM symbol_metadata 
        WHERE symbol = $1 AND asset_type = $2 
        AND ($3::TEXT IS NULL OR exchange = $3)
      `;
      
      const result = await this.pool.query(query, [symbol, assetType, exchange]);
      return result.rows[0] || null;
      
    } catch (error) {
      console.error(`Failed to get metadata for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get all metadata with summary statistics
   */
/**
 * Get all metadata with summary statistics
 */
  async getAllMetadata() {
    try {
      const query = `
        SELECT 
          symbol,
          table_name,
          asset_type,
          exchange,
          total_records,
          first_available_timestamp,
          last_available_timestamp,
          coverage_days,
          volume_available,
          data_format,
          day_of_week_distribution,
          last_metadata_update,
          can_update_from,
          last_data_update
        FROM symbol_metadata
        ORDER BY asset_type, symbol
      `;
      
      const result = await this.pool.query(query);
      return result.rows;
      
    } catch (error) {
      console.error('Failed to get all metadata:', error);
      return [];
    }
  }

  /**
   * Plan incremental update for a symbol
   */
  async planIncrementalUpdate(symbol, assetType, exchange = null) {
    const metadata = await this.getSymbolMetadata(symbol, assetType, exchange);
    
    if (!metadata) {
      return {
        symbol,
        updateType: 'full',
        reason: 'no_metadata',
        fromDate: null,
        toDate: this.getEndOfPreviousDay()
      };
    }

    const now = new Date();
    const lastUpdate = new Date(metadata.can_update_from);
    const endDate = this.getEndOfPreviousDay();

    if (lastUpdate >= endDate) {
      return {
        symbol,
        updateType: 'none',
        reason: 'up_to_date',
        fromDate: null,
        toDate: null
      };
    }

    return {
      symbol,
      updateType: 'incremental',
      reason: 'gap_detected',
      fromDate: lastUpdate,
      toDate: endDate,
      gapDays: Math.ceil((endDate - lastUpdate) / (1000 * 60 * 60 * 24))
    };
  }

  /**
   * Get end of previous day (for safe incremental updates)
   */
  getEndOfPreviousDay() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    return yesterday;
  }

  /**
   * Mark symbol as updated (after successful data import)
   */
  async markSymbolUpdated(tableName) {
    try {
      await this.refreshMetadata(tableName);
      console.log(`✅ Marked ${tableName} as updated`);
    } catch (error) {
      console.error(`❌ Failed to mark ${tableName} as updated:`, error);
    }
  }

  /**
   * Generate update plan for all symbols
   */
  async generateUpdatePlan() {
    const symbolsToUpdate = await this.getSymbolsNeedingUpdate();
    const updatePlan = [];

    for (const symbolData of symbolsToUpdate) {
      const plan = await this.planIncrementalUpdate(
        symbolData.symbol,
        symbolData.asset_type,
        symbolData.exchange
      );
      updatePlan.push(plan);
    }

    return {
      totalSymbols: updatePlan.length,
      fullUpdates: updatePlan.filter(p => p.updateType === 'full').length,
      incrementalUpdates: updatePlan.filter(p => p.updateType === 'incremental').length,
      upToDate: updatePlan.filter(p => p.updateType === 'none').length,
      symbols: updatePlan
    };
  }
}

module.exports = DatabaseMetadataManager;