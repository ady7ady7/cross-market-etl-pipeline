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
    const filePath = path.join(this.baseDataPath, filename);
    
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

    // Transform data to match CSV format with proper timestamp handling
    const csvData = data.map(record => {
      let timestamp, open, high, low, close, volume;
      
      // Handle both object format and array format from dukascopy-node
      if (Array.isArray(record)) {
        // Array format: [timestamp, open, high, low, close, volume]
        [timestamp, open, high, low, close, volume] = record;
      } else if (typeof record === 'object' && record !== null) {
        // Object format: {timestamp, open, high, low, close, volume}
        timestamp = record.timestamp;
        open = record.open;
        high = record.high;
        low = record.low;
        close = record.close;
        volume = record.volume;
      } else {
        // Invalid record format
        console.warn('Warning: Invalid record format, skipping:', record);
        return null;
      }
      
      // Handle timestamp conversion
      let formattedTimestamp;
      try {
        if (typeof timestamp === 'number') {
          // Unix timestamp in milliseconds
          const date = new Date(timestamp);
          formattedTimestamp = date.toISOString().split('T')[0] + ' ' + 
                              date.toISOString().split('T')[1].split('.')[0];
        } else if (typeof timestamp === 'string') {
          // String timestamp - try to parse and reformat
          const date = new Date(timestamp);
          if (!isNaN(date.getTime())) {
            formattedTimestamp = date.toISOString().split('T')[0] + ' ' + 
                               date.toISOString().split('T')[1].split('.')[0];
          } else {
            formattedTimestamp = timestamp; // Use as-is if can't parse
          }
        } else {
          // Fallback
          formattedTimestamp = new Date().toISOString().split('T')[0] + ' ' + 
                              new Date().toISOString().split('T')[1].split('.')[0];
        }
      } catch (error) {
        console.warn(`Warning: Invalid timestamp for record: ${error.message}`);
        formattedTimestamp = new Date().toISOString().split('T')[0] + ' ' + 
                            new Date().toISOString().split('T')[1].split('.')[0];
      }

      return {
        timestamp: formattedTimestamp,
        open: open || 0,
        high: high || 0,
        low: low || 0,
        close: close || 0,
        volume: volume || 0
      };
    }).filter(record => record !== null); // Remove any null records

    await csvWriter.writeRecords(csvData);
    return filePath;
  }

  async writeCryptoData(data, symbol, timeframe, dateRange) {
    const filename = this.generateFilename(symbol, timeframe, dateRange);
    const filePath = path.join(this.baseDataPath, filename);
    
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