export function createAttachmentsRoute(db, config, logger) {
  return {
    async upload(req, res) {
      // Simplified: handle multipart upload
      res.writeHead(501);
      res.end(JSON.stringify({ error: 'not_implemented', message: 'File upload coming soon' }));
    },

    get(_req, res, path) {
      const id = path.split('/').pop();
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not_found', id }));
    },
  };
}
