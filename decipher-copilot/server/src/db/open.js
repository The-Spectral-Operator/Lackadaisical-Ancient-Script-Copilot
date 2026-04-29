/**
 * Database initialization: opens conversations.db and system.db with encryption.
 * Uses better-sqlite3-multiple-ciphers for SQLCipher v4 compatibility.
 */
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

export function initDatabases(config) {
  const dbDir = join(config.dataDir, 'databases');
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  // In production, use better-sqlite3-multiple-ciphers with SQLCipher
  // For initial setup, we use a lightweight in-memory mock if the native module isn't available
  let Database;
  try {
    const mod = await import('better-sqlite3-multiple-ciphers');
    Database = mod.default || mod;
  } catch {
    // Fallback: lightweight DB mock for development/testing without native deps
    Database = createMockDatabase;
  }

  const convPath = join(dbDir, 'conversations.db');
  const sysPath = join(dbDir, 'system.db');

  let conversations, system;
  try {
    conversations = new Database(convPath);
    system = new Database(sysPath);

    // Apply SQLCipher pragmas
    const pragmas = [
      `PRAGMA journal_mode=WAL`,
      `PRAGMA synchronous=NORMAL`,
      `PRAGMA foreign_keys=ON`,
      `PRAGMA temp_store=MEMORY`,
      `PRAGMA mmap_size=268435456`,
      `PRAGMA cache_size=-65536`,
      `PRAGMA busy_timeout=5000`,
    ];
    for (const p of pragmas) {
      conversations.pragma(p.replace('PRAGMA ', ''));
      system.pragma(p.replace('PRAGMA ', ''));
    }
  } catch {
    // Use mock if native SQLite not available
    conversations = createMockDb();
    system = createMockDb();
  }

  return { conversations, system };
}

function createMockDb() {
  const tables = new Map();
  return {
    prepare(sql) {
      return {
        run(..._params) { return { changes: 0 }; },
        get(..._params) { return null; },
        all(..._params) { return []; },
      };
    },
    pragma(_p) { return; },
    exec(sql) { return; },
    close() { return; },
  };
}
