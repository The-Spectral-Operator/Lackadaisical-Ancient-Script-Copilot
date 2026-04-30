import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function createLogger(opts = {}) {
  const level = opts.level || 'info';
  const levels = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
  const minLevel = levels[level] || 30;

  const logDir = opts.logDir || './logs';
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const stream = createWriteStream(join(logDir, 'decipher-server.log'), { flags: 'a' });

  function log(lvl, obj, msg) {
    if (levels[lvl] < minLevel) return;
    const entry = {
      level: lvl,
      time: new Date().toISOString(),
      ...(typeof obj === 'string' ? { msg: obj } : { ...obj, msg }),
    };
    const line = JSON.stringify(entry) + '\n';
    stream.write(line);
    if (levels[lvl] >= levels.warn) process.stderr.write(`[${lvl.toUpperCase()}] ${msg || obj}\n`);
  }

  return {
    trace: (obj, msg) => log('trace', obj, msg),
    debug: (obj, msg) => log('debug', obj, msg),
    info: (obj, msg) => log('info', obj, msg),
    warn: (obj, msg) => log('warn', obj, msg),
    error: (obj, msg) => log('error', obj, msg),
    fatal: (obj, msg) => log('fatal', obj, msg),
  };
}
