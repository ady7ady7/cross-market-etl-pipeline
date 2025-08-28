/**
 * Database Import Configuration
 * Simple, practical settings for CSV import performance
 */

// Batch Processing Settings
const READ_BATCH_SIZE = 5000;           // Records to read before processing (500 - less memory / 2000 - faster)
const INSERT_BATCH_SIZE = 5000;        // Records per database transaction (500 - safer / 2000 - faster)
const PROGRESS_INTERVAL = 10000;       // Show progress every N rows (1000 - frequent / 50000 - less verbose)

// Memory Management
const MAX_RECORDS_IN_MEMORY = 75000;   // Max records before forced flush (25000 - safe / 100000 - faster)

// Database Connection Settings
const QUERY_TIMEOUT = 30000;           // Query timeout in ms (30000 - conservative / 60000 - patient)
const MAX_RETRIES = 2;                 // Retry failed operations (1 - fail fast / 5 - persistent)
const RETRY_DELAY = 2000;              // Delay between retries in ms (1000 - quick / 5000 - patient)

// Error Handling
const CONTINUE_ON_BATCH_FAILURE = false;    // Continue if batch fails (true - resilient / false - strict)
const MAX_FAILED_BATCHES = 3;              // Stop after N failed batches (3 - cautious / 10 - persistent)
const SKIP_MALFORMED_RECORDS = true;       // Skip bad records (true - permissive / false - strict)

// Performance Monitoring
const ENABLE_TIMING_LOGS = true;           // Show timing info (true - verbose / false - quiet)
const STATS_INTERVAL = 2;                // Show stats every N batches (5 - frequent / 20 - less verbose)
const SLOW_BATCH_THRESHOLD = 5000;        // Warn if batch takes more than N ms (3000 - sensitive / 10000 - tolerant)

// Data Validation
const VALIDATE_NUMBERS = true;            // Validate OHLC numbers (true - safe / false - fast)
const SKIP_INVALID_TIMESTAMPS = true;     // Skip records with bad dates (true - permissive / false - strict)
const MAX_PRICE_VALUE = 1000000;          // Maximum allowed price (prevents obvious errors)

module.exports = {
  // Batch settings
  READ_BATCH_SIZE,
  INSERT_BATCH_SIZE,
  PROGRESS_INTERVAL,
  
  // Memory
  MAX_RECORDS_IN_MEMORY,
  
  // Database
  QUERY_TIMEOUT,
  MAX_RETRIES,
  RETRY_DELAY,
  
  // Error handling
  CONTINUE_ON_BATCH_FAILURE,
  MAX_FAILED_BATCHES,
  SKIP_MALFORMED_RECORDS,
  
  // Monitoring
  ENABLE_TIMING_LOGS,
  STATS_INTERVAL,
  SLOW_BATCH_THRESHOLD,
  
  // Validation
  VALIDATE_NUMBERS,
  SKIP_INVALID_TIMESTAMPS,
  MAX_PRICE_VALUE
};