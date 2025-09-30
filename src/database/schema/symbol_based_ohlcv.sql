-- Symbol-Based OHLCV Database Schema
-- Dynamic table creation per symbol for optimal performance and organization

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Function to create TradFi OHLCV table for a specific symbol and timeframe
CREATE OR REPLACE FUNCTION create_tradfi_ohlcv_table(symbol_name TEXT, timeframe TEXT DEFAULT 'm1')
RETURNS VOID AS $$
DECLARE
    table_name TEXT;
BEGIN
    table_name := lower(symbol_name) || '_' || lower(timeframe) || '_tradfi_ohlcv';

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            timestamp TIMESTAMPTZ NOT NULL,
            open DECIMAL(12, 4) NOT NULL,
            high DECIMAL(12, 4) NOT NULL,
            low DECIMAL(12, 4) NOT NULL,
            close DECIMAL(12, 4) NOT NULL,
            volume DECIMAL(20, 2) DEFAULT NULL,
            day_of_week TEXT NOT NULL,
            timeframe TEXT NOT NULL DEFAULT %L,

            -- Primary key on timestamp for this symbol/timeframe
            CONSTRAINT %I PRIMARY KEY (timestamp)
        )', table_name, timeframe, table_name || '_pkey');

    -- Create performance indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (timestamp DESC)',
                   'idx_' || table_name || '_timestamp', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (day_of_week, timestamp DESC)',
                   'idx_' || table_name || '_dow_timestamp', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (timeframe, timestamp DESC)',
                   'idx_' || table_name || '_timeframe_timestamp', table_name);

    RAISE NOTICE 'Created TradFi table: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to create Crypto OHLCV table for a specific symbol and timeframe
CREATE OR REPLACE FUNCTION create_crypto_ohlcv_table(symbol_name TEXT, exchange_name TEXT, timeframe TEXT DEFAULT 'm1')
RETURNS VOID AS $$
DECLARE
    table_name TEXT;
    clean_symbol TEXT;
BEGIN
    -- Clean symbol name (replace / with _)
    clean_symbol := replace(lower(symbol_name), '/', '');
    table_name := clean_symbol || '_' || lower(timeframe) || '_' || lower(exchange_name) || '_crypto_ohlcv';

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            timestamp TIMESTAMPTZ NOT NULL,
            open DECIMAL(12, 8) NOT NULL,
            high DECIMAL(12, 8) NOT NULL,
            low DECIMAL(12, 8) NOT NULL,
            close DECIMAL(12, 8) NOT NULL,
            volume DECIMAL(20, 8) DEFAULT NULL,
            day_of_week TEXT NOT NULL,
            timeframe TEXT NOT NULL DEFAULT %L,

            -- Primary key on timestamp for this symbol/exchange/timeframe
            CONSTRAINT %I PRIMARY KEY (timestamp)
        )', table_name, timeframe, table_name || '_pkey');

    -- Create performance indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (timestamp DESC)',
                   'idx_' || table_name || '_timestamp', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (day_of_week, timestamp DESC)',
                   'idx_' || table_name || '_dow_timestamp', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (timeframe, timestamp DESC)',
                   'idx_' || table_name || '_timeframe_timestamp', table_name);

    RAISE NOTICE 'Created Crypto table: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get day of week from timestamp
CREATE OR REPLACE FUNCTION get_day_of_week(ts TIMESTAMPTZ)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE EXTRACT(DOW FROM ts)
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
    END;
END;
$$ LANGUAGE plpgsql;

-- Function to get table name for symbol with timeframe
CREATE OR REPLACE FUNCTION get_table_name(symbol_name TEXT, asset_type TEXT, timeframe TEXT DEFAULT 'm1', exchange_name TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    clean_symbol TEXT;
    table_name TEXT;
BEGIN
    IF asset_type = 'tradfi' THEN
        table_name := lower(symbol_name) || '_' || lower(timeframe) || '_tradfi_ohlcv';
    ELSIF asset_type = 'crypto' THEN
        clean_symbol := replace(lower(symbol_name), '/', '');
        table_name := clean_symbol || '_' || lower(timeframe) || '_' || lower(exchange_name) || '_crypto_ohlcv';
    ELSE
        RAISE EXCEPTION 'Invalid asset_type: %', asset_type;
    END IF;

    RETURN table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to check if table exists
CREATE OR REPLACE FUNCTION table_exists(target_table_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = lower(target_table_name)
        AND table_schema = 'public'
    );
END;
$$ LANGUAGE plpgsql;