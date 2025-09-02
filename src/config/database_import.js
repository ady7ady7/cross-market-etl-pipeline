/**
 * Database Import Configuration
 * Optimized for sanity and meaningful logging
 */

// Batch Processing Settings
const READ_BATCH_SIZE = 1000;           // Records to read before processing
const INSERT_BATCH_SIZE = 5000;        // Records per database transaction (larger = faster)
const PROGRESS_INTERVAL = 50000;       // Show progress every N rows (much less spam)

// Streaming Processing Settings
const STREAM_BATCH_SIZE = 100000;      // Process in very large chunks (less frequent flushes)
const ENABLE_STREAMING = true;         // Use streaming for large files

// Database Connection Settings
const QUERY_TIMEOUT = 60000;           // Query timeout in ms (1 minute)
const MAX_RETRIES = 2;                 // Retry failed operations (fail faster)
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