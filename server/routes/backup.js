'use strict';
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');
const storage = require('../storage');
const config = require('../config');

const router = express.Router();

/** Per-user export (JSON, no file bytes). */
router.get('/export', requireAuth, async (req, res, next) => {
  try {
    const user = await query('select id, name, email, created_at from users where id = $1', [req.user.id]);
    const ws = await query('select data, updated_at from workspaces where user_id = $1', [req.user.id]);
    const files = await query(
      'select id, name, mime, size_bytes, category, created_at from files where user_id = $1 order by created_at',
      [req.user.id]
    );
    const payload = {
      exportedAt: new Date().toISOString(),
      user: user.rows[0] || null,
      workspace: ws.rows[0] || null,
      files: files.rows,
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="omnia-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    return res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    return next(err);
  }
});

/** Scheduled full backup, protected by BACKUP_SECRET. */
router.post('/cron', async (req, res, next) => {
  try {
    const secret = req.get('x-backup-secret') || req.query.secret;
    if (!config.backupSecret || secret !== config.backupSecret) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const users = await query('select id, name, email, created_at from users order by created_at');
    const workspaces = await query('select user_id, data, updated_at from workspaces');
    const files = await query('select id, user_id, name, mime, size_bytes, category, storage_path, created_at from files');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `daily/${stamp}.json`;
    const payload = {
      createdAt: new Date().toISOString(),
      counts: { users: users.rowCount, workspaces: workspaces.rowCount, files: files.rowCount },
      users: users.rows,
      workspaces: workspaces.rows,
      files: files.rows,
    };
    const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
    const location = await storage.uploadBackup(buffer, key);

    await query(
      'insert into backups (location, size_bytes, counts) values ($1, $2, $3::jsonb)',
      [location, buffer.length, JSON.stringify(payload.counts)]
    );

    // Retention: keep the 30 most recent backup records.
    await query(
      `delete from backups where id in (
         select id from backups order by created_at desc offset 30
       )`
    );

    return res.json({ ok: true, location, counts: payload.counts });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
