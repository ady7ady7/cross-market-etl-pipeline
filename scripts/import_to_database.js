/**
 * Import to Database Script V2
 * Uses symbol-based tables and metadata-driven operations
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const SymbolDatabaseManager = require('../src/database/symbol_manager');
const { testConnection } = require('../src/config/database');

async function importToDatabase() {
  console.log('📥 Importing CSV data to symbol-based PostgreSQL tables...\n');
  
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
    
    // Show final statistics from metadata
    console.log('\n📈 Database Statistics (from metadata):');
    const allMetadata = await dbManager.metadataManager.getAllSymbolMetadata();
    
    const tradfiMetadata = allMetadata.filter(m => m.asset_type === 'tradfi');
    const cryptoMetadata = allMetadata.filter(m => m.asset_type === 'crypto');
    
    if (tradfiMetadata.length > 0) {
      console.log('\n🏦 TradFi Assets:');
      tradfiMetadata.forEach(asset => {
        const totalDays = asset.coverage_days;
        const recordsPerDay = totalDays > 0 ? Math.round(asset.total_records / totalDays) : 0;
        
        console.log(`   📊 ${asset.symbol}: ${asset.total_records.toLocaleString()} records`);
        console.log(`      📅 ${asset.first_available_timestamp?.split('T')[0]} → ${asset.last_available_timestamp?.split('T')[0]} (${totalDays} days)`);
        console.log(`      📈 ~${recordsPerDay} records/day | Volume: ${asset.volume_available ? '✅' : '❌'}`);
        console.log(`      📄 Table: ${asset.table_name}`);
        
        // Show day of week distribution
        const dow = asset.day_of_week_distribution;
        console.log(`      📆 Trading days: M:${dow.monday} T:${dow.tuesday} W:${dow.wednesday} T:${dow.thursday} F:${dow.friday} S:${dow.saturday} S:${dow.sunday}`);
      });
    }
    
    if (cryptoMetadata.length > 0) {
      console.log('\n🪙 Crypto Assets:');
      cryptoMetadata.forEach(asset => {
        const totalDays = asset.coverage_days;
        const recordsPerDay = totalDays > 0 ? Math.round(asset.total_records / totalDays) : 0;
        
        console.log(`   📊 ${asset.symbol} (${asset.exchange}): ${asset.total_records.toLocaleString()} records`);
        console.log(`      📅 ${asset.first_available_timestamp?.split('T')[0]} → ${asset.last_available_timestamp?.split('T')[0]} (${totalDays} days)`);
        console.log(`      📈 ~${recordsPerDay} records/day | Volume: ${asset.volume_available ? '✅' : '❌'}`);
        console.log(`      📄 Table: ${asset.table_name}`);
        
        // Show day of week distribution (crypto trades 7 days)
        const dow = asset.day_of_week_distribution;
        console.log(`      📆 Daily distribution: M:${dow.monday} T:${dow.tuesday} W:${dow.wednesday} T:${dow.thursday} F:${dow.friday} S:${dow.saturday} S:${dow.sunday}`);
      });
    }
    
    console.log('\n📁 Generated files:');
    console.log('   📄 ./metadata/symbols/ - Individual symbol metadata files');
    console.log('   📋 ./metadata/summary.json - Overall database summary');
    
    const totalTables = tradfiMetadata.length + cryptoMetadata.length;
    const totalRecords = result.inserted + result.updated;
    
    console.log('\n✅ Symbol-based database import completed successfully!');
    console.log(`📊 Created ${totalTables} symbol-specific tables`);
    console.log(`📈 Processed ${totalRecords.toLocaleString()} total records`);
    
    console.log('\n💡 Next steps:');
    console.log('   - Check metadata files to understand your data coverage');
    console.log('   - Use metadata to run incremental updates (avoiding duplicates)');
    console.log('   - Query specific symbol tables for analysis');
    console.log('   - Run additional ETL cycles with different date ranges');
    
    console.log('\n📝 Example queries:');
    if (tradfiMetadata.length > 0) {
      const firstTradfi = tradfiMetadata[0];
      console.log(`   TradFi: SELECT * FROM ${firstTradfi.table_name} WHERE day_of_week = 'Monday' LIMIT 5;`);
    }
    if (cryptoMetadata.length > 0) {
      const firstCrypto = cryptoMetadata[0];
      console.log(`   Crypto: SELECT * FROM ${firstCrypto.table_name} WHERE day_of_week IN ('Saturday', 'Sunday') LIMIT 5;`);
    }

    // Clean up CSV files after successful import
    console.log('\n🧹 Cleaning up CSV files...');
    await cleanupCSVFiles();

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Database import failed:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   - Database connection is working');
    console.error('   - CSV files exist in ./data/tradfi/ and ./data/crypto/');
    console.error('   - Run ETL pipeline first: npm run import:all');
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
  importToDatabase();
}

module.exports = importToDatabase;