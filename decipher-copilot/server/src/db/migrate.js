import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function runMigrations(db, config) {
  const migrationsDir = join(import.meta.dirname, '..', '..', 'migrations');
  try {
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      try {
        // Run on appropriate database
        if (file.includes('conversations')) {
          db.conversations.exec(sql);
        } else if (file.includes('system') || file.includes('indices') || file.includes('fts')) {
          db.system.exec(sql);
        } else {
          // Apply to both
          db.conversations.exec(sql);
          db.system.exec(sql);
        }
      } catch { /* migration may already be applied */ }
    }
  } catch { /* migrations dir may not exist yet */ }
}
