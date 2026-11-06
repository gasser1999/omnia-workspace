'use strict';
require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

const config = {
  isProd,
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: process.env.COOKIE_NAME || 'omnia_session',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  storageDriver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(), // 'supabase' | 'local'
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'workspace-files',
  supabaseBackupBucket: process.env.SUPABASE_BACKUP_BUCKET || 'workspace-backups',
  dataDir: process.env.DATA_DIR || require('path').join(process.cwd(), 'data'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024),
  maxWorkspaceBytes: Number(process.env.MAX_WORKSPACE_BYTES || 5 * 1024 * 1024),
  backupSecret: process.env.BACKUP_SECRET || '',
  allowedOrigin: process.env.ALLOWED_ORIGIN || '',
  trustProxy: process.env.TRUST_PROXY === 'true' || isProd,
};

if (config.storageDriver === 'supabase') {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error('STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
}

module.exports = config;
