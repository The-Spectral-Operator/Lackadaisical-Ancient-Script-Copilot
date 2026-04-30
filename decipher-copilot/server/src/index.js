import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { config } from './config.js';
import { createLogger } from './logger.js';
import { createRouter } from './http/router.js';
import { createWsHub } from './ws/hub.js';
import { initDatabases } from './db/open.js';
import { runMigrations } from './db/migrate.js';
import { initAuth } from './auth/token.js';
import { seedDatasetsToDb } from './core/datasetImporter.js';

const logger = createLogger();

async function main() {
  logger.info({ version: '1.0.0' }, 'decipher-server starting');

  // Ensure data directories exist
  for (const d of ['databases', 'attachments', 'corpora', 'lexicons']) {
    const p = join(config.dataDir, d);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }

  // Initialize databases + run migrations
  const db = initDatabases(config);
  runMigrations(db, config);
  logger.info('databases initialized');

  // Auth token (first-run generates one)
  try {
    const token = await initAuth(db, config.dataDir, logger);
    if (token) {
      console.log(`\n  AUTH TOKEN (save this): ${token}`);
      console.log(`  Stored at: ${join(config.dataDir, '.token')}\n`);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'auth init warning (non-fatal)');
  }

  // Seed datasets into system DB on startup (idempotent)
  if (existsSync(config.datasetsDir)) {
    try {
      const seeded = seedDatasetsToDb(db, config.datasetsDir, logger);
      logger.info({ scripts: seeded.scripts, lexicons: seeded.lexicons, entries: seeded.entries }, 'datasets seeded');
    } catch (err) {
      logger.warn({ err: err.message }, 'dataset seed warning (non-fatal)');
    }
  } else {
    logger.warn({ datasetsDir: config.datasetsDir }, 'datasets directory not found');
  }

  // HTTP server
  const router = createRouter(db, config, logger);
  const server = createServer(router);

  // WebSocket hub
  const wsHub = createWsHub(server, db, config, logger);

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    wsHub.close();
    server.close(() => {
      try { db.conversations.close(); } catch {}
      try { db.system.close(); } catch {}
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port }, 'HTTP listening');
    console.log(`
  ╔══════════════════════════════════════════╗
  ║  Ancient Script Decipherment Copilot     ║
  ║  Alpha Release v1.0.0                    ║
  ╠══════════════════════════════════════════╣
  ║  UI:     http://${config.host}:${config.port}          ║
  ║  WS:     ws://${config.host}:${config.port}/ws         ║
  ║  Ollama: ${config.ollamaHost}    ║
  ║  Model:  ${config.defaultModel} (abliterated) ║
  ╚══════════════════════════════════════════╝
`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
