# Cross-Market ETL Pipeline (Multi-Timeframe)

The goal of this project is to establish an automated data gathering pipeline from various markets for backtesting and research purposes. The pipeline now supports **multiple timeframes (M1, M5, H1)** for both TradFi and cryptocurrency data.

This pipeline uses a database and scheduler approach - this is not the cheapest option, but the goal is to collect the most recent data every 7-10 days for all supported timeframes, in case of a scenario where good data with higher lookback period will not be available in the future for some reason. Thanks to the automation, you'll never forget to run the script and will still be able to maintain a reliable market dataset without gaps in the long run.

## Supported Timeframes
- **M1** (1 minute) - High-frequency data for detailed analysis
- **M5** (5 minutes) - Medium-frequency data for swing trading
- **H1** (1 hour) - Lower-frequency data for position trading

## Data Sources
- **TradFi Data**: Uses dukascopy-node.app built by Leonid Pyrlia (Leo4815162342) - https://github.com/Leo4815162342/dukascopy-node. Please star his work if you're using this pipeline - amazing work and great documentation in that project! Thanks to Dukascopy and that person, I was able to create a reliable tradfi data pipeline with good quality OHLCV data for multiple timeframes and relatively long lookback period, completely for free.
- **Crypto Data**: Imported using CCXT for multiple timeframes.

## Database Schema Changes (Multi-Timeframe)

The database schema has been updated to support multiple timeframes:

### New Table Naming Convention
- **TradFi Tables**: `{symbol}_{timeframe}_tradfi_ohlcv` (e.g., `eurusd_m1_tradfi_ohlcv`, `eurusd_m5_tradfi_ohlcv`)
- **Crypto Tables**: `{symbol}_{timeframe}_{exchange}_crypto_ohlcv` (e.g., `btcusdt_m1_binance_crypto_ohlcv`)

### Metadata Table Updates
- Added `timeframe` column to `symbol_metadata` table
- Added `available_timestamps` JSON field for quick timestamp querying
- Updated unique constraints to include timeframe

## Initial Setup

1. **Set up a PostgreSQL database** - either locally or online. Personally I'm using Digital Ocean's standard instance, as I've found it to be the most reasonable option for me.

2. **Create environment file**:
   - Create a `.env` file in your root directory
   - Copy the contents of `.env.example` and replace with your actual DATABASE_URL connection string

3. **SSL Certificate** (if needed):
   - Get your CA certificate file from your DB provider (easily downloadable on Digital Ocean's site)
   - Place it in `certs/` directory and set the proper file name in your `.env`

4. **Configure timeframes** in `config.json`:
   ```json
   {
     "timeframes": ["m1", "m5", "h1"],
     "tradfi": {
       "timeframes": {
         "m1": { "batchSize": 5, "pauseBetweenBatchesMs": 5000 },
         "m5": { "batchSize": 3, "pauseBetweenBatchesMs": 8000 },
         "h1": { "batchSize": 2, "pauseBetweenBatchesMs": 10000 }
       }
     },
     "crypto": {
       "timeframes": {
         "m1": { "ccxtTimeframe": "1m", "batchSize": 2000, "rateLimitDelay": 3 },
         "m5": { "ccxtTimeframe": "5m", "batchSize": 1000, "rateLimitDelay": 5 },
         "h1": { "ccxtTimeframe": "1h", "batchSize": 500, "rateLimitDelay": 8 }
       }
     }
   }
   ```

5. **Install dependencies**:
   ```bash
   npm install
   pip install -r requirements.txt
   ```

6. **Run CSV imports** for all timeframes:
   ```bash
   npm run import:all
   ```
   *Be patient - this will now import data for all configured timeframes. Expect longer processing times:*
   - *M1 data*: ~7-8 minutes per year per TradFi symbol, ~2 minutes per year per crypto symbol
   - *M5 data*: ~2-3 minutes per year per TradFi symbol, ~1 minute per year per crypto symbol
   - *H1 data*: ~30-60 seconds per year per TradFi symbol, ~15-30 seconds per year per crypto symbol

7. **Organize CSV data**:
   After successful imports, you should have OHLCV data organized in:
   - `/data/tradfi/` - with timeframe-specific files
   - `/data/crypto/` - with timeframe-specific files

8. **Import to database**:
   ```bash
   npm run db:import
   ```
   *This will create separate tables for each symbol-timeframe combination and populate metadata for all timeframes.*

## Scheduler Setup (Multi-Timeframe Aware)

The scheduler now automatically handles all configured timeframes:

1. **Setup a Background Worker**:
   - Use Render, Railway, or any other service provider
   - Set language as Node.js

2. **Environment Variables**:
   - Configure `DATABASE_URL`, `DATABASE_CA_CERT_PATH`, and `NODE_ENV` from your `.env`
   - Use the `render.yaml` file as a guideline

3. **Network Configuration**:
   - Remember to whitelist your service provider's IP addresses in your database provider
   - For Render: Dashboard → Connect button → Outbound → copy all IP addresses

4. **Automatic Operation**:
   - The scheduler reads symbol metadata from the database (not config.json)
   - It processes each timeframe separately for both TradFi and crypto
   - Imports data from the last available timestamp for each symbol-timeframe combination
   - Creates metadata for all imported data

## Database Tables Structure

After setup, you'll have tables like:
```
eurusd_m1_tradfi_ohlcv    (1-minute EUR/USD data)
eurusd_m5_tradfi_ohlcv    (5-minute EUR/USD data)
eurusd_h1_tradfi_ohlcv    (1-hour EUR/USD data)

btcusdt_m1_binance_crypto_ohlcv    (1-minute BTC/USDT data)
btcusdt_m5_binance_crypto_ohlcv    (5-minute BTC/USDT data)
btcusdt_h1_binance_crypto_ohlcv    (1-hour BTC/USDT data)

symbol_metadata    (tracks all tables with timeframe information)
```

## Query Examples

**Get all available timeframes for a symbol:**
```sql
SELECT timeframe, total_records, last_available_timestamp
FROM symbol_metadata
WHERE symbol = 'eurusd' AND asset_type = 'tradfi'
ORDER BY timeframe;
```

**Get M5 data for EUR/USD:**
```sql
SELECT * FROM eurusd_m5_tradfi_ohlcv
WHERE timestamp >= '2025-01-01'
ORDER BY timestamp DESC
LIMIT 100;
```

**Check available timestamps for crypto M1 data:**
```sql
SELECT symbol, timeframe, available_timestamps
FROM symbol_metadata
WHERE asset_type = 'crypto' AND timeframe = 'm1';
```


## Migration from Single Timeframe

If you have an existing database with the old schema (without timeframes), you'll need to:

1. **Backup your existing data**
2. **Update your database schema** by running the new SQL files:
   ```bash
   npm run db:migrate  # If you create this script
   ```
3. **Re-import data** with the new timeframe structure
4. **Update your config.json** to include the new timeframe configuration

## Troubleshooting

**Database Connection Issues:**
- Remember to whitelist your IP address in your database provider's website
- If you're using dynamic IP, you might have to update it more often

**SSL Certificate Issues (Digital Ocean):**
- If experiencing self-signed certificate errors with `npm run db:test` or `npm run db:import`
- Remove `?sslmode=require` from your DATABASE_URL ending in `.env`
- Your connection string conflicts with the SSL configuration in `config/database.js`

**Timeframe Issues:**
- Ensure all timeframes in `config.json` are properly configured
- Check that CSV files are named with the correct timeframe pattern
- Verify that database tables are created with the new naming convention

**Performance Issues:**
- Adjust batch sizes in the timeframe configuration if imports are too slow
- Consider processing timeframes sequentially instead of in parallel for limited resources
- Monitor database connection limits when processing multiple timeframes

## Contributing

When adding new timeframes:
1. Update `config.json` with the new timeframe configuration
2. Ensure ETL scripts support the new timeframe
3. Update database schema if needed
4. Test with a small dataset first

---
*Last updated: September 2025 - Multi-timeframe support added*