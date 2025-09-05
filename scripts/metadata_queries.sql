-- Database Metadata Queries
-- scripts/metadata_queries.sql

-- 1. Check symbol metadata status (what scheduler will use)
SELECT 
  symbol,
  asset_type,
  exchange,
  total_records,
  last_available_timestamp,
  can_update_from,
  EXTRACT(DAY FROM (NOW() - last_available_timestamp)) as days_behind
FROM symbol_metadata 
WHERE last_available_timestamp IS NOT NULL
ORDER BY last_available_timestamp ASC;

-- 2. Find the oldest symbol (scheduler uses this for date calculation)
SELECT 
  symbol,
  asset_type,
  last_available_timestamp,
  'This symbol determines the fetch start date' as note
FROM symbol_metadata 
WHERE last_available_timestamp IS NOT NULL
ORDER BY last_available_timestamp ASC
LIMIT 1;

-- 3. Check data freshness across all symbols
SELECT 
  asset_type,
  COUNT(*) as symbol_count,
  MIN(last_available_timestamp) as oldest_data,
  MAX(last_available_timestamp) as newest_data,
  AVG(EXTRACT(DAY FROM (NOW() - last_available_timestamp))) as avg_days_behind
FROM symbol_metadata 
WHERE last_available_timestamp IS NOT NULL
GROUP BY asset_type;

-- 4. Symbols that need updating (more than 2 days behind)
SELECT 
  symbol,
  asset_type,
  last_available_timestamp,
  EXTRACT(DAY FROM (NOW() - last_available_timestamp)) as days_behind
FROM symbol_metadata 
WHERE last_available_timestamp IS NOT NULL
  AND last_available_timestamp < NOW() - INTERVAL '2 days'
ORDER BY last_available_timestamp ASC;