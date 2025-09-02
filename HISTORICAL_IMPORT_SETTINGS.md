# Historical Import Configuration Settings

For large-scale historical imports, modify these settings in your existing config files:

## TradFi Historical Import Settings

### `src/config/assets.js` modifications:

```javascript
// For historical imports - adjust these values
const TRADFI_CONFIG = {
  timeframe: 'm1',
  batchSize: 5,                      // Smaller batches for large datasets
  pauseBetweenBatchesMs: 5000,       // 5 second pause (be respectful)
};

// Historical date range (modify as needed)
const DATA_CONFIG = {
  defaultDateRange: {
    from: new Date("2024-01-01"),    // Start of historical range
    to: new Date("2025-08-29")       // End of historical range
  }
};
```

## Crypto Historical Import Settings

### `src/config/crypto_assets.py` modifications:

```python
# Historical date range
DATA_CONFIG = {
    'default_date_range': {
        'from': '2024-01-01',
        'to': '2025-08-29'
    }
}

# Conservative settings for large imports
CRYPTO_CONFIG = {
    'timeframe': '1m',
    'batch_size': 500,               # Smaller for historical
    'rate_limit_delay': 3.0,         # 3 second delay
    'max_retries': 5
}
```

## Usage

1. **Modify configs** with historical settings
2. **Run existing importers**: `npm run import:all`
3. **Import to database**: `npm run csv:import`
4. **Restore normal settings** after import
5. **Use metadata** to check for gaps and avoid duplicates

## Monthly Chunking Approach

For very large imports, process monthly:

```javascript
// January 2023
defaultDateRange: {
  from: new Date("2023-01-01"),
  to: new Date("2023-02-01")
}

// February 2023  
defaultDateRange: {
  from: new Date("2023-02-01"),
  to: new Date("2023-03-01")
}
```

Run import → CSV → Database → Update metadata → Next month