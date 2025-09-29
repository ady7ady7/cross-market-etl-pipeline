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

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Import interrupted');
  process.exit(1);
});

if (require.main === module) {
  importCSVOnly();
}

module.exports = importCSVOnly;