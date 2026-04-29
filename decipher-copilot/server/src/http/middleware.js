/**
 * HTTP middleware: security headers, CORS, body parsing.
 * COEP/COOP set for local security. Fonts served same-origin with CORP header in static.js.
 */

export function applyMiddleware(req, res, config) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // COEP require-corp — all sub-resources served same-origin get CORP header in static.js
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // CORS: lock to localhost origins only
  const origin = req.headers.origin;
  const allowed = config.corsOrigins || ['http://127.0.0.1:7340', 'http://localhost:7340'];
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return false;
  }

  return true;
}

export function parseBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve(body); }
    });
    req.on('error', reject);
  });
}
