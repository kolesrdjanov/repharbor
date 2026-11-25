import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'express';
import { resolve } from 'node:path';

export function mountApiDocs(app: NestExpressApplication) {
  const assets = resolve(require.resolve('swagger-ui-dist/package.json'), '..');
  const specification = resolve(__dirname, '../../../docs/technical/openapi.yaml');
  const server = app.getHttpAdapter().getInstance();
  server.get('/docs', (_request: unknown, response: Response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
    response.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RepHarbor API</title><link rel="stylesheet" href="/docs/swagger-ui.css">
</head>
<body><main id="swagger-ui"></main>
<script src="/docs/swagger-ui-bundle.js"></script><script src="/docs/init.js"></script>
</body>
</html>`);
  });
  server.get('/docs/openapi.yaml', (_request: unknown, response: Response) => {
    response.type('application/yaml').sendFile(specification);
  });
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
    server.get(`/docs/${file}`, (_request: unknown, response: Response) => response.sendFile(file, { root: assets, dotfiles: 'allow' }));
  }
  server.get('/docs/init.js', (_request: unknown, response: Response) => {
    response.type('js').send(`SwaggerUIBundle({
      dom_id: '#swagger-ui', url: '/docs/openapi.yaml', supportedSubmitMethods: [],
      validatorUrl: null, deepLinking: true
    });`);
  });
}
