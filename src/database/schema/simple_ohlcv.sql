-- Simple OHLCV Database Schema
-- Focus on core data storage with deduplication

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Simple TradFi OHLCV table
CREATE TABLE IF NOT EXISTS tradfi_ohlcv (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    open DECIMAL(12, 4) NOT NULL,
    high DECIMAL(12, 4) NOT NULL,
    low DECIMAL(12, 4) NOT NULL,
    close DECIMAL(12, 4) NOT NULL,
    volume DECIMAL(20, 2) DEFAULT NULL, -- NULL when volume not available
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate data
    CONSTRAINT unique_tradfi_ohlcv UNIQUE (symbol, timestamp)
);

-- Simple Crypto OHLCV table
CREATE TABLE IF NOT EXISTS crypto_ohlcv (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    exchange VARCHAR(20) NOT NULL DEFAULT 'binance',
    timestamp TIMESTAMPTZ NOT NULL,
    open DECIMAL(12, 8) NOT NULL,     -- Higher precision for crypto
    high DECIMAL(12, 8) NOT NULL,
    low DECIMAL(12, 8) NOT NULL,
    close DECIMAL(12, 8) NOT NULL,
    volume DECIMAL(20, 8) DEFAULT NULL, -- NULL when volume not available
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate data
    CONSTRAINT unique_crypto_ohlcv UNIQUE (symbol, exchange, timestamp)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tradfi_symbol_time ON tradfi_ohlcv (symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_symbol_time ON crypto_ohlcv (symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tradfi_timestamp ON tradfi_ohlcv (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_timestamp ON crypto_ohlcv (timestamp DESC);