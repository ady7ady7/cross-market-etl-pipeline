/**
 * Import to Database Script
 * Uses existing CSV files from your current importers
 * Simple, professional approach - no code duplication
 */

require('dotenv').config();
const SimpleDatabaseManager = require('../src/database/simple_manager');
const { testConnection } = require('../src/config/database');

async function importToDatabase() {
  console.log('📥 Importing CSV data to PostgreSQL database...\n');
  
  try {
    // Test database connection
    console.log('🔗 Testing database connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // Initialize database manager
    const dbManager = new SimpleDatabaseManager();
    
    // Initialize schema
    console.log('🗄️  Initializing database schema...');
    await dbManager.initializeSchema();
    
    // Import all CSV files
    console.log('📊 Starting CSV import process...\n');
    const result = await dbManager.importAllCSVFiles();
    
    // Show final statistics
    console.log('\n📈 Database Statistics:');
    const stats = await dbManager.getStats();
    
    if (stats.tradfi.length > 0) {
      console.log('\n🏦 TradFi Assets:');
      stats.tradfi.forEach(asset => {
        const days = Math.ceil((asset.last_timestamp - asset.first_timestamp) / (1000 * 60 * 60 * 24));
        console.log(`   📊 ${asset.symbol}: ${parseInt(asset.record_count).toLocaleString()} records (${days} days)`);
        console.log(`      📅 ${asset.first_timestamp.toISOString().split('T')[0]} → ${asset.last_timestamp.toISOString().split('T')[0]}`);
      });
    }
    
    if (stats.crypto.length > 0) {
      console.log('\n🪙 Crypto Assets:');
      stats.crypto.forEach(asset => {
        const days = Math.ceil((asset.last_timestamp - asset.first_timestamp) / (1000 * 60 * 60 * 24));
        console.log(`   📊 ${asset.symbol} (${asset.exchange}): ${parseInt(asset.record_count).toLocaleString()} records (${days} days)`);
        console.log(`      📅 ${asset.first_timestamp.toISOString().split('T')[0]} → ${asset.last_timestamp.toISOString().split('T')[0]}`);
      });
    }
    
    console.log('\n📁 Metadata files generated:');
    console.log('   📄 ./metadata/tradfi/ - TradFi asset metadata');
    console.log('   📄 ./metadata/crypto/ - Crypto asset metadata'); 
    console.log('   📋 ./metadata/summary.json - Overall summary');
    
    console.log('\n✅ Database import completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   - Run more ETL cycles with different date ranges');
    console.log('   - Check metadata files for data coverage');
    console.log('   - Set up periodic updates');
    
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

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Import interrupted');
  process.exit(1);
});

if (require.main === module) {
  importToDatabase();
}

module.exports = importToDatabase;