'use strict';
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');
const config = require('../config');

const router = express.Router();

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const found = await query(
      'select data, updated_at from workspaces where user_id = $1',
      [req.user.id]
    );
    if (found.rowCount === 0) {
      return res.json({ data: {}, updatedAt: null });
    }
    return res.json({ data: found.rows[0].data, updatedAt: found.rows[0].updated_at });
  } catch (err) {
    return next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    const data = req.body?.data;
    if (!isPlainObject(data)) {
      return res.status(400).json({ error: 'invalid_payload', message: 'البيانات يجب أن تكون كائناً JSON.' });
    }
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, 'utf8') > config.maxWorkspaceBytes) {
      return res.status(413).json({ error: 'payload_too_large', message: 'حجم البيانات أكبر من الحد المسموح.' });
    }

    const saved = await query(
      `insert into workspaces (user_id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (user_id)
       do update set data = excluded.data, updated_at = now()
       returning updated_at`,
      [req.user.id, serialized]
    );

    return res.json({ ok: true, updatedAt: saved.rows[0].updated_at });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
