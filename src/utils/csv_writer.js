/**
 * CSV writer utility for financial data export
 */

const fs = require('fs').promises;
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class CSVWriter {
  constructor(baseDataPath) {
    this.baseDataPath = baseDataPath;
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  generateFilename(instrument, timeframe, dateRange) {
    const fromDate = dateRange.from.toISOString().split('T')[0];
    const toDate = dateRange.to.toISOString().split('T')[0];
    return `${instrument}_${timeframe}_${fromDate}_to_${toDate}.csv`;
  }

  async writeTradFiData(data, instrument, timeframe, dateRange) {
    const filename = this.generateFilename(instrument, timeframe, dateRange);
    const filePath = path.join(this.baseDataPath, 'tradfi', filename);
    
    // Ensure directory exists
    await this.ensureDirectoryExists(path.dirname(filePath));

    // Define CSV headers for TradFi data
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'open', title: 'open' },
        { id: 'high', title: 'high' },
        { id: 'low', title: 'low' },
        { id: 'close', title: 'close' },
        { id: 'volume', title: 'volume' }
      ]
    });

    // Transform data to match CSV format
    const csvData = data.map(record => ({
      timestamp: new Date(record.timestamp).toISOString(),
      open: record.open,
      high: record.high,
      low: record.low,
      close: record.close,
      volume: record.volume || 0
    }));

    await csvWriter.writeRecords(csvData);
    return filePath;
  }

  async writeCryptoData(data, symbol, timeframe, dateRange) {
    const filename = this.generateFilename(symbol, timeframe, dateRange);
    const filePath = path.join(this.baseDataPath, 'crypto', filename);
    
    // Ensure directory exists
    await this.ensureDirectoryExists(path.dirname(filePath));

    // Define CSV headers for crypto data (similar structure)
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'open', title: 'open' },
        { id: 'high', title: 'high' },
        { id: 'low', title: 'low' },
        { id: 'close', title: 'close' },
        { id: 'volume', title: 'volume' }
      ]
    });

    // Transform data to match CSV format
    const csvData = data.map(record => ({
      timestamp: new Date(record.timestamp).toISOString(),
      open: record.open,
      high: record.high,
      low: record.low,
      close: record.close,
      volume: record.volume || 0
    }));

    await csvWriter.writeRecords(csvData);
    return filePath;
  }

  async appendData(filePath, newData) {
    // For future use when we need to append data to existing files
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'open', title: 'open' },
        { id: 'high', title: 'high' },
        { id: 'low', title: 'low' },
        { id: 'close', title: 'close' },
        { id: 'volume', title: 'volume' }
      ],
      append: true
    });

    await csvWriter.writeRecords(newData);
  }
}

module.exports = CSVWriter;