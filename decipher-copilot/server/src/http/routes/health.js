import { ollamaFetch } from '../ollama/client.js';

export function createHealthRoute(db, config, logger) {
  return async (_req, res) => {
    let ollamaStatus = { reachable: false, version: null };
    try {
      const r = await fetch(`${config.ollamaHost}/api/version`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        ollamaStatus = { reachable: true, version: data.version };
      }
    } catch { /* ollama not running */ }

    const result = {
      status: ollamaStatus.reachable ? 'ok' : 'degraded',
      ollama: ollamaStatus,
      db: { ok: true },
      defaultModel: config.defaultModel,
      hotswap: config.hotswap.enabled,
    };
    res.writeHead(200);
    res.end(JSON.stringify(result));
  };
}
