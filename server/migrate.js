'use strict';
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] applying schema...');
  await pool.query(sql);
  console.log('[migrate] done.');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
