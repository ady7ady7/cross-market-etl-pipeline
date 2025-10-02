-- ⚠️ OUTDATED - FOR REFERENCE ONLY ⚠️
--
-- This SQL script is OUTDATED and should NOT be run anymore.
-- It's kept for historical reference and documentation purposes only.
--
-- ═══════════════════════════════════════════════════════════════════
-- SCRIPT PURPOSE (Historical):
-- ═══════════════════════════════════════════════════════════════════
--
-- This script was created to fix database function signature conflicts
-- during the migration to support multiple timeframes.
--
-- PROBLEM IT SOLVED:
-- When adding timeframe support to the ETL pipeline, several database
-- functions needed to be modified to accept an additional 'timeframe'
-- parameter. PostgreSQL doesn't allow changing function signatures
-- in-place, and having both old and new signatures caused ambiguous
-- function call errors.
--
-- WHAT IT DID:
-- Dropped the following functions with old signatures:
--   1. get_symbols_needing_update() - needed to return timeframe column
--   2. refresh_symbol_metadata(TEXT) - metadata refresh function
--   3. get_table_name(TEXT, TEXT, TEXT) - table name generator
--   4. create_tradfi_ohlcv_table(TEXT) - now needs timeframe param
--   5. create_crypto_ohlcv_table(TEXT, TEXT) - now needs timeframe param
--   6. table_exists(TEXT) - had naming conflict with schema qualification
--
-- FUNCTIONS AFFECTED:
-- OLD: create_tradfi_ohlcv_table(symbol TEXT)
-- NEW: create_tradfi_ohlcv_table(symbol TEXT, timeframe TEXT)
--
-- OLD: create_crypto_ohlcv_table(symbol TEXT, exchange TEXT)
-- NEW: create_crypto_ohlcv_table(symbol TEXT, exchange TEXT, timeframe TEXT)
--
-- WHY IT'S OUTDATED:
-- - The fix has already been applied to all databases
-- - Current schema files contain only the new function signatures
-- - Running this script could cause issues by dropping active functions
-- - New installations will have correct functions from the start
-- - The migration from single to multi-timeframe is complete
--
-- EXECUTION CONTEXT:
-- This script was meant to be run ONCE during the timeframe migration,
-- after which the import process would recreate the functions with
-- correct signatures from symbol_based_ohlcv.sql
--
-- RELATED FILES:
-- - scripts/run_fix_database_functions_outdated_read.js (executed this SQL)
-- - src/database/schema/symbol_based_ohlcv.sql (current correct schema)
-- - src/database/schema/metadata_tables.sql (metadata functions)
--
-- DATE CREATED: During timeframe migration (August 2025)
-- DATE DEPRECATED: October 2025
--
-- ═══════════════════════════════════════════════════════════════════

-- Drop functions that have changed return types
DROP FUNCTION IF EXISTS get_symbols_needing_update();
DROP FUNCTION IF EXISTS refresh_symbol_metadata(TEXT);
DROP FUNCTION IF EXISTS get_table_name(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_tradfi_ohlcv_table(TEXT);
DROP FUNCTION IF EXISTS create_crypto_ohlcv_table(TEXT, TEXT);
DROP FUNCTION IF EXISTS table_exists(TEXT);

-- Note: The new functions will be recreated when you run the import again
-- This script just cleans up the old function signatures

SELECT 'Database functions cleaned up successfully!' as status;
