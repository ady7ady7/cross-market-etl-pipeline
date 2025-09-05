# cross-market-etl-pipeline
The goal of this project was to establish an automated data gathering pipeline from various markets for backtesting and research purposes. I decided it would be the most convenient to use a database and a scheduler - this is not the cheapest option, but the goal is to collect the most recent data every 7-10 days, in case of a scenario where good data with higher lookback period will not be available in the future for some reason, so I can keep collecting it for backtesting and analyses. Data from 7-10 days ago for m1 timeframe is easily available in various sources for free, but it might be an issue to gather it regularly, for different reasons. Thanks to the automation, I will never forget to run the script and will still be able to maintain a reliable market dataset without gaps in the long run.

In order to gather tradfi data, I used dukascopy-node.app built by Leonid Pyrlia (Leo4815162342) - https://github.com/Leo4815162342/dukascopy-node. Please star his work if you're using this pipeline - amazing work and great documentation in that project! Thanks to Dukascopy and that person, I was able to create a reliable tradfi data pipeline with good quality OHLCV data from m1 timeframe and relatively long lookback period, completely for free.  Crypto data is imported using CCXT, but I have not checked its quality yet.

In order to make the initial data import:

1. Set up a PostgreSQL database - either locally or online. Personally I'm using Digital Ocean's standard instance, as I've found it to be the most reasonable option for me. 
2. Create a .env file in your root directory, copy the contents of .env.example there and replace with your actual DATABASE_URL connection file.
3. If necessary, get your CA certificate file from your DB provider - easily downloadable on Digital Ocean's site, right next to the Copy button in your Connection Details section. Make sure you put it in certs/ directory and set the proper file name in your .env
4. Adjust your config.json accordingly
5. Install dependencies with npm install and pip install -r requirements.txt
6. Run the .csv imports with npm run import:all. Be patient, as it will take some time, usually about 7-8 minutes for a year of m1 data for tradfi symbols, about 2 minutes for a year of m1 data for crypto. You will see logs after an import for a given symbol is completed.
7. Now, provided that your imports were successful, you should have your OHLCV data in /data/tradfi and data/crypto directories. Now it's the time to import data to your database.
8. Import data to your database with npm run db:import and wait patiently, as it will take lots of time, but you will see the progress meter and logs depending on the specified interval.

In order to setup your scheduler:
1. Setup a basic Background Worker on Render, or use any other alternative service or your choice
2. Use the render.yaml file from the root folder of this repository as your guideline of how to set it, besides set the language as Node, populate Environment Variables on Render/alternative service with your DATABASE_URL, DATABASE_CA_CERT_PATH, and NODE_ENV from your .env.
3. Remember to whitelist Render's/alternative service's IP addresses in your database provider's website. As for Render, you can find them in the project's dashboard -> click the Connect button in the top right corner, select Outbound and copy all the addresses from there.
4. You're good to go, if you've done everything correctly, your service should be working from now on!
5. You can do the big data imports manually on your own, and then the scheduler will acknowledge all the present symbols and will start to automatically import data from the last available timestamp.


ISSUES TROUBLESHOOTING:
- DB Connection error #1 - Remember to whitelist your Ip address in your database provider's website, if you're using dynamic IP you might have to change it more often.
- DB Connection error - especially with Digital Ocean - if you're experiencing a self-signed certificate ISSUE when trying to connect to your database using this repository with npm run db:test or npm run db:import, make sure you remove '?sslmode=require' from your DATABASE_URL ending in .env. Your connection string is conflicting with the ssl configuration set in config/database.js. You should be able to connect just fine after this change! - @4.09.2025