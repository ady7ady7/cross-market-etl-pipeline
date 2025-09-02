/**
 * Database Import Configuration
 * Uses master config for centralized settings
 */

const fs = require('fs');
const path = require('path');

// Load master configuration
const masterConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8'));

// Batch Processing Settings - from master config
const READ_BATCH_SIZE = 1000;
const INSERT_BATCH_SIZE = masterConfig.database.insertBatchSize;
const PROGRESS_INTERVAL = masterConfig.database.progressInterval;

// Streaming Processing Settings - from master config
const STREAM_BATCH_SIZE = 50000;
const ENABLE_STREAMING = masterConfig.database.enableStreaming;

// Database Connection Settings
const QUERY_TIMEOUT = 5000;           // Query timeout in ms (1 minute)
const MAX_RETRIES = 4;                 // Retry failed operations (fail faster)
const RETRY_DELAY = 3000;              // Delay between retries in ms

// Error Handling (MUCH less spam)
const CONTINUE_ON_BATCH_FAILURE = true;    // Continue if batch fails
const MAX_FAILED_BATCHES = 3;              // Stop after just 3 failed batches
const SKIP_MALFORMED_RECORDS = true;       // Skip bad records
const SHOW_INDIVIDUAL_BATCH_ERRORS = false; // DON'T show every single batch error

// Performance Monitoring (MUCH less verbose)
const ENABLE_TIMING_LOGS = false;          // Disable detailed timing (too much noise)
const STATS_INTERVAL = 100;               // Show stats every 100 batches (not every 10!)
const SLOW_BATCH_THRESHOLD = 10000;       // Only warn if batch takes more than 10 seconds
const SHOW_BATCH_PROGRESS = false;        // Don't show "Batch 1/2/3/4..." spam

// Data Validation
const VALIDATE_NUMBERS = true;            // Validate OHLC numbers
const SKIP_INVALID_TIMESTAMPS = true;     // Skip records with bad dates
const MAX_PRICE_VALUE = 10000000;         // Maximum allowed price

// Summary Reporting (What we actually want to see)
const SHOW_FILE_SUMMARY = true;          // Show summary per file
const SHOW_OVERALL_SUMMARY = true;       // Show overall summary at end
const SHOW_ERROR_SUMMARY = true;         // Show error summary at end (not individual errors)

module.exports = {
  // Batch settings
  READ_BATCH_SIZE,
  INSERT_BATCH_SIZE,
  PROGRESS_INTERVAL,
  
  // Streaming
  STREAM_BATCH_SIZE,
  ENABLE_STREAMING,
  
  // Database
  QUERY_TIMEOUT,
  MAX_RETRIES,
  RETRY_DELAY,
  
  // Error handling
  CONTINUE_ON_BATCH_FAILURE,
  MAX_FAILED_BATCHES,
  SKIP_MALFORMED_RECORDS,
  SHOW_INDIVIDUAL_BATCH_ERRORS,
  
  // Monitoring
  ENABLE_TIMING_LOGS,
  STATS_INTERVAL,
  SLOW_BATCH_THRESHOLD,
  SHOW_BATCH_PROGRESS,
  
  // Validation
  VALIDATE_NUMBERS,
  SKIP_INVALID_TIMESTAMPS,
  MAX_PRICE_VALUE,
  
  // Summary
  SHOW_FILE_SUMMARY,
  SHOW_OVERALL_SUMMARY,
  SHOW_ERROR_SUMMARY
};