import { existsSync } from 'node:fs';
import path from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import compression from 'compression';
import express from 'express';
import { MalampuRoom, ROOM_NAME } from './room';

export interface AppOptions {
  port: number;
  /** Folder with the built client; skipped when it does not exist (development). */
  staticDir?: string;
  quiet?: boolean;
}

export interface RunningApp {
  port: number;
  stop(): Promise<void>;
}

/** Starts the game server; when a client build is present the same port also serves the game. */
export async function startApp(options: AppOptions): Promise<RunningApp> {
  const staticDir = options.staticDir && existsSync(path.join(options.staticDir, 'index.html')) ? options.staticDir : null;

  const server = new Server({
    transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 4 }),
    greet: false,
    gracefullyShutdown: false,
    express: (app) => {
      app.disable('x-powered-by');
      app.get('/healthz', (_req, res) => {
        res.json({ ok: true });
      });
      if (!staticDir) return;
      app.use(compression());
      // Hashed build files never change; the page itself must always be fresh.
      app.use('/build', express.static(path.join(staticDir, 'build'), { immutable: true, maxAge: '30d' }));
      app.use(express.static(staticDir, { maxAge: '1h', setHeaders: noCacheForHtml }));
    },
  });

  server.define(ROOM_NAME, MalampuRoom);
  await server.listen(options.port);
  if (!options.quiet) {
    console.log(`Malampu in ascolto sulla porta ${options.port}${staticDir ? ` (client da ${staticDir})` : ' (solo server di gioco)'}`);
  }

  return {
    port: options.port,
    stop: () => server.gracefullyShutdown(false),
  };
}

function noCacheForHtml(res: express.Response, file: string): void {
  if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
}
