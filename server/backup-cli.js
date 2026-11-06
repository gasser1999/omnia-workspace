'use strict';
const { query, pool } = require('./db');
const storage = require('./storage');

async function main() {
  const users = await query('select id, name, email, created_at from users order by created_at');
  const workspaces = await query('select user_id, data, updated_at from workspaces');
  const files = await query('select id, user_id, name, mime, size_bytes, category, storage_path, created_at from files');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `manual/${stamp}.json`;
  const payload = {
    createdAt: new Date().toISOString(),
    counts: { users: users.rowCount, workspaces: workspaces.rowCount, files: files.rowCount },
    users: users.rows,
    workspaces: workspaces.rows,
    files: files.rows,
  };
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const location = await storage.uploadBackup(buffer, key);
  await query('insert into backups (location, size_bytes, counts) values ($1, $2, $3::jsonb)', [
    location,
    buffer.length,
    JSON.stringify(payload.counts),
  ]);
  console.log(`[backup] written to ${location} (${buffer.length} bytes)`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backup] failed:', err.message);
  process.exit(1);
});
