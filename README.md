# cross-market-etl-pipeline


In order to make the pipeline work:

1. Set up a PostgreSQL database - either locally or online. Personally I'm using Digital Ocean's standard instance, as I've found it to be the most reasonable option for me. 
2. Create a .env file in your root directory, copy the contents of .env.example there and replace with your actual DATABASE_URL connection file.
3. If necessary, get your CA certificate file from your DB provider - easily downloadable on Digital Ocean's site, right next to the Copy button in your Connection Details section. Make sure you put it in certs/ directory and set the proper file name in your .env
4. Adjust your config.json accordingly
5. Install dependencies with npm install and pip install -r requirements.txt
6. Run the .csv imports with npm run import:all. Be patient, as it will take some time, usually about 7-8 minutes for a year of m1 data for tradfi symbols, about 2 minutes for a year of m1 data for crypto. You will see logs after an import for a given symbol is completed.
7. Now, provided that your imports were successful, you should have your OHLCV data in /data/tradfi and data/crypto directories. Now it's the time to import data to your database.
8. Import data to your database with npm run db:import and wait patiently, as it will take lots of time, but you will see the progress meter and logs depending on the specified interval.

9. Setup your scheduler to frequently populate your database with new data, having an automated data flow every week from now on.