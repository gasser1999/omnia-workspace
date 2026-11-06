'use strict';
const express = require('express');
const multer = require('multer');
const { query } = require('../db');
const { requireAuth } = require('../auth');
const storage = require('../storage');
const config = require('../config');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

function detectType(name, mime) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (['ppt', 'pptx'].includes(ext) || /presentation/.test(mime || '')) return ext === 'pptx' ? 'pptx' : 'ppt';
  return 'pdf';
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `select id, name, mime, size_bytes, category, created_at
       from files where user_id = $1 order by created_at desc`,
      [req.user.id]
    );
    return res.json({ files: rows.rows });
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  let key = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file', message: 'لم يتم اختيار ملف.' });

    const original = req.file.originalname || 'file';
    const category = String(req.body?.category || 'admin').slice(0, 40);
    key = storage.buildKey(req.user.id, original);

    await storage.upload(req.file.buffer, key, req.file.mimetype);

    const inserted = await query(
      `insert into files (user_id, name, mime, size_bytes, storage_path, category)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, mime, size_bytes, category, created_at`,
      [req.user.id, original, req.file.mimetype || null, req.file.size, key, category]
    );

    const row = inserted.rows[0];
    return res.status(201).json({
      file: {
        id: row.id,
        name: row.name,
        mime: row.mime,
        size: row.size_bytes,
        category: row.category,
        createdAt: row.created_at,
        type: detectType(row.name, row.mime),
        downloadUrl: `/api/files/${row.id}/download`,
      },
    });
  } catch (err) {
    if (key) {
      try { await storage.remove(key); } catch (_) { /* best effort */ }
    }
    return next(err);
  }
});

router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const found = await query(
      'select id, name, mime, storage_path from files where id = $1 and user_id = $2',
      [req.params.id, req.user.id]
    );
    if (found.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    const row = found.rows[0];
    return await storage.sendFile(res, row.storage_path, row.name, row.mime);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const found = await query(
      'select id, storage_path from files where id = $1 and user_id = $2',
      [req.params.id, req.user.id]
    );
    if (found.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    await storage.remove(found.rows[0].storage_path);
    await query('delete from files where id = $1 and user_id = $2', [req.params.id, req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
