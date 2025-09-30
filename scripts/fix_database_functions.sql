-- Fix Database Functions for Multi-Timeframe Schema
-- Run this script to drop and recreate functions that have changed signatures

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