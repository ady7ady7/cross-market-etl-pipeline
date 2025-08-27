/**
 * Simple Database Configuration for PostgreSQL
 * Works with Render PostgreSQL and local development
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env' });

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection function
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    
    const result = await client.query('SELECT NOW() as server_time');
    console.log('📅 Database server time:', result.rows[0].server_time);
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('💡 Check your DATABASE_URL in .env file');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);

    return false;
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  pool.end();
});

module.exports = {
  pool,
  testConnection
};