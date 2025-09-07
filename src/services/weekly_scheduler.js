/**
 * Simple Weekly Scheduler
 * This file is kept for manual/testing use
 * src/services/weekly_scheduler.js
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pool, testConnection } = require('../config/database');

class WeeklyScheduler {
  constructor() {
    this.configPath = path.join(__dirname, '../../config.json');
    this.originalConfig = null;
    this.isRunning = false;
  }

  /**
   * Start the weekly scheduler
   */
  async start() {
    console.log('🚀 Starting Weekly ETL Scheduler');
    console.log('📅 Current time:', new Date().toISOString());
    console.log('⏰ Schedule: Every Sunday at 4:00 AM UTC');
    console.log('📊 Fetch: Last 10 days (3-day overlap)');
    console.log('🗄️  Uses: Database metadata + config.json\n');

    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    // Weekly run every Sunday at 4:00 AM UTC
    cron.schedule('0 4 * * 0', async () => {
      await this.runWeeklyETL();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('✅ Scheduler started. Press Ctrl+C to stop.\n');
    
    // Keep process alive
    setInterval(() => {}, 60000);
  }

  /**
   * Run weekly ETL with metadata-driven date calculation
   */
  async runWeeklyETL() {
    if (this.isRunning) {
      console.log('⚠️ ETL already running, skipping');
      return;
    }

    this.isRunning = true;
    console.log('\n🔄 Starting Weekly ETL Run');
    console.log('📅 Time:', new Date().toISOString());

    try {
      // 1. Read database metadata to determine date range
      const dateRange = await this.calculateDateRange();
      console.log(`📊 Calculated date range: ${dateRange.from} → ${dateRange.to}`);
      console.log(`🔄 Days to fetch: ${dateRange.days} (includes 3-day overlap)`);

      // 2. Temporarily update config.json with calculated dates
      await this.updateConfigWithDates(dateRange);

      // 3. Run your existing ETL pipeline (unchanged)
      console.log('\n📈 Running ETL pipeline...');
      const success = await this.runExistingETL();

      // 4. Restore original config.json
      await this.restoreOriginalConfig();

      if (success) {
        console.log('✅ Weekly ETL completed successfully');
      } else {
        console.log('❌ Weekly ETL failed');
      }

    } catch (error) {
      console.error('❌ Weekly ETL error:', error.message);
      await this.restoreOriginalConfig();
    } finally {
      this.isRunning = false;
      console.log(`🏁 ETL run finished: ${new Date().toISOString()}\n`);
    }
  }

  /**
   * Calculate date range based on database metadata
   */
  async calculateDateRange() {
    const client = await pool.connect();
    
    try {
      // Query symbol_metadata table for latest timestamps
      const metadataQuery = `
        SELECT 
          symbol,
          asset_type,
          exchange,
          last_available_timestamp,
          can_update_from
        FROM symbol_metadata 
        WHERE last_available_timestamp IS NOT NULL
        ORDER BY last_available_timestamp ASC
        LIMIT 1
      `;

      const result = await client.query(metadataQuery);
      
      let startDate, endDate;
      
      if (result.rows.length > 0) {
        // Use oldest "last_available_timestamp" as reference
        const oldestTimestamp = new Date(result.rows[0].last_available_timestamp);
        
        // Start: 10 days before oldest timestamp (3-day overlap + 7 days)
        startDate = new Date(oldestTimestamp);
        startDate.setDate(startDate.getDate() - 10);
        
        // End: yesterday (last complete day)
        endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        
        console.log(`📊 Reference symbol: ${result.rows[0].symbol} (${result.rows[0].asset_type})`);
        console.log(`📅 Last available: ${result.rows[0].last_available_timestamp}`);
        
      } else {
        // No metadata found - use default 30-day range
        console.log('ℹ️ No metadata found, using default 30-day range');
        
        endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 30);
      }

      const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      return {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        days: days
      };

    } finally {
      client.release();
    }
  }

  /**
   * Temporarily update config.json with calculated dates
   */
  async updateConfigWithDates(dateRange) {
    // Read original config
    this.originalConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    
    // Create modified config with new dates
    const modifiedConfig = {
      ...this.originalConfig,
      dateRanges: {
        ...this.originalConfig.dateRanges,
        default: {
          from: dateRange.from,
          to: dateRange.to
        }
      }
    };

    // Write modified config
    fs.writeFileSync(this.configPath, JSON.stringify(modifiedConfig, null, 2));
    console.log('📝 Updated config.json with calculated dates');
  }

  /**
   * Restore original config.json
   */
  async restoreOriginalConfig() {
    if (this.originalConfig) {
      fs.writeFileSync(this.configPath, JSON.stringify(this.originalConfig, null, 2));
      console.log('🔄 Restored original config.json');
      this.originalConfig = null;
    }
  }

  /**
   * Run your existing ETL pipeline (completely unchanged)
   */
  async runExistingETL() {
    console.log('📊 Running existing ETL pipeline...');
    
    try {
      // Run your existing import:all script
      const importResult = await this.runCommand('npm', ['run', 'import:all']);
      if (!importResult.success) {
        console.error('❌ Data import failed');
        return false;
      }

      // Wait a bit between steps
      await this.sleep(5000);

      // Run your existing database import
      console.log('💾 Running database import...');
      const dbResult = await this.runCommand('npm', ['run', 'db:import']);
      if (!dbResult.success) {
        console.error('❌ Database import failed');
        return false;
      }

      return true;

    } catch (error) {
      console.error('❌ ETL pipeline error:', error);
      return false;
    }
  }

  /**
   * Run a command and return success/failure
   */
  async runCommand(command, args) {
    return new Promise((resolve) => {
      const process = spawn(command, args, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '../..')
      });

      process.on('close', (code) => {
        resolve({ success: code === 0, code });
      });

      process.on('error', (error) => {
        console.error(`❌ Command error (${command} ${args.join(' ')}):`, error);
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * Test the scheduler logic without running full ETL
   */
  async test() {
    console.log('🧪 Testing Weekly Scheduler\n');

    try {
      // Test database connection
      console.log('1️⃣ Testing database connection...');
      const connected = await testConnection();
      console.log(`   Database: ${connected ? '✅' : '❌'}`);

      // Test metadata query
      console.log('\n2️⃣ Testing metadata query...');
      const dateRange = await this.calculateDateRange();
      console.log(`   Date range: ${dateRange.from} → ${dateRange.to}`);
      console.log(`   Days: ${dateRange.days}`);

      // Test config update
      console.log('\n3️⃣ Testing config update...');
      const originalConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      console.log(`   Original dates: ${originalConfig.dateRanges.default.from} → ${originalConfig.dateRanges.default.to}`);
      
      await this.updateConfigWithDates(dateRange);
      const modifiedConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      console.log(`   Modified dates: ${modifiedConfig.dateRanges.default.from} → ${modifiedConfig.dateRanges.default.to}`);
      
      await this.restoreOriginalConfig();
      const restoredConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      console.log(`   Restored dates: ${restoredConfig.dateRanges.default.from} → ${restoredConfig.dateRanges.default.to}`);

      console.log('\n✅ Scheduler test completed successfully!');
      console.log('\n💡 To run:');
      console.log('   npm run scheduler:start    # Start weekly scheduler');
      console.log('   npm run scheduler:once     # Run ETL once');

    } catch (error) {
      console.error('\n❌ Scheduler test failed:', error);
    }
  }

  /**
   * Run ETL once (for testing/manual runs)
   */
  async runOnce() {
    console.log('🔄 Running ETL once...');
    await this.runWeeklyETL();
    process.exit(0);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const scheduler = new WeeklyScheduler();
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    await scheduler.test();
  } else if (args.includes('--run-once')) {
    await scheduler.runOnce();
  } else {
    await scheduler.start();
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Received shutdown signal');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

module.exports = WeeklyScheduler;