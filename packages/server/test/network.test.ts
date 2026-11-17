/**
 * Real sockets: bot clients connect to a server started on a spare port, the way browsers do.
 */
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import {
  EState,
  MAX_PLAYERS,
  PUBLIC_ROOM_ID,
  HERO_IDS,
  parseLayout,
  layoutDefById,
  packCmds,
  unpackEnemy,
  type ClientMsg,
  type HeroId,
  type Layout,
  type LobbyState,
  type Profile,
  type Purse,
  type ServerMsg,
  type Snapshot,
  type WorldInfo,
} from '@malampu/shared';
import { startApp, type RunningApp } from '../src/app';
import { CHANNEL, ROOM_NAME } from '../src/room';
import { BotBrain } from './bot';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sparePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const address = srv.address();
      srv.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

class NetBot {
  id = '';
  lobby: LobbyState | null = null;
  world: WorldInfo | null = null;
  snap: Snapshot | null = null;
  layout: Layout | null = null;
  satchel: Purse | null = null;
  profile: Profile | null = null;
  snaps = 0;
  errors: string[] = [];
  closed: number | null = null;
  readonly events: string[] = [];
  private readonly brain = new BotBrain();
  private timer: ReturnType<typeof setInterval> | null = null;

  private constructor(readonly room: Room) {
    room.onMessage(CHANNEL, (msg: ServerMsg) => {
      if (msg.t === 'welcome') this.id = msg.id;
      else if (msg.t === 'lobby') this.lobby = msg.s;
      else if (msg.t === 'world') {
        this.world = msg.w;
        const def = layoutDefById(msg.w.layoutId);
        this.layout = def ? parseLayout(def) : null;
      } else if (msg.t === 'mine') this.satchel = msg.sat;
      else if (msg.t === 'profile') this.profile = msg.p;
      else if (msg.t === 'error') this.errors.push(msg.text);
      else if (msg.t === 'snap') {
        this.snap = msg.s;
        this.snaps++;
        for (const ev of msg.s.ev) this.events.push(ev.e);
      }
    });
    room.onLeave((code: number) => {
      this.closed = code;
      this.stop();
    });
  }

  static async create(client: Client, name: string): Promise<NetBot> {
    return new NetBot(await client.create(ROOM_NAME, { name }));
  }

  static async join(client: Client, code: string, name: string): Promise<NetBot> {
    return new NetBot(await client.joinById(code, { name }));
  }

  static async joinPublic(client: Client, name: string): Promise<NetBot> {
    return new NetBot(await client.joinOrCreate(ROOM_NAME, { name, public: true }));
  }

  get code(): string {
    return this.room.roomId;
  }

  send(msg: ClientMsg): void {
    this.room.send(CHANNEL, msg);
  }

  /** Plays at 60 input steps per second, sent in batches of three like the browser does. */
  play(): void {
    this.timer = setInterval(() => {
      const snap = this.snap;
      const me = snap?.p.find((p) => p.id === this.id);
      const cmds = [];
      for (let i = 0; i < 3; i++) {
        cmds.push(
          snap && me && this.world && snap.w === this.world.wid
            ? this.brain.think({ me, players: snap.p, enemies: snap.e.map(unpackEnemy), projectiles: snap.pr, layout: this.layout ?? undefined, zones: snap.z })
            : this.brain.idle(),
        );
      }
      this.send({ t: 'i', c: packCmds(cmds) });
    }, 50);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Picks a hero and confirms it on the Hero Selection screen. */
  enlist(hero: HeroId): void {
    this.send({ t: 'hero', hero });
    this.send({ t: 'ready', on: true });
  }

  async leave(): Promise<void> {
    this.stop();
    if (this.closed === null) await this.room.leave(true);
  }
}

async function until(what: string, check: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

let app: RunningApp;
let client: Client;
let base = '';

beforeAll(async () => {
  const port = await sparePort();
  app = await startApp({ port, quiet: true, dataFile: join(mkdtempSync(join(tmpdir(), 'malampu-')), 'profiles.json') });
  base = `http://127.0.0.1:${port}`;
  client = new Client(base);
});

afterAll(async () => {
  await app.stop();
});

describe('rooms', () => {
  it('creates a room with a short code that friends can join', async () => {
    const a = await NetBot.create(client, 'Anna');
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    await until('welcome', () => a.id !== '' && a.lobby !== null && a.world !== null);
    expect(a.lobby!.code).toBe(a.code);
    expect(a.lobby!.host).toBe(a.id);
    expect(a.lobby!.phase).toBe('select');
    expect(a.world!.kind).toBe('hub');

    const b = await NetBot.join(client, a.code, 'Bruno');
    await until('both in lobby', () => a.lobby!.players.length === 2 && b.lobby?.players.length === 2);
    expect(a.lobby!.players.map((p) => p.name)).toEqual(['Anna', 'Bruno']);
    expect(b.lobby!.host).toBe(a.id);

    await a.leave();
    await until('host handover', () => b.lobby!.host === b.id);
    await b.leave();
  });

  it('refuses unknown codes, and forgets a room once it is empty', async () => {
    await expect(client.joinById('ZZZZZ', { name: 'Nessuno' })).rejects.toThrow();
    const a = await NetBot.create(client, 'Anna');
    const code = a.code;
    await a.leave();
    await sleep(200);
    await expect(client.joinById(code, { name: 'Tardi' })).rejects.toThrow();
  });

  it('fills the room and turns the next player away', async () => {
    const bots = [await NetBot.create(client, 'P1')];
    for (let i = 2; i <= MAX_PLAYERS; i++) bots.push(await NetBot.join(client, bots[0]!.code, `P${i}`));
    await until('full lobby', () => bots[0]!.lobby?.players.length === MAX_PLAYERS);
    await expect(client.joinById(bots[0]!.code, { name: 'In più' })).rejects.toThrow();
    expect(bots[0]!.lobby!.players).toHaveLength(MAX_PLAYERS);
    await Promise.all(bots.map((b) => b.leave()));
  });
});

describe('hero selection', () => {
  it('spawns the whole company in the tavern only when everyone has confirmed', async () => {
    const a = await NetBot.create(client, 'Anna');
    const b = await NetBot.join(client, a.code, 'Bruno');
    await until('welcome', () => a.id !== '' && b.id !== '' && b.lobby?.players.length === 2);

    a.enlist('alexios');
    await until('first ready', () => b.lobby!.players[0]!.ready);
    await sleep(150);
    expect(a.lobby!.phase).toBe('select');
    expect(a.snap?.p ?? []).toHaveLength(0);

    // Someone else already has that hero.
    b.send({ t: 'hero', hero: 'alexios' });
    await until('refusal', () => b.errors.length > 0);
    b.enlist('jusef');
    await until('tavern', () => a.lobby!.phase === 'hub' && b.lobby!.phase === 'hub');
    await until('both spawned', () => a.snap?.p.length === 2 && b.snap?.p.length === 2);
    expect(HERO_IDS).toContain(b.lobby!.players[1]!.hero);
    expect(a.world!.title).toBe('La Taverna di Carl');

    await a.leave();
    await b.leave();
  });
});

describe('public tavern', () => {
  it('is already open, and a private room is not offered as the tavern', async () => {
    const priv = await NetBot.create(client, 'Segreta');
    await until('private lobby', () => priv.lobby !== null);
    expect(priv.lobby!.public).toBe(false);
    expect(priv.code).not.toBe(PUBLIC_ROOM_ID);

    const pub = await NetBot.joinPublic(client, 'Anna');
    await until('public lobby', () => pub.id !== '' && pub.lobby !== null && pub.world !== null);
    expect(pub.code).toBe(PUBLIC_ROOM_ID);
    expect(pub.lobby!.public).toBe(true);
    expect(pub.lobby!.code).toBe(PUBLIC_ROOM_ID);
    expect(pub.world!.kind).toBe('hub');

    const byCode = await NetBot.join(client, PUBLIC_ROOM_ID, 'Bruno');
    await until('both in the tavern', () => pub.lobby!.players.length === 2 && byCode.lobby?.players.length === 2);

    await priv.leave();
    await pub.leave();
    await byCode.leave();
  });

  it('stays open after the last player leaves, and the next company finds the hub', async () => {
    const a = await NetBot.joinPublic(client, 'Anna');
    await until('welcome', () => a.id !== '');
    a.enlist('alexios');
    await until('tavern', () => a.lobby?.phase === 'hub');
    a.send({ t: 'run', city: 'badiscar' });
    await until('expedition', () => a.world?.kind === 'run');
    await a.leave();

    const b = await NetBot.joinPublic(client, 'Bruno');
    await until('hub again', () => b.lobby?.phase !== 'run' && b.world?.kind === 'hub' && b.code === PUBLIC_ROOM_ID);
    expect(b.lobby!.players.map((p) => p.name)).toEqual(['Bruno']);
    await b.leave();

    await sleep(200);
    const c = await NetBot.join(client, PUBLIC_ROOM_ID, 'Carla');
    await until('still there', () => c.lobby !== null && c.lobby.phase !== 'run');
    await c.leave();
  });

  it('lets a newcomer step into a fight, and opens another tavern when this one is full', async () => {
    const host = await NetBot.joinPublic(client, 'Anna');
    await until('welcome', () => host.id !== '');
    host.enlist('alexios');
    await until('tavern', () => host.lobby?.phase === 'hub');
    host.send({ t: 'run', city: 'badiscar' });
    await until('expedition', () => host.world?.kind === 'run');

    const late = await NetBot.joinPublic(client, 'Nemo');
    await until('same room', () => late.code === PUBLIC_ROOM_ID && late.world?.kind === 'run');
    late.enlist('jusef');
    await until('in the fight', () => late.snap?.p.some((p) => p.id === late.id) === true);
    expect(late.lobby!.public).toBe(true);

    await late.leave();
    const fillers = [host];
    for (let i = fillers.length + 1; i <= MAX_PLAYERS; i++) {
      fillers.push(await NetBot.join(client, PUBLIC_ROOM_ID, `P${i}`));
    }
    await until('full tavern', () => host.lobby?.players.length === MAX_PLAYERS);
    await expect(client.joinById(PUBLIC_ROOM_ID, { name: 'Pieno' })).rejects.toThrow();

    const overflow = await NetBot.joinPublic(client, 'Oltre');
    await until('overflow lobby', () => overflow.lobby !== null);
    expect(overflow.code).not.toBe(PUBLIC_ROOM_ID);
    expect(overflow.lobby!.public).toBe(true);
    expect(overflow.world!.kind).toBe('hub');

    await overflow.leave();
    await sleep(300);
    await expect(client.joinById(overflow.code, { name: 'Tardi' })).rejects.toThrow();

    await Promise.all(fillers.map((b) => b.leave()));
    const back = await NetBot.joinPublic(client, 'Dopo');
    await until('anchor again', () => back.code === PUBLIC_ROOM_ID && back.lobby !== null && back.lobby.phase !== 'run');
    await back.leave();
  });
});

describe('an expedition over the network', () => {
  it('streams snapshots at 20 Hz, applies inputs and lets a party fight together', async () => {
    const heroes: HeroId[] = ['alexios', 'jusef', 'rycard'];
    const bots = [await NetBot.create(client, 'Uno')];
    bots.push(await NetBot.join(client, bots[0]!.code, 'Due'));
    bots.push(await NetBot.join(client, bots[0]!.code, 'Tre'));
    await until('welcome', () => bots.every((b) => b.id !== ''));
    bots.forEach((b, i) => b.enlist(heroes[i]!));
    await until('tavern', () => bots.every((b) => b.lobby?.phase === 'hub'));

    // Only the host may open a route on the Map Table.
    bots[1]!.send({ t: 'run', city: 'badiscar' });
    await sleep(150);
    expect(bots[0]!.lobby!.phase).toBe('hub');
    bots[0]!.send({ t: 'run', city: 'badiscar' });
    await until('expedition world', () => bots.every((b) => b.world?.kind === 'run'));
    expect(bots[0]!.lobby!.run!.label).toBe('Badiscar · Ambiente 1 di 3');
    expect(bots[0]!.lobby!.run!.company).toBeCloseTo(0.2);

    for (const b of bots) b.play();
    // The last hub snapshot may still be the latest one: it must not count as the expedition.
    const inRun = (b: NetBot) => b.snap !== null && b.world !== null && b.snap.w === b.world.wid;
    await until('expedition snapshots', () => bots.every(inRun));
    const first = bots[0]!.snaps;
    const t0 = Date.now();
    await sleep(2000);
    const rate = (bots[0]!.snaps - first) / ((Date.now() - t0) / 1000);
    expect(rate).toBeGreaterThan(15);
    expect(rate).toBeLessThan(25);
    expect(bots[0]!.snap!.e.length).toBeGreaterThan(0);

    await until('a kill', () => bots[0]!.events.includes('hit') && bots[0]!.snap!.e.some((e) => unpackEnemy(e).state === EState.Dead), 40000);
    const snap = bots[0]!.snap!;
    expect(snap.p).toHaveLength(3);
    for (const b of bots) expect(snap.ack[b.id]).toBeGreaterThan(0);
    // Everyone sees the same world, and nobody sees the loot of the others.
    await sleep(120);
    expect(new Set(bots.map((b) => b.snap!.left)).size).toBeLessThanOrEqual(2);
    expect(bots[0]!.events).not.toContain('drop');
    expect(bots[0]!.events).not.toContain('take');

    // A player dropping out mid-fight does not stop the others.
    await bots[2]!.leave();
    await until('two left', () => bots[0]!.snap!.p.length === 2);
    const mark = bots[0]!.snaps;
    await until('still running', () => bots[0]!.snaps > mark + 10);
    await Promise.all(bots.map((b) => b.leave()));
  }, 80000);
});

describe('profiles over the network', () => {
  it('remembers gems and purchases between two visits', async () => {
    const id = '6f1c2f0a-3c1e-4b5d-9a7e-2f6b8c9d0e1f';
    const put = await fetch(`${base}/api/profile/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { gems: 500, threads: 40 } }),
    });
    expect(put.ok).toBe(true);

    const a = await NetBot.create(client, 'Anna');
    await until('welcome', () => a.id !== '');
    a.send({ t: 'profile', id });
    await until('profile', () => a.profile?.gems === 500);
    a.enlist('alexios');
    await until('tavern', () => a.lobby?.phase === 'hub');
    a.send({ t: 'tree', op: 'buy', slot: 'e', path: 'potenza' });
    await until('node bought', () => (a.profile?.gems ?? 500) < 500);
    a.send({ t: 'cosm', op: 'buy', id: 'pal_abisso' });
    await until('palette bought', () => a.profile?.owned.includes('pal_abisso') === true);
    const gems = a.profile!.gems;
    await a.leave();
    await sleep(200);

    const got = (await (await fetch(`${base}/api/profile/${id}`)).json()) as { profile: Profile };
    expect(got.profile.gems).toBe(gems);
    expect(got.profile.threads).toBe(40 - 12);
    expect(got.profile.owned).toContain('pal_abisso');
    expect(got.profile.trees.alexios).toBeDefined();
  });
});
