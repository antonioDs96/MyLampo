import { existsSync } from 'node:fs';
import path from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { isHeroId, isProfileId, PUBLIC_ROOM_ID, type HeroId, type HeroInventory } from '@malampu/shared';
import compression from 'compression';
import express from 'express';
import { defaultGearFile, FileGearStore } from './gearStore';
import { jevEnabled, mountJevRoute } from './jev';
import { quipLabel, quipsEnabled } from './quips';
import { closePublicRooms, ensurePublicRoom, MalampuRoom, openPublicRooms, ROOM_NAME } from './room';

export interface AppOptions {
  port: number;
  /** Folder with the built client; skipped when it does not exist (development). */
  staticDir?: string;
  /** JSON file for hero sheets. Defaults to $MALAMPU_DATA/profiles.json or ./data/profiles.json. */
  dataFile?: string;
  quiet?: boolean;
}

export interface RunningApp {
  port: number;
  stop(): Promise<void>;
}

/** Starts the game server; when a client build is present the same port also serves the game. */
export async function startApp(options: AppOptions): Promise<RunningApp> {
  const staticDir = options.staticDir && existsSync(path.join(options.staticDir, 'index.html')) ? options.staticDir : null;

  const archive = new FileGearStore(options.dataFile ?? defaultGearFile());

  const server = new Server({
    transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 4 }),
    greet: false,
    gracefullyShutdown: false,
    express: (app) => {
      app.disable('x-powered-by');
      app.get('/healthz', (_req, res) => {
        res.json({ ok: true });
      });
      mountProfileApi(app, archive);
      mountJevRoute(app);
      if (!staticDir) return;
      app.use(compression());
      // Hashed build files never change; the page itself must always be fresh.
      app.use('/build', express.static(path.join(staticDir, 'build'), { immutable: true, maxAge: '30d' }));
      app.use(express.static(staticDir, { maxAge: '1h', setHeaders: noCacheForHtml }));
    },
  });

  // `public` is the only field joinOrCreate matches on, so a private room
  // (created without it) is never offered to someone walking into the tavern.
  openPublicRooms();
  server.define(ROOM_NAME, MalampuRoom, { archive }).filterBy(['public']);
  await server.listen(options.port);
  await ensurePublicRoom();
  if (!options.quiet) {
    console.log(`Malampu in ascolto sulla porta ${options.port}${staticDir ? ` (client da ${staticDir})` : ' (solo server di gioco)'}`);
    console.log(`Taverna pubblica ${PUBLIC_ROOM_ID} pronta.`);
    console.log(
      jevEnabled()
        ? 'Jev tattico attivo: i mostri scelgono tra le mosse legali.'
        : 'Jev tattico spento. Imposta TYPESAFE_API_KEY per le decisioni dei mostri.',
    );
    console.log(
      quipsEnabled()
        ? `Battute del modello attivo (${quipLabel()}).`
        : 'Battute scritte. Per generarle: GROQ_API_KEY, OPENAI_API_KEY, o LLM_API_KEY.',
    );
  }

  return {
    port: options.port,
    stop: async () => {
      closePublicRooms();
      await server.gracefullyShutdown(false);
    },
  };
}

function mountProfileApi(app: express.Application, archive: FileGearStore): void {
  app.use('/api/profile', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.get('/api/profile/:id', (req, res) => {
    const id = one(req.params.id);
    if (!isProfileId(id)) {
      res.status(400).json({ error: 'bad id' });
      return;
    }
    res.json({ heroes: archive.load(id) });
  });
  app.put('/api/profile/:id/:hero', express.json({ limit: '32kb' }), (req, res) => {
    const id = one(req.params.id);
    const hero = one(req.params.hero);
    if (!isProfileId(id) || !isHeroId(hero)) {
      res.status(400).json({ error: 'bad id' });
      return;
    }
    archive.save(id, hero as HeroId, req.body as HeroInventory);
    res.json({ ok: true, heroes: archive.load(id) });
  });
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function noCacheForHtml(res: express.Response, file: string): void {
  if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
}
