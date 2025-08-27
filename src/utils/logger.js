/**
 * Logging utility for ETL pipeline with progress tracking
 * Supports both console and file logging
 */

const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor(processName = 'ETL Process', enableFileLogging = true, logsPath = './logs') {
    this.processName = processName;
    this.startTime = null;
    this.totalItems = 0;
    this.processedItems = 0;
    this.errors = [];
    this.enableFileLogging = enableFileLogging;
    this.logsPath = logsPath;
    this.logFile = null;
    this.logBuffer = [];
  }

  async initializeLogging() {
    if (this.enableFileLogging) {
      // Ensure logs directory exists
      try {
        await fs.access(this.logsPath);
      } catch {
        await fs.mkdir(this.logsPath, { recursive: true });
      }

      // Create log filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFileName = `${this.processName.toLowerCase().replace(/\s+/g, '_')}_${timestamp}.log`;
      this.logFile = path.join(this.logsPath, logFileName);
      
      // Initialize log file with header
      await this.writeToFile(`=== ${this.processName} Log Started ===`);
      await this.writeToFile(`Log file: ${this.logFile}`);
      await this.writeToFile(`Timestamp: ${new Date().toISOString()}`);
      await this.writeToFile('='.repeat(80));
    }
  }

  async writeToFile(message) {
    if (this.enableFileLogging && this.logFile) {
      try {
        await fs.appendFile(this.logFile, message + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error.message);
      }
    }
  }

  async log(level, message, error = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.upper()}] ${message}`;
    
    // Console logging with emojis
    const emoji = {
      'INFO': 'ℹ️ ',
      'SUCCESS': '✅',
      'WARN': '⚠️ ',
      'ERROR': '❌',
      'DEBUG': '🔍'
    }[level.toUpperCase()] || '';
    
    console.log(`${emoji} [${timestamp}] ${message}`);
    
    // File logging (plain text, no emojis)
    await this.writeToFile(logMessage);
    
    if (error) {
      const errorDetails = `   Error details: ${error.message}`;
      console.log(errorDetails);
      await this.writeToFile(`   Error details: ${error.message}`);
      await this.writeToFile(`   Stack trace: ${error.stack}`);
      this.errors.push({ message, error: error.message, timestamp });
    }
  }

  async start(totalItems = 0) {
    await this.initializeLogging();
    
    this.startTime = Date.now();
    this.totalItems = totalItems;
    this.processedItems = 0;
    this.errors = [];
    
    const startMessage = `Starting ${this.processName}`;
    const timeMessage = `Start time: ${new Date(this.startTime).toISOString()}`;
    const separator = '─'.repeat(60);
    
    console.log(`\n🚀 ${startMessage}`);
    console.log(`📅 ${timeMessage}`);
    if (totalItems > 0) {
      console.log(`📊 Total items to process: ${totalItems}`);
    }
    console.log(separator);

    await this.writeToFile(`\n${startMessage}`);
    await this.writeToFile(timeMessage);
    if (totalItems > 0) {
      await this.writeToFile(`Total items to process: ${totalItems}`);
    }
    await this.writeToFile(separator);
  }

  async info(message) {
    await this.log('INFO', message);
  }

  async success(message) {
    await this.log('SUCCESS', message);
  }

  async warn(message) {
    await this.log('WARN', message);
  }

  async error(message, error = null) {
    await this.log('ERROR', message, error);
  }

  async debug(message) {
    await this.log('DEBUG', message);
  }

  async updateProgress(increment = 1) {
    this.processedItems += increment;
    
    let progressMessage;
    if (this.totalItems > 0) {
      const percentage = ((this.processedItems / this.totalItems) * 100).toFixed(1);
      const elapsed = Date.now() - this.startTime;
      const avgTimePerItem = elapsed / this.processedItems;
      const remaining = this.totalItems - this.processedItems;
      const estimatedTimeLeft = remaining * avgTimePerItem;
      
      progressMessage = `Progress: ${this.processedItems}/${this.totalItems} (${percentage}%) | ETA: ${this.formatDuration(estimatedTimeLeft)}`;
    } else {
      progressMessage = `Processed: ${this.processedItems} items`;
    }

    console.log(`📈 ${progressMessage}`);
    await this.writeToFile(`Progress: ${progressMessage}`);
  }

  async batch(batchNumber, totalBatches, itemsInBatch) {
    const percentage = totalBatches > 0 ? ((batchNumber / totalBatches) * 100).toFixed(1) : '0.0';
    const batchMessage = `Processing batch ${batchNumber}/${totalBatches} (${percentage}%) - ${itemsInBatch} items`;
    
    console.log(`📦 ${batchMessage}`);
    await this.writeToFile(`Batch: ${batchMessage}`);
  }

  async pause(duration) {
    const pauseMessage = `Pausing for ${duration}ms to respect rate limits...`;
    console.log(`⏸️  ${pauseMessage}`);
    await this.writeToFile(`Pause: ${pauseMessage}`);
  }

  async complete(dataCount = null, filePath = null) {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    const separator = '─'.repeat(60);
    
    const summary = [
      separator,
      `${this.processName} completed!`,
      `Total duration: ${this.formatDuration(totalDuration)}`,
      `Items processed: ${this.processedItems}`
    ];

    if (dataCount !== null) {
      summary.push(`Data records: ${dataCount}`);
    }
    
    if (filePath) {
      summary.push(`Data saved to: ${filePath}`);
    }
    
    if (this.errors.length > 0) {
      summary.push(`Errors encountered: ${this.errors.length}`);
    }
    
    summary.push(`End time: ${new Date(endTime).toISOString()}`);

    // Console output with emojis
    console.log(separator);
    console.log(`🎉 ${this.processName} completed!`);
    console.log(`⏱️  Total duration: ${this.formatDuration(totalDuration)}`);
    console.log(`📊 Items processed: ${this.processedItems}`);
    
    if (dataCount !== null) {
      console.log(`📈 Data records: ${dataCount}`);
    }
    
    if (filePath) {
      console.log(`💾 Data saved to: ${filePath}`);
    }
    
    if (this.enableFileLogging && this.logFile) {
      console.log(`📄 Log file saved to: ${this.logFile}`);
    }
    
    if (this.errors.length > 0) {
      console.log(`⚠️  Errors encountered: ${this.errors.length}`);
      this.errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. ${err.message}`);
      });
    }
    
    console.log(`🏁 End time: ${new Date(endTime).toISOString()}\n`);

    // File logging (plain text)
    for (const line of summary) {
      await this.writeToFile(line);
    }

    if (this.errors.length > 0) {
      await this.writeToFile(`\nError Summary:`);
      this.errors.forEach((err, idx) => {
        this.writeToFile(`${idx + 1}. ${err.message} (${err.timestamp})`);
      });
    }

    await this.writeToFile(`\n=== ${this.processName} Log Completed ===`);
  }

  formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
  }
}

module.exports = Logger;