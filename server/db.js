'use strict';
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProd || /supabase\.(co|com)/.test(config.databaseUrl)
    ? { rejectUnauthorized: false }
    : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err.message);
});

async function query(text, params) {
  const started = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - started;
  if (ms > 500) console.warn(`[db] slow query ${ms}ms: ${text.slice(0, 80)}`);
  return res;
}

module.exports = { pool, query };
