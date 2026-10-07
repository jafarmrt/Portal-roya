const { Pool } = require('pg');
require('dotenv').config();

async function clean() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await pool.query(`
      TRUNCATE TABLE polls CASCADE;
      TRUNCATE TABLE poll_options CASCADE;
      TRUNCATE TABLE poll_votes CASCADE;
      TRUNCATE TABLE employees CASCADE;
      TRUNCATE TABLE news CASCADE;
      TRUNCATE TABLE moods CASCADE;
      TRUNCATE TABLE trainings CASCADE;
      TRUNCATE TABLE new_colleagues CASCADE;
      TRUNCATE TABLE calendar_events CASCADE;
      TRUNCATE TABLE users CASCADE;
    `);
    console.log("Database cleaned.");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

clean();
