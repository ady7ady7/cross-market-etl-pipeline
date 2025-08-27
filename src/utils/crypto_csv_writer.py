"""
Python CSV writer utility for crypto financial data export
Compatible with the Node.js CSV writer functionality
"""

import os
import csv
from pathlib import Path
from datetime import datetime


class CryptoCsvWriter:
    def __init__(self, base_data_path):
        self.base_data_path = base_data_path

    def _ensure_directory_exists(self, dir_path):
        """Ensure directory exists"""
        Path(dir_path).mkdir(parents=True, exist_ok=True)

    def _generate_filename(self, instrument, timeframe, date_range):
        """Generate CSV filename"""
        from_date = date_range['from'].strftime('%Y-%m-%d')
        to_date = date_range['to'].strftime('%Y-%m-%d')
        # Replace / with _ for crypto symbols like BTC/USDT
        clean_instrument = instrument.replace('/', '_')
        return f"{clean_instrument}_{timeframe}_{from_date}_to_{to_date}.csv"

    def write_crypto_data(self, data, symbol, timeframe, date_range):
        """Write crypto data to CSV file"""
        filename = self._generate_filename(symbol, timeframe, date_range)
        file_path = os.path.join(self.base_data_path, filename)
        
        # Ensure directory exists
        self._ensure_directory_exists(os.path.dirname(file_path))

        # CSV headers for crypto data
        headers = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        
        with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=headers)
            writer.writeheader()
            
            for record in data:
                # Handle CCXT OHLCV format: [timestamp, open, high, low, close, volume]
                if isinstance(record, list) and len(record) >= 6:
                    timestamp_ms, open_price, high_price, low_price, close_price, volume = record[:6]
                    
                    # Convert timestamp from milliseconds to datetime
                    try:
                        dt = datetime.fromtimestamp(timestamp_ms / 1000.0)
                        formatted_timestamp = dt.strftime('%Y-%m-%d %H:%M:%S')
                    except (ValueError, OSError) as e:
                        print(f"Warning: Invalid timestamp {timestamp_ms}: {e}")
                        formatted_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    
                    writer.writerow({
                        'timestamp': formatted_timestamp,
                        'open': open_price if open_price is not None else 0,
                        'high': high_price if high_price is not None else 0,
                        'low': low_price if low_price is not None else 0,
                        'close': close_price if close_price is not None else 0,
                        'volume': volume if volume is not None else 0
                    })
                elif isinstance(record, dict):
                    # Handle dictionary format
                    timestamp_val = record.get('timestamp', record.get('datetime'))
                    
                    if isinstance(timestamp_val, (int, float)):
                        # Unix timestamp in milliseconds
                        try:
                            dt = datetime.fromtimestamp(timestamp_val / 1000.0)
                            formatted_timestamp = dt.strftime('%Y-%m-%d %H:%M:%S')
                        except (ValueError, OSError) as e:
                            print(f"Warning: Invalid timestamp {timestamp_val}: {e}")
                            formatted_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    elif isinstance(timestamp_val, str):
                        # String timestamp
                        try:
                            dt = datetime.fromisoformat(timestamp_val.replace('Z', '+00:00'))
                            formatted_timestamp = dt.strftime('%Y-%m-%d %H:%M:%S')
                        except ValueError:
                            formatted_timestamp = timestamp_val
                    else:
                        formatted_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    
                    writer.writerow({
                        'timestamp': formatted_timestamp,
                        'open': record.get('open', 0),
                        'high': record.get('high', 0),
                        'low': record.get('low', 0),
                        'close': record.get('close', 0),
                        'volume': record.get('volume', 0)
                    })
                else:
                    print(f"Warning: Unknown record format: {record}")
                    continue

        return file_path

    def append_data(self, file_path, new_data):
        """Append data to existing CSV file (for future use)"""
        headers = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        
        with open(file_path, 'a', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=headers)
            
            for record in new_data:
                if isinstance(record, list) and len(record) >= 6:
                    timestamp_ms, open_price, high_price, low_price, close_price, volume = record[:6]
                    
                    try:
                        dt = datetime.fromtimestamp(timestamp_ms / 1000.0)
                        formatted_timestamp = dt.strftime('%Y-%m-%d %H:%M:%S')
                    except (ValueError, OSError):
                        formatted_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    
                    writer.writerow({
                        'timestamp': formatted_timestamp,
                        'open': open_price if open_price is not None else 0,
                        'high': high_price if high_price is not None else 0,
                        'low': low_price if low_price is not None else 0,
                        'close': close_price if close_price is not None else 0,
                        'volume': volume if volume is not None else 0
                    })