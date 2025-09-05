# cross-market-etl-pipeline


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