/**
 * Unified Database Manager
 * Consolidated orchestrator for database operations
 * Exports all metadata and symbol management functionality
 *
 * This module consolidates three separate managers:
 * - DatabaseMetadataManager: CRUD operations on symbol_metadata table
 * - SymbolDatabaseManager: Symbol table and database schema management
 * - SymbolMetadataManager: Metadata file generation
 */

const DatabaseMetadataManager = require('./db_metadata_manager');
const SymbolDatabaseManager = require('./symbol_manager');
const SymbolMetadataManager = require('./symbol_metadata_manager');

/**
 * Unified manager providing all database operations
 */
class DatabaseManager {
  constructor() {
    // Initialize all sub-managers
    this.dbMetadata = new DatabaseMetadataManager();
    this.symbolDb = new SymbolDatabaseManager();
    this.symbolMetadata = new SymbolMetadataManager();
  }

  // ============================================================================
  // Schema Initialization
  // ============================================================================

  /**
   * Initialize all database schemas and functions
   */
  async initializeSchema() {
    return this.symbolDb.initializeSchema();
  }

  // ============================================================================
  // Symbol & Table Management (delegated to SymbolDatabaseManager)
  // ============================================================================

  getTableName(symbol, assetType, timeframe = 'm1', exchange = null) {
    return this.symbolDb.getTableName(symbol, assetType, timeframe, exchange);
  }

  async getOrCreateSymbolTable(symbol, assetType, timeframe = 'm1', exchange = null) {
    return this.symbolDb.getOrCreateSymbolTable(symbol, assetType, timeframe, exchange);
  }

  async getAllSymbols() {
    return this.symbolDb.getAllSymbols();
  }

  async importCSVData(filePath, tableName, batchSize = 5000) {
    return this.symbolDb.importCSVData(filePath, tableName, batchSize);
  }

  // ============================================================================
  // Database Metadata CRUD (delegated to DatabaseMetadataManager)
  // ============================================================================

  async upsertSymbolMetadata(symbol, tableName, assetType, exchange = null, timeframe = 'm1') {
    return this.dbMetadata.upsertSymbolMetadata(symbol, tableName, assetType, exchange, timeframe);
  }

  async getSymbolsNeedingUpdate() {
    return this.dbMetadata.getSymbolsNeedingUpdate();
  }

  async refreshSymbolMetadata() {
    return this.dbMetadata.refreshSymbolMetadata();
  }

  async getAllSymbolMetadata() {
    return this.dbMetadata.getAllSymbolMetadata();
  }

  // ============================================================================
  // File-Based Metadata Generation (delegated to SymbolMetadataManager)
  // ============================================================================

  async generateAllMetadata() {
    return this.symbolMetadata.generateAllMetadata();
  }

  async generateSymbolMetadata(tableName, assetType, symbol, timeframe, exchange = null) {
    return this.symbolMetadata.generateSymbolMetadata(tableName, assetType, symbol, timeframe, exchange);
  }

  async updateMetadataForSymbol(tableName, assetType, symbol, timeframe, exchange = null) {
    return this.symbolMetadata.updateMetadataForSymbol(tableName, assetType, symbol, timeframe, exchange);
  }

  async scanTableAndUpdateMetadata(tableName) {
    return this.symbolMetadata.scanTableAndUpdateMetadata(tableName);
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Full workflow: Create table, import CSV, and generate metadata
   */
  async processSymbol(symbol, assetType, filePath, timeframe = 'm1', exchange = null) {
    // Step 1: Create table if it doesn't exist
    const tableName = await this.getOrCreateSymbolTable(symbol, assetType, timeframe, exchange);

    // Step 2: Import CSV data
    const importResult = await this.importCSVData(filePath, tableName);

    // Step 3: Update database metadata
    await this.upsertSymbolMetadata(symbol, tableName, assetType, exchange, timeframe);

    // Step 4: Generate file-based metadata
    await this.generateSymbolMetadata(tableName, assetType, symbol, timeframe, exchange);

    return {
      tableName,
      recordsImported: importResult.recordsImported,
      filePath
    };
  }

  /**
   * Quick initialization + full metadata refresh
   */
  async initializeAndRefresh() {
    await this.initializeSchema();
    await this.refreshSymbolMetadata();
    await this.generateAllMetadata();
    return { initialized: true, refreshed: true };
  }
}

// ============================================================================
// Exports
// ============================================================================

// Export unified manager as default
module.exports = DatabaseManager;

// Also export individual managers for direct access if needed
module.exports.DatabaseMetadataManager = DatabaseMetadataManager;
module.exports.SymbolDatabaseManager = SymbolDatabaseManager;
module.exports.SymbolMetadataManager = SymbolMetadataManager;

// For backward compatibility with existing imports
module.exports.default = DatabaseManager;
