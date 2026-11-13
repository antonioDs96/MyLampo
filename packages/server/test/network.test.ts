/**
 * Real sockets: bot clients connect to a server started on a spare port, the way browsers do.
 */
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import {
  EState,
  MAX_PLAYERS,
  HERO_IDS,
  packCmds,
  unpackEnemy,
  type ClientMsg,
  type HeroId,
  type LobbyState,
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
      else if (msg.t === 'world') this.world = msg.w;
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
            ? this.brain.think({ me, players: snap.p, enemies: snap.e.map(unpackEnemy), projectiles: snap.pr })
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

beforeAll(async () => {
  const port = await sparePort();
  app = await startApp({ port, quiet: true });
  client = new Client(`http://127.0.0.1:${port}`);
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

  it('holds eight players and turns the ninth away', async () => {
    const bots = [await NetBot.create(client, 'P1')];
    for (let i = 2; i <= MAX_PLAYERS; i++) bots.push(await NetBot.join(client, bots[0]!.code, `P${i}`));
    await until('full lobby', () => bots[0]!.lobby?.players.length === MAX_PLAYERS);
    await expect(client.joinById(bots[0]!.code, { name: 'P9' })).rejects.toThrow();
    expect(bots[0]!.lobby!.players).toHaveLength(MAX_PLAYERS);
    await Promise.all(bots.map((b) => b.leave()));
  });
});

describe('a mission over the network', () => {
  it('streams snapshots at 20 Hz, applies inputs and lets a party fight together', async () => {
    const heroes: HeroId[] = ['alexios', 'jusef', 'rycard'];
    const bots = [await NetBot.create(client, 'Uno')];
    bots.push(await NetBot.join(client, bots[0]!.code, 'Due'));
    bots.push(await NetBot.join(client, bots[0]!.code, 'Tre'));
    await until('welcome', () => bots.every((b) => b.id !== ''));
    bots.forEach((b, i) => b.send({ t: 'hero', hero: heroes[i]! }));
    await until('heroes', () => bots[2]!.lobby?.players.every((p) => p.hero !== '') === true);

    // Someone else already has that hero.
    bots[1]!.send({ t: 'hero', hero: 'alexios' });
    await until('refusal', () => bots[1]!.errors.length > 0);
    expect(HERO_IDS).toContain(bots[1]!.lobby!.players[1]!.hero);
    expect(bots[1]!.lobby!.players[1]!.hero).toBe('jusef');

    // Only the host may start.
    bots[1]!.send({ t: 'start' });
    await sleep(150);
    expect(bots[0]!.lobby!.phase).toBe('hub');
    bots[0]!.send({ t: 'start' });
    await until('mission world', () => bots.every((b) => b.world?.kind === 'mission'));

    for (const b of bots) b.play();
    // The last hub snapshot may still be the latest one: it must not count as the mission.
    const inMission = (b: NetBot) => b.snap !== null && b.world !== null && b.snap.w === b.world.wid;
    await until('mission snapshots', () => bots.every(inMission));
    const first = bots[0]!.snaps;
    const t0 = Date.now();
    await sleep(2000);
    const rate = (bots[0]!.snaps - first) / ((Date.now() - t0) / 1000);
    expect(rate).toBeGreaterThan(15);
    expect(rate).toBeLessThan(25);
    await until('first wave', () => inMission(bots[0]!) && bots[0]!.snap!.e.length > 0, 15000);

    await until('a kill', () => bots[0]!.events.includes('hit') && bots[0]!.snap!.e.some((e) => unpackEnemy(e).state === EState.Dead), 30000);
    const snap = bots[0]!.snap!;
    expect(snap.p).toHaveLength(3);
    for (const b of bots) expect(snap.ack[b.id]).toBeGreaterThan(0);
    // Everyone sees the same world.
    await sleep(120);
    const waves = bots.map((b) => b.snap!.wave.n);
    expect(new Set(waves).size).toBe(1);

    // A player dropping out mid-fight does not stop the others.
    await bots[2]!.leave();
    await until('two left', () => bots[0]!.snap!.p.length === 2);
    const mark = bots[0]!.snaps;
    await until('still running', () => bots[0]!.snaps > mark + 10);
    await Promise.all(bots.map((b) => b.leave()));
  }, 60000);
});
