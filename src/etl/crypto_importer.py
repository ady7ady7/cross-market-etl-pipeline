"""
CCXT Crypto Data Importer
Fetches historical crypto data from exchanges with proper rate limiting and logging
"""

import sys
import os
import time
from datetime import datetime, timedelta

# Add project root to path for imports
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

import ccxt
from src.config.crypto_assets import (
    CRYPTO_ASSETS, CRYPTO_CONFIG, DATA_CONFIG,
    EXCHANGE_CONFIGS, get_date_range_as_datetime,
    get_active_timeframes, get_timeframe_config
)
from src.utils.crypto_logger import CryptoLogger
from src.utils.crypto_csv_writer import CryptoCsvWriter


class CryptoImporter:
    def __init__(self):
        self.logger = CryptoLogger(
            'CCXT Crypto Data Import',
            DATA_CONFIG['log_config']['enable_file_logging'],
            DATA_CONFIG['data_paths']['logs']
        )
        self.csv_writer = CryptoCsvWriter(DATA_CONFIG['data_paths']['crypto'])
        self.exchanges = {}

        # Get active timeframes from config and environment
        self.active_timeframes = get_active_timeframes()
        print(f"🎯 Active timeframes: {', '.join(self.active_timeframes)}")

    def _init_exchange(self, exchange_name):
        """Initialize exchange with proper configuration"""
        if exchange_name in self.exchanges:
            return self.exchanges[exchange_name]
        
        try:
            # Get exchange class
            exchange_class = getattr(ccxt, exchange_name)
            
            # Get exchange config
            config = EXCHANGE_CONFIGS.get(exchange_name, {})
            
            # Create exchange instance (no API keys needed for public data)
            exchange = exchange_class({
                'rateLimit': config.get('rateLimit', CRYPTO_CONFIG['rate_limit_delay'] * 1000),
                'enableRateLimit': config.get('enableRateLimit', True),
                'timeout': CRYPTO_CONFIG['timeout'],
                'sandbox': config.get('sandbox', False),
                'options': config.get('options', {})
            })
            
            self.exchanges[exchange_name] = exchange
            return exchange
            
        except Exception as e:
            self.logger.error(f"Failed to initialize exchange {exchange_name}", e)
            raise

    def _get_timeframe_duration_ms(self, timeframe):
        """Convert timeframe to milliseconds"""
        timeframe_map = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        }
        return timeframe_map.get(timeframe, 60 * 1000)  # Default to 1m

    def fetch_historical_data(self, asset, date_range=None, timeframe=None):
        """Fetch historical data for a single crypto asset"""
        dates = date_range or get_date_range_as_datetime()
        tf = timeframe or 'm1'  # Default to m1 if not specified
        exchange_name = asset.get('exchange', CRYPTO_CONFIG['default_exchange'])

        # Get timeframe-specific config
        timeframe_config = get_timeframe_config(tf)

        self.logger.start()
        self.logger.info(f"Fetching {asset['name']} ({asset['symbol']}) data")
        self.logger.info(f"Exchange: {exchange_name}")
        self.logger.info(f"Timeframe: {tf}")
        self.logger.info(f"Date range: {dates['from'].isoformat()} to {dates['to'].isoformat()}")
        self.logger.info(f"Rate limit delay: {timeframe_config['rateLimitDelay']}s")
        self.logger.info(f"Batch size: {timeframe_config['batchSize']}")

        try:
            # Initialize exchange
            exchange = self._init_exchange(exchange_name)
            
            # Check if exchange supports OHLCV
            if not exchange.has['fetchOHLCV']:
                raise Exception(f"Exchange {exchange_name} does not support OHLCV data")
            
            # Convert dates to timestamps (milliseconds)
            since = int(dates['from'].timestamp() * 1000)
            until = int(dates['to'].timestamp() * 1000)
            
            # Get timeframe duration
            timeframe_duration = self._get_timeframe_duration_ms(tf)
            
            all_candles = []
            current_time = since
            batch_count = 0
            
            self.logger.info(f"Starting data collection from {exchange.iso8601(since)}")
            
            while current_time < until:
                try:
                    batch_count += 1
                    
                    # Fetch OHLCV data
                    self.logger.batch(batch_count, 0, timeframe_config['batchSize'])  # 0 = unknown total

                    candles = exchange.fetch_ohlcv(
                        symbol=asset['symbol'],
                        timeframe=timeframe_config['ccxtTimeframe'],
                        since=current_time,
                        limit=timeframe_config['batchSize']
                    )
                    
                    if not candles:
                        self.logger.warn(f"No data returned for batch {batch_count}")
                        break
                    
                    # Filter candles within our date range
                    valid_candles = [c for c in candles if since <= c[0] <= until]
                    all_candles.extend(valid_candles)
                    
                    self.logger.info(f"Fetched {len(candles)} candles, {len(valid_candles)} within range")
                    
                    # Update current time for next batch
                    if candles:
                        current_time = candles[-1][0] + timeframe_duration
                    else:
                        break
                    
                    # Exit if we've reached the end date
                    if current_time >= until:
                        break
                    
                    # Rate limiting
                    self.logger.pause(timeframe_config['rateLimitDelay'])
                    time.sleep(timeframe_config['rateLimitDelay'])

                except ccxt.BaseError as e:
                    self.logger.error(f"CCXT error in batch {batch_count}: {str(e)}")
                    if batch_count >= CRYPTO_CONFIG['max_retries']:
                        raise
                    time.sleep(timeframe_config['rateLimitDelay'] * 2)  # Longer wait on error
                    continue

            # Remove duplicates and sort by timestamp
            unique_candles = {}
            for candle in all_candles:
                unique_candles[candle[0]] = candle
            
            sorted_candles = sorted(unique_candles.values(), key=lambda x: x[0])
            
            self.logger.success(f"Successfully fetched {len(sorted_candles)} data points")
            
            # Save to CSV
            file_path = self.csv_writer.write_crypto_data(
                sorted_candles,
                asset['symbol'],
                tf,
                dates
            )
            
            self.logger.complete(len(sorted_candles), file_path)
            
            return {
                'data': sorted_candles,
                'file_path': file_path,
                'record_count': len(sorted_candles),
                'asset': asset,
                'timeframe': tf,
                'date_range': dates
            }
            
        except Exception as error:
            self.logger.error('Failed to fetch historical data', error)
            raise

    def fetch_all_assets(self, date_range=None, timeframe=None):
        """Fetch data for all configured crypto assets across multiple timeframes"""
        results = {}
        timeframes_to_process = [timeframe] if timeframe else self.active_timeframes

        self.logger.info(f"📊 Processing {len(timeframes_to_process)} timeframe(s): {', '.join(timeframes_to_process)}")

        for tf in timeframes_to_process:
            self.logger.info(f"\n🕒 Starting timeframe: {tf.upper()}")
            results[tf] = {}

            for i, asset in enumerate(CRYPTO_ASSETS):
                self.logger.info(f"\n{'=' * 60}")
                self.logger.info(f"Processing asset {i + 1}/{len(CRYPTO_ASSETS)}: {asset['name'].upper()} ({tf.upper()})")
                self.logger.info(f"{'=' * 60}")

                try:
                    result = self.fetch_historical_data(asset, date_range, tf)
                    results[tf][asset['symbol']] = result

                    # Small delay between different assets to be respectful
                    if i < len(CRYPTO_ASSETS) - 1:
                        self.logger.info('Waiting 3 seconds before next asset...')
                        time.sleep(3)

                except Exception as error:
                    self.logger.error(f"Failed to process asset {asset['symbol']} ({tf})", error)
                    results[tf][asset['symbol']] = {'error': str(error), 'asset': asset, 'timeframe': tf}

            # Longer delay between timeframes
            if timeframes_to_process.index(tf) < len(timeframes_to_process) - 1:
                self.logger.info(f"\n⏸️  Completed {tf.upper()}, waiting 10 seconds before next timeframe...")
                time.sleep(10)

        return results

    def fetch_asset_by_symbol(self, symbol, date_range=None, timeframe=None):
        """Fetch specific asset by symbol"""
        asset = None
        for a in CRYPTO_ASSETS:
            if a['symbol'] == symbol:
                asset = a
                break
        
        if not asset:
            raise Exception(f"Asset with symbol '{symbol}' not found in CRYPTO_ASSETS")
        
        return self.fetch_historical_data(asset, date_range, timeframe)

    def fetch_first_asset(self, date_range=None):
        """Fetch the first configured asset (for testing)"""
        if not CRYPTO_ASSETS:
            raise Exception('No assets configured in CRYPTO_ASSETS')
        
        return self.fetch_historical_data(CRYPTO_ASSETS[0], date_range)


def main():
    """Main execution function for direct script running"""
    importer = CryptoImporter()
    
    try:
        # Use the configured date range and fetch the first configured asset
        if not CRYPTO_ASSETS:
            print('❌ No assets configured in CRYPTO_ASSETS')
            sys.exit(1)

        first_asset = CRYPTO_ASSETS[0]
        print(f"🎯 Fetching {first_asset['name']} data with configured date range...\n")
        
        result = importer.fetch_first_asset()
        
        print('\n📋 Summary:')
        print(f"- Asset: {result['asset']['name']} ({result['asset']['symbol']})")
        print(f"- Exchange: {result['asset']['exchange']}")
        print(f"- Timeframe: {result['timeframe']}")
        print(f"- Date range: {result['date_range']['from'].strftime('%Y-%m-%d')} to {result['date_range']['to'].strftime('%Y-%m-%d')}")
        print(f"- Records fetched: {result['record_count']}")
        print(f"- CSV file: {result['file_path']}")
        
        if result['data']:
            print('- Sample data (first 3 records):')
            for i, record in enumerate(result['data'][:3]):
                if isinstance(record, list) and len(record) >= 6:
                    timestamp_ms, open_price, high_price, low_price, close_price, volume = record[:6]
                    dt = datetime.fromtimestamp(timestamp_ms / 1000.0)
                    print(f"  {i+1}. {dt.isoformat()} | O:{open_price} H:{high_price} L:{low_price} C:{close_price} V:{volume}")

    except Exception as error:
        print(f'❌ Script execution failed: {error}')
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()