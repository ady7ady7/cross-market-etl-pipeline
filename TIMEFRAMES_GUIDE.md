# Multi-Timeframe Import Guide

## Quick Commands for Importing Specific Timeframes

After your migration is complete, use these commands to import only the timeframes you need:

### Import Only M5 Data
```bash
npm run import:m5
```

### Import Only H1 Data
```bash
npm run import:h1
```

### Import Both M5 and H1 (Skip M1)
```bash
npm run import:m5h1
```

### Import All Timeframes (M1, M5, H1)
```bash
npm run import:all
```

## Alternative: Temporary Config Change

You can also temporarily modify `config.json` line 121:

**To import only M5 and H1:**
```json
"timeframes": ["m5", "h1"],
```

**To import only H1:**
```json
"timeframes": ["h1"],
```

Remember to change it back to `["m1", "m5", "h1"]` when you want full functionality.

## Database Tables After Import

After importing different timeframes, you'll have tables like:

```
eurusd_m1_tradfi_ohlcv    (existing M1 data)
eurusd_m5_tradfi_ohlcv    (new M5 data)
eurusd_h1_tradfi_ohlcv    (new H1 data)

btcusdt_m1_binance_crypto_ohlcv    (existing M1 data)
btcusdt_m5_binance_crypto_ohlcv    (new M5 data)
btcusdt_h1_binance_crypto_ohlcv    (new H1 data)
```

## Performance Tips

- **M1 imports** take the longest (7-8 min/year per TradFi symbol)
- **M5 imports** are faster (2-3 min/year per TradFi symbol)
- **H1 imports** are fastest (30-60 sec/year per TradFi symbol)

Since you already have M1 data, importing just M5 and H1 will be much faster!

## Verification

Check your new tables:
```sql
SELECT symbol, timeframe, total_records
FROM symbol_metadata
ORDER BY symbol, timeframe;
```

## Migration Status

✅ Migration completed - old single-timeframe schema migrated to multi-timeframe
📁 Migration script preserved at: `scripts/migrate_to_timeframes_outdated_read.js`