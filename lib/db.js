import pg from 'pg';

const { Pool } = pg;

let pool;
let schemaPromise;

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL belum dikonfigurasi.');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 5),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    ssl: boolEnv('DATABASE_SSL', true) ? { rejectUnauthorized: false } : false,
    application_name: 'ytconv-support'
  });

  pool.on('error', (error) => {
    console.error('[database] idle client error:', error.message);
  });

  return pool;
}

export async function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        ticket_id VARCHAR(32) PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        email VARCHAR(254) NOT NULL,
        category VARCHAR(40) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'open',
        public_note TEXT NOT NULL DEFAULT '',
        ip_hash VARCHAR(64) NOT NULL,
        email_sent BOOLEAN NOT NULL DEFAULT FALSE,
        email_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets (created_at DESC);');
    await db.query('CREATE INDEX IF NOT EXISTS support_tickets_ip_hash_idx ON support_tickets (ip_hash, created_at DESC);');
    await db.query('CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, updated_at DESC);');

    await db.query(`
      CREATE TABLE IF NOT EXISTS support_auth_limits (
        limiter_key VARCHAR(80) PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_until TIMESTAMPTZ
      );
    `);
  })().catch((error) => {
    schemaPromise = undefined;
    throw error;
  });

  return schemaPromise;
}

export async function query(text, params = []) {
  await ensureSchema();
  return getPool().query(text, params);
}
