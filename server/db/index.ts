import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.resolve('drizzle') });
}
