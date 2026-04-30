import { parseBody } from '../middleware.js';

export function createSettingsRoute(db, config, logger) {
  return {
    get(_req, res) {
      const settings = {
        ollamaHost: config.ollamaHost,
        defaultModel: config.defaultModel,
        hotswap: config.hotswap,
        abliteration: { enabled: config.abliteration.enabled },
        modelOptions: config.modelOptions,
        recommendedModels: config.recommendedModels,
        blockedModels: config.blockedModels,
      };
      res.writeHead(200);
      res.end(JSON.stringify(settings));
    },

    async update(req, res) {
      const body = await parseBody(req);
      // In-memory only for now (persisted to DB in production)
      if (body.defaultModel) config.defaultModel = body.defaultModel;
      if (body.ollamaHost) config.ollamaHost = body.ollamaHost;
      if (body.modelOptions) Object.assign(config.modelOptions, body.modelOptions);
      if (body.abliteration !== undefined) config.abliteration.enabled = !!body.abliteration;
      res.writeHead(200);
      res.end(JSON.stringify({ updated: true }));
    },
  };
}
