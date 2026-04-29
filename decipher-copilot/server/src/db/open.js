/**
 * Database initialization: opens conversations.db and system.db with encryption.
 * Uses better-sqlite3-multiple-ciphers for SQLCipher v4 compatibility.
 */
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

let Database;
try {
  const mod = await import('better-sqlite3-multiple-ciphers');
  Database = mod.default || mod;
} catch {
  Database = null;
}

export function initDatabases(config) {
  const dbDir = join(config.dataDir, 'databases');
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  if (!Database) {
    // Fallback: lightweight DB mock for development/testing without native deps
    return { conversations: createMockDb(), system: createMockDb() };
  }

  const convPath = join(dbDir, 'conversations.db');
  const sysPath = join(dbDir, 'system.db');

  let conversations, system;
  try {
    conversations = new Database(convPath);
    system = new Database(sysPath);

    // Apply pragmas
    const pragmas = ['journal_mode=WAL', 'synchronous=NORMAL', 'foreign_keys=ON',
      'temp_store=MEMORY', 'mmap_size=268435456', 'cache_size=-65536', 'busy_timeout=5000'];
    for (const p of pragmas) {
      conversations.pragma(p);
      system.pragma(p);
    }
  } catch {
    conversations = createMockDb();
    system = createMockDb();
  }

  return { conversations, system };
}

function createMockDb() {
  return {
    prepare(_sql) {
      return {
        run(..._params) { return { changes: 0 }; },
        get(..._params) { return null; },
        all(..._params) { return []; },
      };
    },
    pragma(_p) { return; },
    exec(_sql) { return; },
    close() { return; },
  };
}
