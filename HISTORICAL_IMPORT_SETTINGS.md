# Multi-Timeframe Historical Import Guide

This guide covers importing large-scale historical data across multiple timeframes (M1, M5, H1) efficiently and safely.

## Quick Commands for Historical Imports

### Import Specific Timeframes
```bash
# Import only M5 and H1 (skip existing M1 data)
npm run import:m5h1

# Import individual timeframes
npm run import:m5    # 5-minute data only
npm run import:h1    # 1-hour data only
npm run import:all   # All timeframes (M1, M5, H1)
```

### Import Specific Asset Types
```bash
# TradFi only (all timeframes)
npm run import:tradfi

# Crypto only (all timeframes)
npm run import:crypto

# Combine with timeframe selection
TIMEFRAMES=m5,h1 npm run import:tradfi
```

## Configuration for Historical Imports

### Primary Configuration File: `config.json`

For large historical imports, adjust these settings:

```json
{
  "timeframes": ["m1", "m5", "h1"],
  "dateRanges": {
    "default": {
      "from": "2023-01-01",     // Historical start date
      "to": "2025-09-17"        // Historical end date
    }
  },
  "tradfi": {
    "timeframes": {
      "m1": { "batchSize": 3, "pauseBetweenBatchesMs": 8000 },  // Conservative for M1
      "m5": { "batchSize": 5, "pauseBetweenBatchesMs": 6000 },  // Faster for M5
      "h1": { "batchSize": 8, "pauseBetweenBatchesMs": 4000 }   // Fastest for H1
    }
  },
  "crypto": {
    "timeframes": {
      "m1": { "ccxtTimeframe": "1m", "batchSize": 1000, "rateLimitDelay": 5 },
      "m5": { "ccxtTimeframe": "5m", "batchSize": 1500, "rateLimitDelay": 3 },
      "h1": { "ccxtTimeframe": "1h", "batchSize": 2000, "rateLimitDelay": 2 }
    },
    "defaultExchange": "binance",
    "maxRetries": 5
  },
  "database": {
    "insertBatchSize": 3000,      // Smaller batches for stability
    "progressInterval": 25000,    // More frequent progress updates
    "enableStreaming": true
  }
}
```

## Import Process Workflow

### 1. Standard Historical Import
```bash
# Step 1: Import CSV data for all timeframes
npm run import:all

# Step 2: Import CSV files to database
npm run db:import

# Step 3: Verify import success
npm run db:stats
```

### 2. Selective Timeframe Import
```bash
# If you already have M1 data, import only higher timeframes
npm run import:m5h1     # Import M5 and H1 only
npm run db:import       # Import to database
```

## Performance Optimization

### Expected Import Times (per symbol, per year of data)

| Timeframe | TradFi Import Time | Crypto Import Time |
|-----------|-------------------|-------------------|
| **M1**    | 7-8 minutes       | 2 minutes         |
| **M5**    | 2-3 minutes       | 1 minute          |
| **H1**    | 30-60 seconds     | 15-30 seconds     |

### Conservative Settings for Large Imports

For imports spanning multiple years, use these conservative settings in `config.json`:

```json
{
  "tradfi": {
    "timeframes": {
      "m1": { "batchSize": 2, "pauseBetweenBatchesMs": 10000 },
      "m5": { "batchSize": 3, "pauseBetweenBatchesMs": 8000 },
      "h1": { "batchSize": 5, "pauseBetweenBatchesMs": 6000 }
    }
  },
  "database": {
    "insertBatchSize": 2000,
    "progressInterval": 10000
  }
}
```

## Monthly Chunking Strategy

For very large historical imports, process data in monthly chunks:

### Month-by-Month Approach

1. **January 2023**:
   ```json
   "dateRanges": {
     "default": {
       "from": "2023-01-01",
       "to": "2023-02-01"
     }
   }
   ```

2. **Run Import Cycle**:
   ```bash
   npm run import:m5h1  # Skip M1 if you have it
   npm run db:import
   ```

3. **February 2023**:
   ```json
   "dateRanges": {
     "default": {
       "from": "2023-02-01",
       "to": "2023-03-01"
     }
   }
   ```

4. **Repeat Process**

### Automated Monthly Processing Script

Create `scripts/import_monthly.js`:
```javascript
const months = [
  { from: "2023-01-01", to: "2023-02-01" },
  { from: "2023-02-01", to: "2023-03-01" },
  { from: "2023-03-01", to: "2023-04-01" },
  // ... more months
];

// Process each month sequentially
for (const month of months) {
  console.log(`Processing ${month.from} to ${month.to}`);
  // Update config.json
  // Run import commands
  // Verify success before continuing
}
```

## Database Table Structure After Import

After historical import, you'll have tables like:
```
eurusd_m1_tradfi_ohlcv       (1-minute data)
eurusd_m5_tradfi_ohlcv       (5-minute data)
eurusd_h1_tradfi_ohlcv       (1-hour data)

btcusdt_m1_binance_crypto_ohlcv    (1-minute crypto)
btcusdt_m5_binance_crypto_ohlcv    (5-minute crypto)
btcusdt_h1_binance_crypto_ohlcv    (1-hour crypto)
```

## Verification and Monitoring

### Check Import Success
```sql
-- View all imported timeframes
SELECT symbol, timeframe, total_records,
       first_available_timestamp, last_available_timestamp
FROM symbol_metadata
ORDER BY symbol, timeframe;

-- Check for gaps in data
SELECT symbol, timeframe, available_timestamps
FROM symbol_metadata
WHERE timeframe IN ('m5', 'h1');
```

### Monitor Progress
```bash
# Check database statistics
npm run db:stats

# Generate fresh metadata
npm run metadata:generate
```

## Troubleshooting Large Imports

### Common Issues and Solutions

1. **Memory Issues**: Reduce `insertBatchSize` to 1000-2000
2. **Timeout Errors**: Increase `pauseBetweenBatchesMs`
3. **Rate Limiting**: Increase `rateLimitDelay` for crypto
4. **Database Locks**: Process timeframes sequentially instead of parallel

### Recovery from Failed Imports

```bash
# Check what was successfully imported
npm run db:stats

# Continue from where import failed
# Adjust date ranges in config.json to skip completed periods
# Re-run import commands
```

## Best Practices

1. **Start with small date ranges** to test configuration
2. **Import higher timeframes first** (H1, then M5, then M1) - they're faster
3. **Monitor system resources** during large imports
4. **Use conservative batch sizes** for multi-year imports
5. **Verify each timeframe** before moving to the next
6. **Keep backups** of your database before large imports

## Asset Selection for Historical Imports

Modify `config.json` assets section to control which symbols to import:

```json
{
  "assets": {
    "tradfi": [
      {"symbol": "eurusd", "name": "EURUSD"},
      {"symbol": "gbpusd", "name": "GBPUSD"}
      // Add more symbols as needed
    ],
    "crypto": [
      {"symbol": "BTC/USDT", "name": "Bitcoin", "exchange": "binance"},
      {"symbol": "ETH/USDT", "name": "Ethereum", "exchange": "binance"}
      // Add more symbols as needed
    ]
  }
}
```

This approach ensures reliable, monitored imports of historical data across all your required timeframes.