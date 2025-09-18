const { pool } = require('../src/config/database');

async function dropColumns() {
  try {
    console.log('🗑️ Dropping unnecessary columns...');
    
    await pool.query(`
      ALTER TABLE symbol_metadata 
      DROP COLUMN IF EXISTS update_frequency_hours,
      DROP COLUMN IF EXISTS next_scheduled_update
    `);
    
    console.log('✅ Columns dropped successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to drop columns:', error);
    process.exit(1);
  }
}

dropColumns();