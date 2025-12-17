# Weekly Scheduler for Render Background Worker

This scheduler automates the weekly ETL pipeline to keep your database updated with fresh financial market data.

## 🎯 What It Does

The scheduler runs every **Sunday at 2:00 AM UTC** and performs these steps automatically:

1. **Reads symbol metadata** from your PostgreSQL database
2. **Calculates date range**: Last 2 weeks until previous Friday 18:00 UTC
3. **Updates config.json** with the new date range
4. **Runs data import** (`import:all`) to fetch data from APIs
5. **Imports to database** (`db:import`) to load data into PostgreSQL

## 🚀 Quick Start

### For Render Background Worker

1. **Deploy to Render**:
   - Create a new **Background Worker** service
   - Connect your GitHub repository
   - Set build command: `npm install`
   - Set start command: `npm run scheduler:start`

2. **Environment Variables** (set in Render dashboard or any other place relevant to the service you use):
   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   CA_CERT_PATH=/path/to/ca-certificate.crt (optional)
   NODE_ENV=development
   ```

3. **Deploy and Monitor**:
   - The scheduler will start automatically
   - Check Render logs to see scheduled execution
   - First run happens on Sunday 2:00 AM UTC

### For Local Testing

Test the scheduler immediately without waiting for Sunday:

```bash
# Test run (executes immediately)
npm run scheduler:test

# Start the scheduler (waits for Sunday 2:00 AM UTC)
npm run scheduler:start
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `npm run scheduler:start` | Start the weekly cron scheduler (production) |
| `npm run scheduler:test` | Run the scheduled job immediately (testing) |

## ⏰ Schedule Details

- **Frequency**: Every Sunday at 2:00 AM UTC
- **Cron Expression**: `0 2 * * 0`
- **Timezone**: UTC

You can modify the schedule in [scheduler.js](scheduler.js:252) by changing the cron expression:

```javascript
// Current: Every Sunday at 2:00 AM UTC
const schedule = '0 2 * * 0';

// Examples of other schedules:
// Every day at 3:00 AM:     '0 3 * * *'
// Every Monday at 1:00 AM:  '0 1 * * 1'
// Twice a week (Sun, Wed):  '0 2 * * 0,3'
```

## 📅 Date Range Calculation

The scheduler automatically calculates a 2-week window:

- **End Date**: Last Friday at 18:00 UTC
- **Start Date**: 14 days before the end date

Example (if today is Monday, Dec 16, 2025):
- Last Friday: December 13, 2025
- Date range: November 29, 2025 to December 13, 2025

This ensures you always have fresh data while avoiding incomplete weeks.

## 🔍 How It Works

### 1. Read Symbol Metadata

The scheduler queries your database to see what symbols are already tracked:

```sql
SELECT symbol, asset_type, exchange, timeframe, last_available_timestamp
FROM symbol_metadata
ORDER BY asset_type, symbol, timeframe
```

This gives visibility into existing data coverage.

### 2. Update Config

Updates [config.json](config.json) `dateRanges.default` section:

```json
{
  "dateRanges": {
    "default": {
      "from": "2025-11-29",
      "to": "2025-12-13"
    }
  }
}
```

### 3. Run Import Pipeline

Executes the same flow as running manually:

```bash
npm run import:all  # Fetch data from Dukascopy + CCXT
npm run db:import   # Load data into PostgreSQL
```

All existing configurations (timeframes, symbols, rate limits) are respected.

## 📊 What Gets Imported

The scheduler uses your existing [config.json](config.json) configuration:

- **Symbols**: Only active symbols (`assets.tradfi` and `assets.crypto`)
- **Timeframes**: All configured timeframes (`m1`, `m5`, `h1`)
- **Date Range**: Calculated 2-week window (auto-updated)

To add/remove symbols, edit [config.json](config.json):

```json
{
  "assets": {
    "tradfi": [
      { "symbol": "eurusd", "name": "EURUSD" }
    ],
    "crypto": [
      { "symbol": "BTC/USDT", "name": "Bitcoin", "exchange": "binance" }
    ]
  }
}
```

## 🧪 Testing Before Deployment

### Test Locally

1. **Set up environment variables** in `.env`:
   ```
   DATABASE_URL=your_postgresql_url
   NODE_ENV=development
   ```

2. **Run test mode**:
   ```bash
   npm run scheduler:test
   ```

3. **Expected output**:
   ```
   🧪 TEST MODE: Running scheduled job immediately

   ================================================================================
   🎯 WEEKLY SCHEDULED JOB STARTED
   🕐 Time: 2025-12-17T10:30:00.000Z
   ================================================================================

   📊 Step 1: Reading symbol metadata...
   ✅ Found 12 symbol records in database

   📅 Step 2: Calculating date range...
   From: 2025-11-29
   To:   2025-12-13

   📝 Step 3: Updating configuration...
   ✅ config.json updated successfully

   🔄 Step 4: Running ETL pipeline...
   [... import logs ...]

   ================================================================================
   ✅ WEEKLY SCHEDULED JOB COMPLETED SUCCESSFULLY
   ⏱️  Duration: 15m 23s
   ================================================================================
   ```

### Verify on Render

1. Deploy to Render Background Worker
2. Check logs immediately after deployment
3. You should see: "✅ Scheduler started successfully"
4. Wait until Sunday 2:00 AM UTC or check logs then

## 🛠️ Troubleshooting

### Scheduler Won't Start

**Error**: `Cannot find module './run_all_importers'`

**Solution**: Make sure all dependencies are installed:
```bash
npm install
```

### Database Connection Failed

**Error**: `Failed to read symbol metadata: connection refused`

**Solution**: Check your `DATABASE_URL` environment variable:
```bash
# Test connection
npm run db:test
```

### Config.json Not Updating

**Error**: `ENOENT: no such file or directory, open 'config.json'`

**Solution**: Verify `config.json` exists in the root directory:
```bash
ls -la config.json
```

### Import Pipeline Fails

**Error**: `ETL Pipeline failed`

**Solution**:
1. Check if symbols are configured in [config.json](config.json)
2. Verify API access (Dukascopy, Binance)
3. Check rate limits and timeouts
4. Review logs for specific error messages

### Scheduler Runs But No Data

**Issue**: Scheduler completes but database shows no new records

**Check**:
1. Date range might be outside available data
2. Symbols might be disabled in config
3. Database import might have failed silently

**Debug**:
```bash
# Check what data was fetched
ls -la data/tradfi/
ls -la data/crypto/

# Check database metadata
npm run db:stats
```

## 📁 File Structure

```
cross-market-etl-pipeline/
├── scheduler.js                 # Main scheduler (THIS FILE)
├── run_all_importers.js         # Import orchestrator
├── scripts/
│   └── import_to_database.js    # Database import
├── config.json                  # Configuration (auto-updated)
├── package.json                 # npm scripts
└── .env                         # Environment variables (local only)
```

## 🔐 Security Notes

1. **Never commit `.env`** - Already in `.gitignore`
2. **Certificate file** (`ca-certificate.crt`) is in `.gitignore`
3. **Set environment variables** in Render dashboard, not in code
4. **DATABASE_URL** should use SSL for production

## 📈 Monitoring

### Check Scheduler Status

On Render, view logs to see:
- When scheduler started
- Next scheduled execution time
- Real-time execution logs

### Check Database Updates

Query your database to verify new data:

```sql
-- Check latest timestamps
SELECT
  symbol,
  asset_type,
  last_available_timestamp,
  total_records
FROM symbol_metadata
ORDER BY last_available_timestamp DESC;

-- Check record counts
SELECT
  symbol,
  COUNT(*) as records
FROM ohlcv_eurusd_m5_tradfi
WHERE timestamp > NOW() - INTERVAL '2 weeks'
GROUP BY symbol;
```

## 🎛️ Customization

### Change Schedule Time

Edit [scheduler.js](scheduler.js:252):

```javascript
// Change from Sunday 2:00 AM to Wednesday 1:00 AM
const schedule = '0 1 * * 3';
```

### Change Date Range Window

Edit [scheduler.js](scheduler.js:40-55):

```javascript
// Change from 2 weeks to 1 month
startDate.setUTCDate(lastFriday.getUTCDate() - 30);
```

### Change Target Day

Edit [scheduler.js](scheduler.js:43-47) to target Saturday instead of Friday:

```javascript
// Find last Saturday instead of Friday
let daysToLastSaturday = dayOfWeek <= 6 ? dayOfWeek + 1 : dayOfWeek - 6;
```

## 💡 Tips

1. **Start with test mode** before deploying to production
2. **Monitor first few runs** to ensure everything works
3. **Check logs regularly** for any errors or warnings
4. **Keep config.json simple** - only enable symbols you need
5. **Use metadata** to track data coverage and gaps

## 🆘 Support

If you encounter issues:

1. Check this README first
2. Review Render logs for error messages
3. Test locally with `npm run scheduler:test`
4. Verify database connection with `npm run db:test`
5. Check [config.json](config.json) is properly formatted

## 📝 Example Output

Successful scheduler run:

```
================================================================================
🎯 WEEKLY SCHEDULED JOB STARTED
🕐 Time: 2025-12-15T02:00:00.000Z
================================================================================

📊 Step 1: Reading symbol metadata...
✅ Found 12 symbol records in database
   📊 TradFi: 9 records
   🪙 Crypto: 3 records

📅 Step 2: Calculating date range...
   From: 2025-12-01
   To:   2025-12-13

📝 Step 3: Updating configuration...
✅ config.json updated successfully

🔄 Step 4: Running ETL pipeline...

📥 Step 1: Importing data from APIs...
🚀 Starting Cross-Market ETL Pipeline
[... import progress ...]
✅ Data import completed

📥 Step 2: Importing data to database...
📊 Starting CSV import to symbol tables...
[... database import progress ...]
✅ Database import completed

================================================================================
✅ WEEKLY SCHEDULED JOB COMPLETED SUCCESSFULLY
⏱️  Duration: 18m 42s
🕐 Completed: 2025-12-15T02:18:42.000Z
================================================================================
```

---

**Happy Scheduling! 🎉**
