/**
 * Orchestrator script to run both TradFi and Crypto data importers
 * Can be used for cron jobs or manual execution
 * Unified JavaScript implementation (no Python required)
 */

const { spawn } = require('child_process');
const path = require('path');
const CryptoImporter = require('./src/etl/crypto_importer');

class DataImportOrchestrator {
  constructor() {
    this.results = {
      tradfi: null,
      crypto: null
    };
    this.timeframes = null;
  }

  setTimeframes(timeframes) {
    this.timeframes = timeframes;
    console.log(`🎯 Targeting timeframes: ${timeframes}`);
  }

  async runNodeImporter() {
    console.log('🔄 Starting TradFi (Node.js) data import...\n');

    return new Promise((resolve, reject) => {
      const nodePath = path.join(__dirname, 'src', 'etl', 'dukascopy_importer.js');

      // Set up environment variables
      const env = { ...process.env };
      if (this.timeframes) {
        env.TIMEFRAMES = this.timeframes;
      }

      const nodeProcess = spawn('node', [nodePath], {
        stdio: 'inherit',
        cwd: __dirname,
        env: env
      });

      nodeProcess.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ TradFi import completed successfully');
          resolve({ success: true, code });
        } else {
          console.log(`\n❌ TradFi import failed with code ${code}`);
          resolve({ success: false, code });
        }
      });

      nodeProcess.on('error', (error) => {
        console.error('❌ Failed to start TradFi importer:', error);
        reject(error);
      });
    });
  }

  async runCryptoImporter() {
    console.log('\n🔄 Starting Crypto (Node.js) data import...\n');

    try {
      const importer = new CryptoImporter();

      // Set timeframes if specified via environment variable
      if (this.timeframes) {
        process.env.TIMEFRAMES = this.timeframes;
      }

      const results = await importer.fetchAllAssets();

      console.log('\n✅ Crypto import completed successfully');
      return { success: true, results, code: 0 };
    } catch (error) {
      console.error('\n❌ Crypto import failed:', error);
      return { success: false, error: error.message, code: 1 };
    }
  }

  async runAll(exitOnComplete = true) {
    console.log('🚀 Starting Cross-Market ETL Pipeline');
    console.log('📅 Start time:', new Date().toISOString());
    console.log('═'.repeat(80));

    const startTime = Date.now();
    let tradfiResult, cryptoResult;

    try {
      // Run TradFi import first
      tradfiResult = await this.runNodeImporter();
      this.results.tradfi = tradfiResult;

      // Add small delay between importers
      console.log('\n⏸️  Waiting 5 seconds before starting crypto import...');
      await this.sleep(5000);

      // Run Crypto import second (now JavaScript-based)
      cryptoResult = await this.runCryptoImporter();
      this.results.crypto = cryptoResult;

    } catch (error) {
      console.error('\n❌ Pipeline execution failed:', error);
      if (exitOnComplete) {
        process.exit(1);
      }
      throw error;
    }

    // Final summary
    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    console.log('\n' + '═'.repeat(80));
    console.log('🎉 Cross-Market ETL Pipeline Summary');
    console.log('═'.repeat(80));
    console.log(`⏱️  Total duration: ${this.formatDuration(totalDuration)}`);
    console.log(`📊 TradFi import: ${tradfiResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`🪙 Crypto import: ${cryptoResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`🏁 End time: ${new Date().toISOString()}`);

    // Check data directories
    console.log('\n📁 Data files:');
    console.log('   TradFi data: ./data/tradfi/');
    console.log('   Crypto data: ./data/crypto/');
    console.log('   Log files: ./logs/');

    const allSuccess = tradfiResult.success && cryptoResult.success;
    console.log(`\n${allSuccess ? '🎊 All imports completed successfully!' : '⚠️  Some imports failed - check logs for details'}\n`);

    // Only exit if running as standalone script (not when called from scheduler)
    if (exitOnComplete) {
      process.exit(allSuccess ? 0 : 1);
    }

    return { success: allSuccess, tradfiResult, cryptoResult };
  }

  async runTradFiOnly() {
    console.log('🚀 Running TradFi import only...\n');
    const result = await this.runNodeImporter();
    console.log(`\n${result.success ? '🎊 TradFi import completed!' : '❌ TradFi import failed'}`);
    process.exit(result.success ? 0 : 1);
  }

  async runCryptoOnly() {
    console.log('🚀 Running Crypto import only...\n');
    const result = await this.runCryptoImporter();
    console.log(`\n${result.success ? '🎊 Crypto import completed!' : '❌ Crypto import failed'}`);
    process.exit(result.success ? 0 : 1);
  }

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
  const orchestrator = new DataImportOrchestrator();

  // Check command line arguments
  const args = process.argv.slice(2);

  // Parse timeframes argument
  const timeframesArg = args.find(arg => arg.startsWith('--timeframes='));
  if (timeframesArg) {
    const timeframes = timeframesArg.split('=')[1];
    orchestrator.setTimeframes(timeframes);
  }

  if (args.includes('--tradfi-only')) {
    await orchestrator.runTradFiOnly();
  } else if (args.includes('--crypto-only')) {
    await orchestrator.runCryptoOnly();
  } else {
    await orchestrator.runAll();
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Process interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Process terminated');
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = DataImportOrchestrator;