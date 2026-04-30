import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve webui dir reliably: server/src/http/static.js → ../../../webui
const _thisDir = dirname(fileURLToPath(import.meta.url));
const _webuiDir = resolve(_thisDir, '..', '..', '..', 'webui');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

// CSP for HTML documents — all same-origin, ws/http for Ollama
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export function serveStatic(req, res, config, logger) {
  const webuiDir = _webuiDir;

  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;

  // Security: prevent path traversal
  const fullPath = resolve(join(webuiDir, filePath));
  if (!fullPath.startsWith(webuiDir + '/') && fullPath !== webuiDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const exists = existsSync(fullPath);
  const isFile = exists && statSync(fullPath).isFile();

  if (!isFile) {
    // SPA fallback
    const indexPath = join(webuiDir, 'index.html');
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': CSP,
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    } else {
      res.writeHead(404); res.end('Not Found');
    }
    return;
  }

  const ext = extname(fullPath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const stat = statSync(fullPath);
  const isHtml = ext === '.html';
  const isFont = ['.ttf', '.woff', '.woff2', '.otf'].includes(ext);

  const headers = {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': isHtml ? 'no-cache' : isFont ? 'public, max-age=86400' : 'public, max-age=31536000, immutable',
  };
  if (isHtml) headers['Content-Security-Policy'] = CSP;

  res.writeHead(200, headers);
  createReadStream(fullPath).pipe(res);
}
