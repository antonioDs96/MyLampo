import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp } from './app';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 2567;
// Works both from `src/` (tsx) and from the bundled `dist/server.mjs`.
const staticDir = process.env.CLIENT_DIR ?? path.resolve(here, '../../client/dist');

const app = await startApp({ port, staticDir });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.stop().finally(() => process.exit(0));
  });
}
