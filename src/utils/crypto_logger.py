"""
Python logging utility for crypto ETL pipeline with progress tracking
Compatible with the Node.js logger functionality
"""

import os
import time
from datetime import datetime, timezone
from pathlib import Path


class CryptoLogger:
    def __init__(self, process_name="Crypto ETL Process", enable_file_logging=True, logs_path="./logs"):
        self.process_name = process_name
        self.start_time = None
        self.total_items = 0
        self.processed_items = 0
        self.errors = []
        self.enable_file_logging = enable_file_logging
        self.logs_path = logs_path
        self.log_file = None

    def _ensure_logs_directory(self):
        """Ensure logs directory exists"""
        if self.enable_file_logging:
            Path(self.logs_path).mkdir(parents=True, exist_ok=True)
            
            # Create log filename with timestamp
            timestamp = datetime.now().strftime('%Y-%m-%dT%H-%M-%S-%f')[:-3] + 'Z'
            log_filename = f"{self.process_name.lower().replace(' ', '_')}_{timestamp}.log"
            self.log_file = os.path.join(self.logs_path, log_filename)
            
            # Initialize log file with header
            self._write_to_file(f"=== {self.process_name} Log Started ===")
            self._write_to_file(f"Log file: {self.log_file}")
            self._write_to_file(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
            self._write_to_file("=" * 80)

    def _write_to_file(self, message):
        """Write message to log file"""
        if self.enable_file_logging and self.log_file:
            try:
                with open(self.log_file, 'a', encoding='utf-8') as f:
                    f.write(message + '\n')
            except Exception as e:
                print(f"Failed to write to log file: {e}")

    def _log(self, level, message, error=None):
        """Internal logging method"""
        timestamp = datetime.now(timezone.utc).isoformat()
        log_message = f"[{timestamp}] [{level.upper()}] {message}"
        
        # Console logging with emojis
        emoji_map = {
            'INFO': 'ℹ️ ',
            'SUCCESS': '✅',
            'WARN': '⚠️ ',
            'ERROR': '❌',
            'DEBUG': '🔍'
        }
        emoji = emoji_map.get(level.upper(), '')
        
        print(f"{emoji} [{timestamp}] {message}")
        
        # File logging (plain text, no emojis)
        self._write_to_file(log_message)
        
        if error:
            error_details = f"   Error details: {str(error)}"
            print(error_details)
            self._write_to_file(f"   Error details: {str(error)}")
            if hasattr(error, '__traceback__'):
                import traceback
                stack_trace = ''.join(traceback.format_tb(error.__traceback__))
                self._write_to_file(f"   Stack trace: {stack_trace}")
            self.errors.append({
                'message': message,
                'error': str(error),
                'timestamp': timestamp
            })

    def start(self, total_items=0):
        """Start the logging process"""
        self._ensure_logs_directory()
        
        self.start_time = time.time()
        self.total_items = total_items
        self.processed_items = 0
        self.errors = []
        
        start_message = f"Starting {self.process_name}"
        time_message = f"Start time: {datetime.now(timezone.utc).isoformat()}"
        separator = '─' * 60
        
        print(f"\n🚀 {start_message}")
        print(f"📅 {time_message}")
        if total_items > 0:
            print(f"📊 Total items to process: {total_items}")
        print(separator)

        self._write_to_file(f"\n{start_message}")
        self._write_to_file(time_message)
        if total_items > 0:
            self._write_to_file(f"Total items to process: {total_items}")
        self._write_to_file(separator)

    def info(self, message):
        """Log info message"""
        self._log('INFO', message)

    def success(self, message):
        """Log success message"""
        self._log('SUCCESS', message)

    def warn(self, message):
        """Log warning message"""
        self._log('WARN', message)

    def error(self, message, error=None):
        """Log error message"""
        self._log('ERROR', message, error)

    def debug(self, message):
        """Log debug message"""
        self._log('DEBUG', message)

    def update_progress(self, increment=1):
        """Update progress counter"""
        self.processed_items += increment
        
        if self.total_items > 0:
            percentage = (self.processed_items / self.total_items) * 100
            elapsed = time.time() - self.start_time
            avg_time_per_item = elapsed / self.processed_items if self.processed_items > 0 else 0
            remaining = self.total_items - self.processed_items
            estimated_time_left = remaining * avg_time_per_item
            
            progress_message = f"Progress: {self.processed_items}/{self.total_items} ({percentage:.1f}%) | ETA: {self._format_duration(estimated_time_left * 1000)}"
        else:
            progress_message = f"Processed: {self.processed_items} items"

        print(f"📈 {progress_message}")
        self._write_to_file(f"Progress: {progress_message}")

    def batch(self, batch_number, total_batches, items_in_batch):
        """Log batch processing"""
        percentage = (batch_number / total_batches) * 100 if total_batches > 0 else 0
        batch_message = f"Processing batch {batch_number}/{total_batches} ({percentage:.1f}%) - {items_in_batch} items"
        
        print(f"📦 {batch_message}")
        self._write_to_file(f"Batch: {batch_message}")

    def pause(self, duration):
        """Log pause for rate limiting"""
        pause_message = f"Pausing for {duration}s to respect rate limits..."
        print(f"⏸️  {pause_message}")
        self._write_to_file(f"Pause: {pause_message}")

    def complete(self, data_count=None, file_path=None):
        """Complete the logging process"""
        end_time = time.time()
        total_duration = (end_time - self.start_time) * 1000  # Convert to milliseconds
        separator = '─' * 60
        
        summary = [
            separator,
            f"{self.process_name} completed!",
            f"Total duration: {self._format_duration(total_duration)}",
            f"Items processed: {self.processed_items}"
        ]

        if data_count is not None:
            summary.append(f"Data records: {data_count}")
        
        if file_path:
            summary.append(f"Data saved to: {file_path}")
        
        if self.errors:
            summary.append(f"Errors encountered: {len(self.errors)}")
        
        summary.append(f"End time: {datetime.now(timezone.utc).isoformat()}")

        # Console output with emojis
        print(separator)
        print(f"🎉 {self.process_name} completed!")
        print(f"⏱️  Total duration: {self._format_duration(total_duration)}")
        print(f"📊 Items processed: {self.processed_items}")
        
        if data_count is not None:
            print(f"📈 Data records: {data_count}")
        
        if file_path:
            print(f"💾 Data saved to: {file_path}")
        
        if self.enable_file_logging and self.log_file:
            print(f"📄 Log file saved to: {self.log_file}")
        
        if self.errors:
            print(f"⚠️  Errors encountered: {len(self.errors)}")
            for idx, err in enumerate(self.errors, 1):
                print(f"   {idx}. {err['message']}")
        
        print(f"🏁 End time: {datetime.now(timezone.utc).isoformat()}\n")

        # File logging (plain text)
        for line in summary:
            self._write_to_file(line)

        if self.errors:
            self._write_to_file("\nError Summary:")
            for idx, err in enumerate(self.errors, 1):
                self._write_to_file(f"{idx}. {err['message']} ({err['timestamp']})")

        self._write_to_file(f"\n=== {self.process_name} Log Completed ===")

    def _format_duration(self, ms):
        """Format duration in milliseconds to human readable"""
        if ms < 1000:
            return f"{int(ms)}ms"
        elif ms < 60000:
            return f"{int(ms / 1000)}s"
        elif ms < 3600000:
            return f"{int(ms / 60000)}m {int((ms % 60000) / 1000)}s"
        else:
            return f"{int(ms / 3600000)}h {int((ms % 3600000) / 60000)}m"