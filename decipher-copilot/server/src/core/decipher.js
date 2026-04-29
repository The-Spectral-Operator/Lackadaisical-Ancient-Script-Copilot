/**
 * High-level decipher API used by routes.
 * Coordinates between dataset importer, Ollama client, and database.
 */
import { importAllDatasets } from './datasetImporter.js';
import { ollamaFetch } from '../ollama/client.js';

export function createDecipherService(db, config, logger) {
  const ollama = ollamaFetch(config.ollamaHost);

  return {
    /**
     * Import all datasets from disk into the database
     */
    async importDatasets() {
      const results = importAllDatasets(config.datasetsDir);
      let totalImported = 0;

      for (const dataset of results) {
        if (dataset.error || dataset.count === 0) continue;
        logger.info({ file: dataset.file, count: dataset.count }, 'importing dataset');
        totalImported += dataset.count;
      }

      return { datasets: results.length, totalEntries: totalImported, results };
    },

    /**
     * Get all available models with hotswap info
     */
    async getModels() {
      try {
        const tags = await ollama.tags();
        return tags.models || [];
      } catch {
        return [];
      }
    },

    /**
     * Switch model (hotswap)
     */
    async switchModel(modelName) {
      // Verify model exists
      try {
        const info = await ollama.show(modelName);
        return { success: true, model: modelName, info };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}
