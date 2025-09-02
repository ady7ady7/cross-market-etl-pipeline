/**
 * Scheduled Update Service
 * Automates data updates based on database metadata
 */

const DatabaseMetadataManager = require('../database/db_metadata_manager');
const SymbolDatabaseManager = require('../database/symbol_manager');

class ScheduledUpdater {
  constructor() {
    this.dbMetadata = new DatabaseMetadataManager();
    this.dbManager = new SymbolDatabaseManager();
  }

  /**
   * Main update orchestration - to be called by cron/scheduler
   */
  async runScheduledUpdates() {
    console.log('🕒 Starting scheduled data updates...');
    console.log(`📅 Current time: ${new Date().toISOString()}\n`);

    try {
      // Generate update plan
      const updatePlan = await this.dbMetadata.generateUpdatePlan();
      
      console.log('📋 Update Plan:');
      console.log(`   Total symbols: ${updatePlan.totalSymbols}`);
      console.log(`   Full updates: ${updatePlan.fullUpdates}`);
      console.log(`   Incremental updates: ${updatePlan.incrementalUpdates}`);
      console.log(`   Up to date: ${updatePlan.upToDate}\n`);

      if (updatePlan.totalSymbols === 0) {
        console.log('✅ All symbols are up to date');
        return;
      }

      // Execute updates
      let successCount = 0;
      let errorCount = 0;

      for (const symbolPlan of updatePlan.symbols) {
        if (symbolPlan.updateType === 'none') continue;

        console.log(`🔄 Updating ${symbolPlan.symbol}...`);
        console.log(`   Type: ${symbolPlan.updateType}`);
        console.log(`   Reason: ${symbolPlan.reason}`);
        
        if (symbolPlan.fromDate && symbolPlan.toDate) {
          console.log(`   Date range: ${symbolPlan.fromDate.toISOString().split('T')[0]} to ${symbolPlan.toDate.toISOString().split('T')[0]}`);
          console.log(`   Gap: ${symbolPlan.gapDays} days`);
        }

        try {
          await this.executeSymbolUpdate(symbolPlan);
          successCount++;
          console.log(`   ✅ ${symbolPlan.symbol} updated successfully\n`);
        } catch (error) {
          errorCount++;
          console.error(`   ❌ Failed to update ${symbolPlan.symbol}:`, error.message);
        }
      }

      console.log('📊 Update Summary:');
      console.log(`   ✅ Successful: ${successCount}`);
      console.log(`   ❌ Failed: ${errorCount}`);
      console.log(`   🕒 Completed: ${new Date().toISOString()}`);

    } catch (error) {
      console.error('❌ Scheduled update failed:', error);
      throw error;
    }
  }

  /**
   * Execute update for a single symbol
   */
  async executeSymbolUpdate(symbolPlan) {
    // This would integrate with your existing ETL pipeline
    // For now, placeholder that shows the concept

    const { symbol, updateType, fromDate, toDate } = symbolPlan;

    if (updateType === 'full') {
      // Trigger full data import
      console.log(`   🔄 Triggering full import for ${symbol}`);
      // await this.triggerFullImport(symbol);
    } else if (updateType === 'incremental') {
      // Trigger incremental import
      console.log(`   📈 Triggering incremental import for ${symbol}`);
      console.log(`   📅 From: ${fromDate.toISOString()} to: ${toDate.toISOString()}`);
      // await this.triggerIncrementalImport(symbol, fromDate, toDate);
    }

    // Simulate processing time
    await this.sleep(1000);
  }

  /**
   * Check what updates are needed (dry run)
   */
  async checkUpdatesNeeded() {
    const updatePlan = await this.dbMetadata.generateUpdatePlan();
    
    console.log('🔍 Update Check Results:\n');
    
    updatePlan.symbols.forEach(symbol => {
      console.log(`📊 ${symbol.symbol}:`);
      console.log(`   Status: ${symbol.updateType}`);
      console.log(`   Reason: ${symbol.reason}`);
      
      if (symbol.gapDays) {
        console.log(`   Gap: ${symbol.gapDays} days`);
      }
      
      console.log('');
    });

    return updatePlan;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface for testing
async function main() {
  const updater = new ScheduledUpdater();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--check')) {
    await updater.checkUpdatesNeeded();
  } else if (args.includes('--run')) {
    await updater.runScheduledUpdates();
  } else {
    console.log('Usage:');
    console.log('  node src/services/scheduled_updater.js --check  # Check what needs updating');
    console.log('  node src/services/scheduled_updater.js --run    # Run scheduled updates');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ScheduledUpdater;