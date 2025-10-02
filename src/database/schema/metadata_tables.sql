-- Database Metadata Management Schema
-- Stores metadata for each symbol table in the database

-- Metadata table for tracking all symbol tables with timeframes
CREATE TABLE IF NOT EXISTS symbol_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(50) NOT NULL,
    timeframe VARCHAR(10) NOT NULL DEFAULT 'm1',
    table_name VARCHAR(120) NOT NULL UNIQUE,
    asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('tradfi', 'crypto')),
    exchange VARCHAR(50) NULL,

    -- Data statistics
    total_records BIGINT NOT NULL DEFAULT 0,
    first_available_timestamp TIMESTAMPTZ NULL,
    last_available_timestamp TIMESTAMPTZ NULL,
    coverage_days INTEGER NOT NULL DEFAULT 0,

    -- Data format info
    volume_available BOOLEAN NOT NULL DEFAULT false,
    data_format VARCHAR(10) NOT NULL DEFAULT 'OHLC',

    -- Day of week distribution (stored as JSONB for flexibility)
    day_of_week_distribution JSONB NOT NULL DEFAULT '{}',

    -- Available timestamps (JSONB array for quick querying)
    available_timestamps JSONB NOT NULL DEFAULT '[]',

    -- Update tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_metadata_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    can_update_from TIMESTAMPTZ NULL,

    -- Data update tracking
    last_data_update TIMESTAMPTZ NULL,

    CONSTRAINT unique_symbol_timeframe_exchange UNIQUE(symbol, timeframe, exchange, asset_type)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_symbol_metadata_symbol ON symbol_metadata(symbol);
CREATE INDEX IF NOT EXISTS idx_symbol_metadata_asset_type ON symbol_metadata(asset_type);
CREATE INDEX IF NOT EXISTS idx_symbol_metadata_timeframe ON symbol_metadata(timeframe);
CREATE INDEX IF NOT EXISTS idx_symbol_metadata_table_name ON symbol_metadata(table_name);
CREATE INDEX IF NOT EXISTS idx_symbol_metadata_symbol_timeframe ON symbol_metadata(symbol, timeframe);

-- Function to get symbols that need updating (simplified)
CREATE OR REPLACE FUNCTION get_symbols_needing_update()
RETURNS TABLE(
    symbol VARCHAR(50),
    timeframe VARCHAR(10),
    table_name VARCHAR(120),
    asset_type VARCHAR(20),
    exchange VARCHAR(50),
    last_available_timestamp TIMESTAMPTZ,
    can_update_from TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sm.symbol,
        sm.timeframe,
        sm.table_name,
        sm.asset_type,
        sm.exchange,
        sm.last_available_timestamp,
        sm.can_update_from
    FROM symbol_metadata sm
    ORDER BY sm.table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to update metadata after data import (simplified)
CREATE OR REPLACE FUNCTION refresh_symbol_metadata(target_table_name TEXT)
RETURNS VOID AS $$
DECLARE
    record_count BIGINT;
    first_ts TIMESTAMPTZ;
    last_ts TIMESTAMPTZ;
    has_volume BOOLEAN;
    dow_distribution JSONB;
    timestamps_array JSONB;
BEGIN
    -- Get statistics from the target table
    EXECUTE format('
        SELECT
            COUNT(*) as record_count,
            MIN(timestamp) as first_timestamp,
            MAX(timestamp) as last_timestamp,
            COUNT(CASE WHEN volume IS NOT NULL AND volume > 0 THEN 1 END) > 0 as has_volume,
            json_build_object(
                ''monday'', COUNT(CASE WHEN day_of_week = ''Monday'' THEN 1 END),
                ''tuesday'', COUNT(CASE WHEN day_of_week = ''Tuesday'' THEN 1 END),
                ''wednesday'', COUNT(CASE WHEN day_of_week = ''Wednesday'' THEN 1 END),
                ''thursday'', COUNT(CASE WHEN day_of_week = ''Thursday'' THEN 1 END),
                ''friday'', COUNT(CASE WHEN day_of_week = ''Friday'' THEN 1 END),
                ''saturday'', COUNT(CASE WHEN day_of_week = ''Saturday'' THEN 1 END),
                ''sunday'', COUNT(CASE WHEN day_of_week = ''Sunday'' THEN 1 END)
            ) as dow_dist,
            json_agg(DISTINCT date_trunc(''day'', timestamp) ORDER BY date_trunc(''day'', timestamp)) as timestamps
        FROM %I
    ', target_table_name)
    INTO record_count, first_ts, last_ts, has_volume, dow_distribution, timestamps_array;

    -- Update metadata table
    UPDATE symbol_metadata
    SET
        total_records = record_count,
        first_available_timestamp = first_ts,
        last_available_timestamp = last_ts,
        coverage_days = CASE
            WHEN first_ts IS NOT NULL AND last_ts IS NOT NULL
            THEN EXTRACT(DAY FROM last_ts - first_ts)::INTEGER
            ELSE 0
        END,
        volume_available = has_volume,
        data_format = CASE WHEN has_volume THEN 'OHLCV' ELSE 'OHLC' END,
        day_of_week_distribution = dow_distribution,
        available_timestamps = COALESCE(timestamps_array, '[]'::jsonb),
        last_metadata_update = NOW(),
        can_update_from = last_ts,
        last_data_update = NOW()
    WHERE table_name = target_table_name;

    -- If no row was updated, insert a new record
    IF NOT FOUND THEN
        RAISE NOTICE 'Metadata record not found for table %, please create it first', target_table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;