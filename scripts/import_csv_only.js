/**
 * CSV-Only Import Script
 *
 * This script assumes you already have CSV files and just want to import
 * them to the database with specific timeframe filtering.
 *
 * This is a simpler alternative to running the full ETL pipeline
 * when you just want to process existing CSV files.
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const SymbolDatabaseManager = require('../src/database/symbol_manager');
const { testConnection } = require('../src/config/database');

async function importCSVOnly() {
  console.log('📥 Importing existing CSV data to database...\n');

  try {
    // Test database connection
    console.log('🔗 Testing database connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // Initialize database manager
    const dbManager = new SymbolDatabaseManager();

    // Initialize schema and functions
    console.log('🗄️  Initializing database schema and functions...');
    await dbManager.initializeSchema();

    // Import all CSV files to symbol-specific tables
    console.log('📊 Starting CSV import to symbol tables...\n');
    const result = await dbManager.importAllCSVFiles();

    console.log('\n✅ CSV import completed successfully!');
    console.log(`📈 Processed ${(result.inserted + result.updated).toLocaleString()} total records`);
    console.log(`📁 Total files processed: ${result.files}`);

    // Clean up CSV files after successful import
    console.log('\n🧹 Cleaning up CSV files...');
    await cleanupCSVFiles();

    process.exit(0);

  } catch (error) {
    console.error('\n❌ CSV import failed:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   - Database connection is working');
    console.error('   - CSV files exist in ./data/tradfi/ and ./data/crypto/');
    console.error('   - CSV files are named with timeframe patterns (e.g., symbol_m5_date.csv)');
    process.exit(1);
  }
}

/**
 * Clean up CSV files after successful import
 */
async function cleanupCSVFiles() {
  const dataDir = path.join(__dirname, '..', 'data');
  const tradfiDir = path.join(dataDir, 'tradfi');
  const cryptoDir = path.join(dataDir, 'crypto');

  let deletedCount = 0;

  try {
    // Clean TradFi CSV files
    try {
      const tradfiFiles = await fs.readdir(tradfiDir);
      const tradfiCSVs = tradfiFiles.filter(f => f.endsWith('.csv'));

      for (const file of tradfiCSVs) {
        await fs.unlink(path.join(tradfiDir, file));
        deletedCount++;
      }

      if (tradfiCSVs.length > 0) {
        console.log(`   ✅ Deleted ${tradfiCSVs.length} TradFi CSV file(s)`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`   ⚠️  Could not clean TradFi directory: ${error.message}`);
      }
    }

    // Clean Crypto CSV files
    try {
      const cryptoFiles = await fs.readdir(cryptoDir);
      const cryptoCSVs = cryptoFiles.filter(f => f.endsWith('.csv'));

      for (const file of cryptoCSVs) {
        await fs.unlink(path.join(cryptoDir, file));
        deletedCount++;
      }

      if (cryptoCSVs.length > 0) {
        console.log(`   ✅ Deleted ${cryptoCSVs.length} Crypto CSV file(s)`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`   ⚠️  Could not clean Crypto directory: ${error.message}`);
      }
    }

    if (deletedCount > 0) {
      console.log(`\n✅ Successfully cleaned up ${deletedCount} CSV file(s)`);
    } else {
      console.log('   ℹ️  No CSV files to clean up');
    }

  } catch (error) {
    console.warn(`⚠️  Error during cleanup: ${error.message}`);
    // Don't throw - cleanup is non-critical
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Import interrupted');
  process.exit(1);
});

if (require.main === module) {
  importCSVOnly();
}

module.exports = importCSVOnly;