import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { config } from './config.js';
import { createLogger } from './logger.js';
import { createRouter } from './http/router.js';
import { createWsHub } from './ws/hub.js';
import { initDatabases } from './db/open.js';
import { runMigrations } from './db/migrate.js';

const logger = createLogger();

async function main() {
  logger.info({ version: '1.0.0' }, 'decipher-server starting');

  // Ensure data directories exist
  const dirs = ['databases', 'attachments', 'corpora', 'lexicons'];
  for (const d of dirs) {
    const p = join(config.dataDir, d);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }

  // Initialize databases
  const db = initDatabases(config);
  runMigrations(db, config);
  logger.info('databases initialized');

  // Create HTTP server
  const router = createRouter(db, config, logger);
  const server = createServer(router);

  // Create WebSocket hub
  const wsHub = createWsHub(server, db, config, logger);

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    wsHub.close();
    server.close(() => {
      db.conversations.close();
      db.system.close();
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start listening
  server.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port }, 'HTTP server listening');
    logger.info({ wsPort: config.wsPort }, 'WebSocket server ready');
    console.log(`\n  Ancient Script Decipherment Copilot`);
    console.log(`  ====================================`);
    console.log(`  UI:   http://${config.host}:${config.port}`);
    console.log(`  WS:   ws://${config.host}:${config.port}/ws`);
    console.log(`  Ollama: ${config.ollamaHost}`);
    console.log(`  Model: ${config.defaultModel} (abliterated - no refusal)`);
    console.log(`  Data:  ${resolve(config.dataDir)}\n`);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  console.error('Fatal:', err);
  process.exit(1);
});
