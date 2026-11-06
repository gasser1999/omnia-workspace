'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { signToken, setSessionCookie, clearSessionCookie, requireAuth } = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'invalid_name', message: 'الاسم يجب أن يكون بين حرفين و80 حرفاً.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'invalid_email', message: 'البريد الإلكتروني غير صالح.' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'weak_password', message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' });
    }

    const existing = await query('select id from users where email = $1', [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'email_taken', message: 'هذا البريد مسجّل بالفعل، يمكنك تسجيل الدخول.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const inserted = await query(
      `insert into users (name, email, password_hash)
       values ($1, $2, $3)
       returning id, name, email, created_at`,
      [name, email, hash]
    );
    const user = inserted.rows[0];
    await query(
      `insert into workspaces (user_id, data) values ($1, '{}'::jsonb)
       on conflict (user_id) do nothing`,
      [user.id]
    );

    const token = signToken(user);
    setSessionCookie(res, token);
    return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!EMAIL_RE.test(email) || !password) {
      return res.status(400).json({ error: 'invalid_credentials', message: 'يرجى إدخال البريد وكلمة المرور.' });
    }

    const found = await query('select id, name, email, password_hash from users where email = $1', [email]);
    if (found.rowCount === 0) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'البريد أو كلمة المرور غير صحيحة.' });
    }
    const user = found.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'البريد أو كلمة المرور غير صحيحة.' });
    }

    const token = signToken(user);
    setSessionCookie(res, token);
    return res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const found = await query('select id, name, email, created_at from users where id = $1', [req.user.id]);
    if (found.rowCount === 0) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'unauthorized' });
    }
    return res.json({ user: found.rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const current = String(req.body?.currentPassword || '');
    const nextPassword = String(req.body?.newPassword || '');
    if (nextPassword.length < 8 || nextPassword.length > 128) {
      return res.status(400).json({ error: 'weak_password', message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.' });
    }
    const found = await query('select password_hash from users where id = $1', [req.user.id]);
    if (found.rowCount === 0) return res.status(401).json({ error: 'unauthorized' });
    const ok = await bcrypt.compare(current, found.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials', message: 'كلمة المرور الحالية غير صحيحة.' });
    const hash = await bcrypt.hash(nextPassword, 12);
    await query('update users set password_hash = $1 where id = $2', [hash, req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
