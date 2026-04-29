/**
 * Local bearer token auth.
 * Single-user: token generated at first run, stored hashed in system.db,
 * plaintext written to data/.token (mode 0600).
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { sha256hex } from '../db/sqlcipher.js';

/**
 * Initialize auth: ensure a token exists in DB + file.
 * Returns the plaintext token (only returned on first-run creation).
 */
export async function initAuth(db, dataDir, logger) {
  const tokenFile = join(dataDir, '.token');

  // Check if token already exists in DB
  const existing = db.system.prepare('SELECT token_hash, label FROM auth_tokens LIMIT 1').get();
  if (existing) {
    // Token already provisioned — just verify file exists
    if (!existsSync(tokenFile)) {
      logger.warn('Auth token file missing (.token). Manual token required for REST API.');
    }
    return null; // don't re-expose existing token
  }

  // First run: generate token
  const token = randomBytes(32).toString('hex');
  const hash = sha256hex(token);
  const now = Date.now();

  db.system.prepare('INSERT INTO auth_tokens (token_hash, label, created_at) VALUES (?,?,?)')
    .run(hash, 'default', now);

  writeFileSync(tokenFile, token, { mode: 0o600 });
  try { chmodSync(tokenFile, 0o600); } catch { /* Windows */ }

  logger.info({ tokenFile }, 'Auth token generated. Keep this file secure.');
  return token;
}

/**
 * Validate a bearer token from Authorization header.
 * Returns true if valid (or if auth is disabled for local-only mode).
 */
export function validateToken(db, authHeader, config) {
  // In local-only single-user mode, we accept any request from 127.0.0.1
  // The token check is an additional security layer
  if (!authHeader) return false;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const token = match[1].trim();
  const hash = sha256hex(token);

  const row = db.system.prepare('SELECT id, last_used FROM auth_tokens WHERE token_hash=?').get(hash);
  if (!row) return false;

  // Update last_used
  db.system.prepare('UPDATE auth_tokens SET last_used=? WHERE token_hash=?').run(Date.now(), hash);
  return true;
}
