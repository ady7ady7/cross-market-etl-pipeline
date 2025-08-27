"""
Crypto asset configuration for Python ccxt implementation
Separate config file for crypto assets to avoid Node.js/Python conflicts
"""

from datetime import datetime, timedelta

# Crypto Assets List - for ccxt implementation
CRYPTO_ASSETS = [
    # Uncomment and add crypto assets as needed
    # {'symbol': 'BTC/USDT', 'name': 'Bitcoin', 'exchange': 'binance'},
    # {'symbol': 'ETH/USDT', 'name': 'Ethereum', 'exchange': 'binance'},
    # {'symbol': 'ADA/USDT', 'name': 'Cardano', 'exchange': 'binance'},
    # {'symbol': 'SOL/USDT', 'name': 'Solana', 'exchange': 'binance'},
    # {'symbol': 'DOT/USDT', 'name': 'Polkadot', 'exchange': 'binance'}
]

# Global Crypto Configuration
CRYPTO_CONFIG = {
    'timeframe': '1m',                    # Single timeframe for all crypto assets
    'default_exchange': 'binance',        # Default exchange
    'available_timeframes': ['1m', '5m', '1h', '1d'],
    'batch_size': 1000,                   # Records per request (ccxt typically handles larger batches)
    'rate_limit_delay': 1.0,              # Seconds between requests
    'max_retries': 3,                     # Maximum retry attempts for failed requests
    'timeout': 30000                      # Request timeout in milliseconds
}

# Data configuration for Python
DATA_CONFIG = {
    # Default date range - matches Node.js config
    'default_date_range': {
        'from': '2025-08-25',             # YYYY-MM-DD format
        'to': '2025-08-27'                # YYYY-MM-DD format
    },
    
    # Data storage paths (relative to project root)
    'data_paths': {
        'crypto': './data/crypto',
        'logs': './logs'
    },
    
    # Logging configuration
    'log_config': {
        'enable_file_logging': True,
        'enable_console_logging': True,
        'log_level': 'INFO'
    },
    
    # CSV output configuration
    'csv_config': {
        'include_headers': True,
        'date_format': '%Y-%m-%d %H:%M:%S'
    }
}

# Exchange-specific configurations
EXCHANGE_CONFIGS = {
    'binance': {
        'sandbox': False,                 # Set to True for testing
        'rateLimit': 1200,               # Requests per minute
        'enableRateLimit': True,
        'options': {
            'defaultType': 'spot'        # 'spot', 'future', 'delivery'
        }
    },
    'coinbase': {
        'sandbox': False,
        'rateLimit': 10000,              # More permissive rate limit
        'enableRateLimit': True
    },
    'kraken': {
        'rateLimit': 3000,
        'enableRateLimit': True
    }
}

def get_date_range_as_datetime(date_range=None):
    """
    Convert string dates to datetime objects for ccxt compatibility
    """
    if date_range is None:
        date_range = DATA_CONFIG['default_date_range']
    
    return {
        'from': datetime.strptime(date_range['from'], '%Y-%m-%d'),
        'to': datetime.strptime(date_range['to'], '%Y-%m-%d')
    }

def get_asset_by_symbol(symbol):
    """
    Find crypto asset by symbol
    """
    for asset in CRYPTO_ASSETS:
        if asset['symbol'] == symbol:
            return asset
    return None

def get_available_exchanges():
    """
    Get list of configured exchanges
    """
    return list(EXCHANGE_CONFIGS.keys())

# For when this file is imported into Node.js scripts (if needed)
if __name__ == "__main__":
    print("Crypto Assets Configuration")
    print(f"Available assets: {len(CRYPTO_ASSETS)}")
    print(f"Default timeframe: {CRYPTO_CONFIG['timeframe']}")
    print(f"Available exchanges: {get_available_exchanges()}")
    print(f"Default date range: {DATA_CONFIG['default_date_range']}")