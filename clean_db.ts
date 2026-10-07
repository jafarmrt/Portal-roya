import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function clean() {
  console.log("Cleaning database using DELETE...");
  await db.execute(sql`DELETE FROM poll_votes;`);
  await db.execute(sql`DELETE FROM poll_options;`);
  await db.execute(sql`DELETE FROM polls;`);
  await db.execute(sql`DELETE FROM employees;`);
  await db.execute(sql`DELETE FROM news;`);
  await db.execute(sql`DELETE FROM moods;`);
  await db.execute(sql`DELETE FROM trainings;`);
  await db.execute(sql`DELETE FROM new_colleagues;`);
  await db.execute(sql`DELETE FROM calendar_events;`);
  await db.execute(sql`DELETE FROM users;`);
  console.log("Database cleaned.");
  process.exit(0);
}

clean();
