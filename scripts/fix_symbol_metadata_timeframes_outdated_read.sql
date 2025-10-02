-- ⚠️ OUTDATED - FOR REFERENCE ONLY ⚠️
--
-- This SQL script is OUTDATED and should NOT be run anymore.
-- It's kept for historical reference and documentation purposes only.
--
-- ═══════════════════════════════════════════════════════════════════
-- SCRIPT PURPOSE (Historical):
-- ═══════════════════════════════════════════════════════════════════
--
-- This script was created to fix incorrect timeframe values in the
-- symbol_metadata table after the initial multi-timeframe migration.
--
-- PROBLEM IT SOLVED:
-- After implementing multi-timeframe support, the database had:
--   ✅ Tables with correct names: symbol_m1_*, symbol_m5_*, symbol_h1_*
--   ❌ symbol_metadata.timeframe column showing 'm1' for ALL tables
--
-- The root cause was that upsertSymbolMetadata() in db_metadata_manager.js
-- was not accepting or storing the timeframe parameter, so it always
-- defaulted to 'm1' for every table regardless of actual timeframe.
--
-- WHAT IT DID:
-- Used PostgreSQL regex pattern matching to extract the actual timeframe
-- from the table_name and update the timeframe column accordingly.
--
-- REGEX PATTERNS USED:
--
-- 1. TradFi tables (format: symbol_TIMEFRAME_tradfi_ohlcv):
--    Pattern: '_([^_]+)_tradfi_ohlcv$'
--    Example: 'eurusd_h1_tradfi_ohlcv' → extracts 'h1'
--
-- 2. Crypto tables (format: symbol_TIMEFRAME_exchange_crypto_ohlcv):
--    Pattern: '_([^_]+)_[^_]+_crypto_ohlcv$'
--    Example: 'ethusdt_m5_binance_crypto_ohlcv' → extracts 'm5'
--
-- EXECUTION RESULTS:
-- When this script was run on October 2, 2025:
--   - Updated 33 TradFi records (m1, m5, h1 timeframes)
--   - Updated 1 Crypto record (m1 timeframe)
--   - Total: 34 records corrected
--
-- WHY IT'S OUTDATED:
-- - The fix has already been applied to all existing records
-- - The upsertSymbolMetadata() function now properly accepts and stores
--   the timeframe parameter (fixed in db_metadata_manager.js)
-- - New tables created will automatically have correct timeframe values
-- - Running this script again is redundant and unnecessary
-- - All metadata operations now handle timeframes correctly
--
-- PERMANENT FIX IMPLEMENTED:
-- The real fix was updating the JavaScript code:
--   - db_metadata_manager.js: Added timeframe parameter to function
--   - symbol_manager.js: Already passing timeframe when calling function
-- This SQL was just a one-time data correction.
--
-- RELATED FILES:
-- - scripts/run_fix_timeframes_outdated_read.js (executed this SQL)
-- - src/database/db_metadata_manager.js (fixed upsertSymbolMetadata)
-- - src/database/symbol_manager.js (calls with timeframe parameter)
--
-- DATE CREATED: October 2, 2025
-- DATE DEPRECATED: October 2, 2025 (same day - one-time data fix)
--
-- ═══════════════════════════════════════════════════════════════════

-- Fix timeframes in symbol_metadata table
-- Extracts timeframe from table_name and updates the timeframe column

-- Update tradfi tables (format: symbol_timeframe_tradfi_ohlcv)
UPDATE symbol_metadata
SET timeframe = (
    SELECT substring(table_name FROM '_([^_]+)_tradfi_ohlcv$')
)
WHERE asset_type = 'tradfi'
  AND table_name ~ '_[^_]+_tradfi_ohlcv$';

-- Update crypto tables (format: symbol_timeframe_exchange_crypto_ohlcv)
UPDATE symbol_metadata
SET timeframe = (
    SELECT substring(table_name FROM '_([^_]+)_[^_]+_crypto_ohlcv$')
)
WHERE asset_type = 'crypto'
  AND table_name ~ '_[^_]+_[^_]+_crypto_ohlcv$';

-- Verify the updates
SELECT
    symbol,
    timeframe,
    table_name,
    asset_type,
    exchange
FROM symbol_metadata
ORDER BY asset_type, symbol, timeframe;
