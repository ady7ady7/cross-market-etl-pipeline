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
