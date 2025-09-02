"""
Crypto asset configuration for Python ccxt implementation
Loads asset definitions from master config.json
"""

import json
import os
from datetime import datetime, timedelta

# Load master configuration
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
config_path = os.path.join(project_root, 'config.json')

with open(config_path, 'r') as f:
    master_config = json.load(f)

# Crypto Assets List - from master config
CRYPTO_ASSETS = master_config['assets']['crypto']

# Global Crypto Configuration - from master config
CRYPTO_CONFIG = {
    'timeframe': master_config['crypto']['timeframe'],
    'default_exchange': master_config['crypto']['defaultExchange'],
    'available_timeframes': ['1m', '5m', '1h', '1d'],
    'batch_size': master_config['crypto']['batchSize'],
    'rate_limit_delay': master_config['crypto']['rateLimitDelay'],
    'max_retries': master_config['crypto']['maxRetries'],
    'timeout': 30000
}

# Data configuration for Python - from master config
DATA_CONFIG = {
    # Default date range - from master config
    'default_date_range': {
        'from': master_config['dateRanges']['default']['from'],
        'to': master_config['dateRanges']['default']['to']
    },
    
    # Data storage paths - from master config
    'data_paths': {
        'crypto': master_config['paths']['cryptoData'],
        'logs': master_config['paths']['logs']
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
        'sandbox': False,
        'rateLimit': 1200,
        'enableRateLimit': True,
        'options': {
            'defaultType': 'spot'
        }
    },
    'coinbase': {
        'sandbox': False,
        'rateLimit': 10000,
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