/**
 * SQLCipher key derivation via libsodium-wrappers (Argon2id).
 * Derives a 256-bit key from passphrase + per-install salt.
 * Salt is stored in data/databases/.salt (created on first run, mode 0600).
 *
 * Reference: Section 8.3 of AncientScriptCopilot.md build spec
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

let sodium = null;

async function getSodium() {
  if (sodium) return sodium;
  try {
    const mod = await import('libsodium-wrappers');
    await mod.default.ready;
    sodium = mod.default;
  } catch {
    sodium = null;
  }
  return sodium;
}

/**
 * Derive SQLCipher key hex from passphrase + persisted salt.
 * Falls back to SHA-256(passphrase) if libsodium unavailable.
 *
 * @param {string} passphrase
 * @param {string} dbDir - path to data/databases directory
 * @returns {Promise<string>} 64-char hex key
 */
export async function deriveSQLCipherKey(passphrase, dbDir) {
  const saltPath = join(dbDir, '.salt');

  // Load or generate per-install salt (32 bytes)
  let salt;
  if (existsSync(saltPath)) {
    salt = readFileSync(saltPath);
    if (salt.length !== 32) {
      salt = randomBytes(32);
      writeFileSync(saltPath, salt, { mode: 0o600 });
    }
  } else {
    salt = randomBytes(32);
    writeFileSync(saltPath, salt, { mode: 0o600 });
    try { chmodSync(saltPath, 0o600); } catch { /* non-Unix */ }
  }

  const sod = await getSodium();
  if (sod) {
    // Argon2id: OPSLIMIT_MODERATE = 3, MEMLIMIT_MODERATE = 268435456 (256 MiB)
    // Output: 32 bytes = 256-bit key
    const passBuf = Buffer.from(passphrase, 'utf-8');
    const keyBytes = sod.crypto_pwhash(
      32,
      passBuf,
      salt,
      sod.crypto_pwhash_OPSLIMIT_MODERATE,
      sod.crypto_pwhash_MEMLIMIT_MODERATE,
      sod.crypto_pwhash_ALG_ARGON2ID13,
    );
    return Buffer.from(keyBytes).toString('hex');
  }

  // Fallback (no Argon2id): PBKDF2-SHA256 with 100k iterations
  return new Promise((resolve, reject) => {
    import('node:crypto').then(({ pbkdf2 }) => {
      pbkdf2(passphrase, salt, 100000, 32, 'sha256', (err, key) => {
        if (err) reject(err);
        else resolve(key.toString('hex'));
      });
    });
  });
}

/**
 * SHA-256 a string (for token hashing)
 */
export function sha256hex(s) {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}
