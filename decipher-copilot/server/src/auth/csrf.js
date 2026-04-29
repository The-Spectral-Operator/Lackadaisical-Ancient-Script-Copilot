/**
 * CSRF protection for state-mutating REST routes.
 * Uses double-submit cookie pattern + X-CSRF-Token header.
 * In local single-user mode this is a safety net, not the primary auth.
 */
import { randomBytes } from 'node:crypto';

/**
 * Generate a CSRF token string (random 32 bytes hex).
 */
export function generateCsrfToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Validate CSRF for mutating requests (POST/PUT/PATCH/DELETE).
 * Checks that the X-CSRF-Token header matches the csrf_token cookie.
 * Safe methods (GET, HEAD, OPTIONS) are exempted.
 *
 * @param {IncomingMessage} req
 * @returns {boolean} true = valid or exempt
 */
export function validateCsrf(req) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return true;

  // In local-only mode (loopback only), CSRF is defense-in-depth.
  // Accept if: header present and matches cookie, or if origin is same-origin.
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch { /* malformed origin */ }
  }

  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken) return false;

  // Parse cookies
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k?.trim(), v.join('=')?.trim()];
    }).filter(([k]) => k)
  );

  return cookies['csrf_token'] === headerToken;
}
