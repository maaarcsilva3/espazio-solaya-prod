import { Pool, types, type PoolClient } from 'pg';
import { config } from './config';

// Keep DATE columns as 'YYYY-MM-DD' strings instead of JS Dates shifted by time zone.
types.setTypeParser(1082, (value) => value);
// NUMERIC -> number
types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl
    ? { rejectUnauthorized: !config.databaseSslInsecure }
    : undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
