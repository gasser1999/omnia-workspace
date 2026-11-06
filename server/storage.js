'use strict';
/**
 * Storage abstraction.
 *  - STORAGE_DRIVER=supabase : files live in a private Supabase Storage bucket.
 *  - STORAGE_DRIVER=local    : files live on disk (used for local testing only).
 * The production deployment must use the Supabase driver.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

let supabase = null;
if (config.storageDriver === 'supabase') {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeName(name) {
  const base = path.basename(String(name || 'file'));
  return base.replace(/[^\w.\- ()\u0600-\u06FF]/g, '_').slice(0, 180) || 'file';
}

function buildKey(userId, originalName) {
  const id = crypto.randomUUID();
  return `${userId}/${id}-${safeName(originalName)}`;
}

async function upload(buffer, key, mime) {
  if (config.storageDriver === 'supabase') {
    const { error } = await supabase.storage
      .from(config.supabaseBucket)
      .upload(key, buffer, { contentType: mime || 'application/octet-stream', upsert: false });
    if (error) throw new Error(`storage_upload_failed: ${error.message}`);
    return;
  }
  const full = path.join(config.dataDir, 'uploads', key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buffer);
}

async function createDownloadUrl(key, expiresIn = 120) {
  if (config.storageDriver === 'supabase') {
    const { data, error } = await supabase.storage
      .from(config.supabaseBucket)
      .createSignedUrl(key, expiresIn);
    if (error) throw new Error(`storage_sign_failed: ${error.message}`);
    return data.signedUrl;
  }
  return null;
}

async function sendFile(res, key, downloadName, mime) {
  if (config.storageDriver === 'supabase') {
    const url = await createDownloadUrl(key, 120);
    return res.redirect(302, url);
  }
  const full = path.join(config.dataDir, 'uploads', key);
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(downloadName || path.basename(key))}`
  );
  return fs.createReadStream(full).pipe(res);
}

async function remove(key) {
  if (config.storageDriver === 'supabase') {
    const { error } = await supabase.storage.from(config.supabaseBucket).remove([key]);
    if (error) throw new Error(`storage_delete_failed: ${error.message}`);
    return;
  }
  await fsp.rm(path.join(config.dataDir, 'uploads', key), { force: true });
}

async function uploadBackup(buffer, key) {
  if (config.storageDriver === 'supabase') {
    const { error } = await supabase.storage
      .from(config.supabaseBackupBucket)
      .upload(key, buffer, { contentType: 'application/json', upsert: true });
    if (error) throw new Error(`backup_upload_failed: ${error.message}`);
    return `supabase://${config.supabaseBackupBucket}/${key}`;
  }
  const full = path.join(config.dataDir, 'backups', key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buffer);
  return full;
}

module.exports = {
  driver: config.storageDriver,
  buildKey,
  upload,
  sendFile,
  remove,
  createDownloadUrl,
  uploadBackup,
};
