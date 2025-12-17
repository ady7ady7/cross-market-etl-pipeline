/**
 * Simple Weekly Scheduler for Render Background Worker
 *
 * This scheduler runs every Sunday and:
 * 1. Reads symbol metadata from database
 * 2. Updates config.json to fetch data from last 2 weeks until Friday 18:00 UTC
 * 3. Runs import:all to fetch data
 * 4. Runs db:import to load data into database
 *
 * Environment variables required:
 * - DATABASE_URL: PostgreSQL connection string
 * - CA_CERT_PATH: Path to ca-certificate.crt (optional, for SSL)
 * - NODE_ENV: 'development' or 'production'
 */

require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const { pool } = require('./src/config/database');
const DataImportOrchestrator = require('./run_all_importers');
const importToDatabase = require('./scripts/import_to_database');

class WeeklyScheduler {
  constructor() {
    this.configPath = path.join(__dirname, 'config.json');
    this.isRunning = false;
  }

  /**
   * Calculate date range: last 2 weeks until last Friday 18:00 UTC
   */
  calculateDateRange() {
    const now = new Date();

    // Find last Friday
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 5 = Friday
    let daysToLastFriday = dayOfWeek <= 5 ? dayOfWeek + 2 : dayOfWeek - 5;

    const lastFriday = new Date(now);
    lastFriday.setUTCDate(now.getUTCDate() - daysToLastFriday);
    lastFriday.setUTCHours(18, 0, 0, 0); // Set to 18:00 UTC

    // Calculate start date: 2 weeks before last Friday
    const startDate = new Date(lastFriday);
    startDate.setUTCDate(lastFriday.getUTCDate() - 14);

    // Format as YYYY-MM-DD
    const formatDate = (date) => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      from: formatDate(startDate),
      to: formatDate(lastFriday)
    };
  }

  /**
   * Read symbol metadata from database
   */
  async readSymbolMetadata() {
    console.log('📊 Reading symbol metadata from database...');

    try {
      const query = `
        SELECT
          symbol,
          asset_type,
          exchange,
          timeframe,
          last_available_timestamp,
          total_records
        FROM symbol_metadata
        ORDER BY asset_type, symbol, timeframe
      `;

      const result = await pool.query(query);

      console.log(`✅ Found ${result.rows.length} symbol records in database`);

      // Group by asset type
      const tradfiSymbols = result.rows.filter(r => r.asset_type === 'tradfi');
      const cryptoSymbols = result.rows.filter(r => r.asset_type === 'crypto');

      console.log(`   📊 TradFi: ${tradfiSymbols.length} records`);
      console.log(`   🪙 Crypto: ${cryptoSymbols.length} records`);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to read symbol metadata:', error.message);
      throw error;
    }
  }

  /**
   * Update config.json with new date range
   */
  async updateConfigDateRange(dateRange) {
    console.log(`📝 Updating config.json with date range: ${dateRange.from} to ${dateRange.to}`);

    try {
      // Read current config
      const configContent = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configContent);

      // Update date range
      config.dateRanges.default = dateRange;

      // Write back to file
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );

      console.log('✅ config.json updated successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to update config.json:', error.message);
      throw error;
    }
  }

  /**
   * Run the complete ETL pipeline
   */
  async runETLPipeline() {
    console.log('\n🚀 Starting ETL Pipeline...\n');

    try {
      // Step 1: Run data import (import:all)
      console.log('📥 Step 1: Importing data from APIs...');
      const orchestrator = new DataImportOrchestrator();
      await orchestrator.runAll(false); // Don't exit - we need to continue to database import

      console.log('\n✅ Data import completed\n');

      // Small delay before database import
      await this.sleep(3000);

      // Step 2: Import to database (db:import)
      console.log('📥 Step 2: Importing data to database...');
      await importToDatabase();

      console.log('\n✅ Database import completed\n');

      return true;
    } catch (error) {
      console.error('❌ ETL Pipeline failed:', error.message);
      throw error;
    }
  }

  /**
   * Main scheduled job execution
   */
  async executeScheduledJob() {
    if (this.isRunning) {
      console.log('⚠️  Job already running, skipping this execution');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log('\n' + '='.repeat(80));
    console.log('🎯 WEEKLY SCHEDULED JOB STARTED');
    console.log('🕐 Time:', new Date().toISOString());
    console.log('='.repeat(80) + '\n');

    try {
      // Step 1: Read metadata from database
      console.log('📊 Step 1: Reading symbol metadata...\n');
      const metadata = await this.readSymbolMetadata();

      // Step 2: Calculate date range
      console.log('\n📅 Step 2: Calculating date range...\n');
      const dateRange = this.calculateDateRange();
      console.log(`   From: ${dateRange.from}`);
      console.log(`   To:   ${dateRange.to}`);

      // Step 3: Update config.json
      console.log('\n📝 Step 3: Updating configuration...\n');
      await this.updateConfigDateRange(dateRange);

      // Step 4: Run ETL pipeline
      console.log('\n🔄 Step 4: Running ETL pipeline...\n');
      await this.runETLPipeline();

      // Success summary
      const duration = Date.now() - startTime;
      console.log('\n' + '='.repeat(80));
      console.log('✅ WEEKLY SCHEDULED JOB COMPLETED SUCCESSFULLY');
      console.log(`⏱️  Duration: ${this.formatDuration(duration)}`);
      console.log('🕐 Completed:', new Date().toISOString());
      console.log('='.repeat(80) + '\n');

    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('❌ WEEKLY SCHEDULED JOB FAILED');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('='.repeat(80) + '\n');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the cron scheduler (runs every Sunday at 2:00 AM UTC)
   */
  start() {
    console.log('🚀 Starting Weekly Scheduler for Render Background Worker\n');
    console.log('⏰ Schedule: Every Sunday at 2:00 AM UTC');
    console.log('📍 Current time:', new Date().toISOString());
    console.log('🌍 Timezone: UTC\n');

    // Cron schedule: "0 2 * * 0" = Every Sunday at 2:00 AM UTC
    // Format: second minute hour day month dayOfWeek
    const schedule = '0 2 * * 0';

    cron.schedule(schedule, async () => {
      await this.executeScheduledJob();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('✅ Scheduler started successfully');
    console.log('⏳ Waiting for next scheduled execution...\n');
    console.log('💡 To test immediately, run: npm run scheduler:test\n');

    // Keep the process running
    console.log('🔄 Scheduler is running. Press Ctrl+C to stop.\n');
  }

  /**
   * Test run - execute immediately without waiting for cron
   */
  async test() {
    console.log('🧪 TEST MODE: Running scheduled job immediately\n');
    await this.executeScheduledJob();
    console.log('\n✅ Test completed');
    process.exit(0);
  }

  // Helper functions
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
  }
}

// Main execution
async function main() {
  const scheduler = new WeeklyScheduler();

  // Check command line arguments
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    // Test mode: run immediately
    await scheduler.test();
  } else {
    // Normal mode: start cron scheduler
    scheduler.start();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Scheduler shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Scheduler terminated');
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = WeeklyScheduler;
