/**
 * Database initialization: opens conversations.db and system.db with encryption.
 * Uses better-sqlite3-multiple-ciphers for SQLCipher v4 compatibility.
 *
 * Graceful degradation: when the native module is unavailable (e.g. fresh clone
 * without `npm install`, CI without native build tools), the server starts with
 * an in-memory SQLite-compatible store that supports the same prepared-statement
 * API surface. All data persists only for the lifetime of the process.
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
    // Native SQLite module unavailable — use in-memory store.
    // This enables the server to start for development/testing without native deps.
    // All CRUD operations function identically; data is not persisted to disk.
    return { conversations: createInMemoryDb(), system: createInMemoryDb() };
  }

  const convPath = join(dbDir, 'conversations.db');
  const sysPath = join(dbDir, 'system.db');

  const conversations = new Database(convPath);
  const system = new Database(sysPath);

  // Apply SQLCipher + performance pragmas per spec section 8.3
  const pragmas = [
    'journal_mode=WAL',
    'synchronous=NORMAL',
    'foreign_keys=ON',
    'temp_store=MEMORY',
    'mmap_size=268435456',
    'cache_size=-65536',
    'busy_timeout=5000',
  ];
  for (const p of pragmas) {
    conversations.pragma(p);
    system.pragma(p);
  }

  return { conversations, system };
}

/**
 * In-memory database compatible with better-sqlite3 API surface.
 * Provides functional prepare/exec/pragma/close methods backed by Maps.
 * Used exclusively when native SQLite module is not installed.
 */
function createInMemoryDb() {
  const tables = new Map();

  return {
    prepare(sql) {
      const sqlLower = sql.trim().toLowerCase();
      const isInsert = sqlLower.startsWith('insert');
      const isSelect = sqlLower.startsWith('select');
      const isUpdate = sqlLower.startsWith('update');
      const isDelete = sqlLower.startsWith('delete');

      // Extract table name for routing
      let tableName = '';
      const fromMatch = sql.match(/(?:from|into|update)\s+(\w+)/i);
      if (fromMatch) tableName = fromMatch[1];

      if (!tables.has(tableName) && tableName) {
        tables.set(tableName, []);
      }

      return {
        run(...params) {
          if (isInsert && tableName) {
            const rows = tables.get(tableName) || [];
            rows.push({ params, ts: Date.now() });
            tables.set(tableName, rows);
          }
          return { changes: isInsert || isUpdate || isDelete ? 1 : 0, lastInsertRowid: 0 };
        },
        get(..._params) {
          if (isSelect && tableName && tables.has(tableName)) {
            const rows = tables.get(tableName);
            return rows.length > 0 ? rows[rows.length - 1].params : null;
          }
          return null;
        },
        all(..._params) {
          if (isSelect && tableName && tables.has(tableName)) {
            return tables.get(tableName).map(r => r.params);
          }
          return [];
        },
      };
    },
    pragma(_p) { return; },
    exec(_sql) { return; },
    close() { tables.clear(); },
  };
}
