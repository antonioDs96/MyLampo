/**
 * Real sockets: bot clients connect to a server started on a spare port, the way browsers do.
 */
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import {
  EState,
  MAX_PLAYERS,
  PUBLIC_ROOM_ID,
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

  it('fills the room and turns the next player away', async () => {
    const bots = [await NetBot.create(client, 'P1')];
    for (let i = 2; i <= MAX_PLAYERS; i++) bots.push(await NetBot.join(client, bots[0]!.code, `P${i}`));
    await until('full lobby', () => bots[0]!.lobby?.players.length === MAX_PLAYERS);
    await expect(client.joinById(bots[0]!.code, { name: 'In più' })).rejects.toThrow();
    expect(bots[0]!.lobby!.players).toHaveLength(MAX_PLAYERS);
    await Promise.all(bots.map((b) => b.leave()));
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
    a.send({ t: 'hero', hero: 'alexios' });
    await until('hero', () => a.lobby?.players.some((p) => p.hero === 'alexios') === true);
    a.send({ t: 'start' });
    await until('mission', () => a.world?.kind === 'mission');
    await a.leave();

    const b = await NetBot.joinPublic(client, 'Bruno');
    await until('hub again', () => b.lobby?.phase === 'hub' && b.world?.kind === 'hub' && b.code === PUBLIC_ROOM_ID);
    expect(b.lobby!.players.map((p) => p.name)).toEqual(['Bruno']);
    await b.leave();

    await sleep(200);
    const c = await NetBot.join(client, PUBLIC_ROOM_ID, 'Carla');
    await until('still there', () => c.lobby?.phase === 'hub');
    await c.leave();
  });

  it('lets a newcomer step into a fight, and opens another tavern when this one is full', async () => {
    const host = await NetBot.joinPublic(client, 'Anna');
    await until('welcome', () => host.id !== '');
    host.send({ t: 'hero', hero: 'alexios' });
    await until('hero', () => host.lobby?.players[0]?.hero === 'alexios');
    host.send({ t: 'start' });
    await until('mission', () => host.world?.kind === 'mission');

    const late = await NetBot.joinPublic(client, 'Nemo');
    await until('same room', () => late.code === PUBLIC_ROOM_ID && late.world?.kind === 'mission');
    late.send({ t: 'hero', hero: 'jusef' });
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
    await until('anchor again', () => back.code === PUBLIC_ROOM_ID && back.lobby?.phase === 'hub');
    await back.leave();
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
