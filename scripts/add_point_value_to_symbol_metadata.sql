-- ═══════════════════════════════════════════════════════════════════
-- SCRIPT PURPOSE:
-- ═══════════════════════════════════════════════════════════════════
--
-- Add point_value column to symbol_metadata table to fix position sizing
-- and P&L calculation issues.
--
-- PROBLEM BEING SOLVED:
-- Previous P&L calculation: (price_change) * position_size caused massive
-- position sizes and trillion-dollar P&Ls because instruments have different
-- contract specifications and price scales.
--
-- SOLUTION:
-- Normalize all instruments to use micro contracts where 1 point ≈ $1 P&L
--
-- NEW FORMULAS:
-- - Position sizing: position_size = risk_amount / (risk_in_points * point_value)
-- - P&L calculation: pnl = price_change_in_points * point_value * position_size
--
-- POINT VALUES (Using Micro Contracts):
--
-- 1. CRYPTO (BTC, ETH): point_value = 1.0
--    - 1 unit = 1 coin
--    - 1 point move = $1 P&L per 1 coin
--
-- 2. INDICES (DAX, S&P, Nasdaq, Dow Jones): point_value = 1.0
--    - 1 unit = 1 micro contract
--    - 1 point move ≈ $1 P&L per micro contract
--
-- 3. FOREX (EURUSD, GBPUSD, etc.): point_value = 0.1
--    - 1 unit = 1 micro lot (1,000 currency units)
--    - 1 pip move = $0.10 P&L per micro lot
--
-- 4. COMMODITIES (Gold, Silver, Oil): TBD based on actual contract specs
--    - Will need specific values per commodity
--
-- DATE CREATED: October 2, 2025
--
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Add point_value column if it doesn't exist
ALTER TABLE symbol_metadata
ADD COLUMN IF NOT EXISTS point_value DECIMAL(10, 4) DEFAULT 1.0;

-- Step 2: Update Crypto symbols (BTC, ETH) - point_value = 1.0
UPDATE symbol_metadata
SET point_value = 1.0
WHERE asset_type = 'crypto'
  AND symbol IN ('btcusdt', 'ethusdt', 'BTC/USDT', 'ETH/USDT');

-- Step 3: Update Index symbols (DAX, S&P, Nasdaq, Dow) - point_value = 1.0
UPDATE symbol_metadata
SET point_value = 1.0
WHERE asset_type = 'tradfi'
  AND symbol IN (
    'deuidxeur',      -- DAX Index
    'usa500idxusd',   -- S&P 500
    'usatechidxusd',  -- Nasdaq
    'usa30idxusd'     -- Dow Jones
  );

-- Step 4: Update Forex symbols - point_value = 0.1
UPDATE symbol_metadata
SET point_value = 0.1
WHERE asset_type = 'tradfi'
  AND symbol IN (
    'eurusd',
    'eurjpy',
    'usdcad',
    'nzdcad',
    'gbpusd'
  );

-- Step 5: Update Commodities (Gold, Silver, Oil) - using default 1.0 for now
-- These may need adjustment based on actual contract specifications
UPDATE symbol_metadata
SET point_value = 1.0
WHERE asset_type = 'tradfi'
  AND symbol IN (
    'xauusd',         -- Spot Gold
    'xagusd',         -- Spot Silver
    'lightcmdusd'     -- Light Crude Oil
  );

-- Step 6: Verify the updates
SELECT
    symbol,
    asset_type,
    exchange,
    timeframe,
    point_value,
    table_name
FROM symbol_metadata
ORDER BY asset_type, symbol, timeframe;

-- Step 7: Show summary by asset type and point_value
SELECT
    asset_type,
    point_value,
    COUNT(*) as symbol_count,
    array_agg(DISTINCT symbol ORDER BY symbol) as symbols
FROM symbol_metadata
GROUP BY asset_type, point_value
ORDER BY asset_type, point_value;
