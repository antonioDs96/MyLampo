/**
 * Drives a GameHost with bot players at full speed (no real clock, no sockets), the same
 * way the room does: three input steps per bot for every 50 ms host tick.
 */
import {
  GameHost,
  TICK_HZ,
  WORLD_HZ,
  packCmds,
  unpackEnemy,
  type HeroId,
  type LobbyState,
  type ServerMsg,
  type Snapshot,
  type WorldInfo,
} from '@malampu/shared';
import { BotBrain } from './bot';

const STEPS = TICK_HZ / WORLD_HZ;
const TICK_MS = 1000 / WORLD_HZ;

export interface PartyResult {
  phase: string;
  seconds: number;
  stage: number;
  lobby: LobbyState;
  downs: number;
  revives: number;
  errors: string[];
  worlds: WorldInfo[];
}

export class Party {
  readonly host: GameHost;
  readonly ids: string[] = [];
  lobby!: LobbyState;
  snap: Snapshot | null = null;
  readonly worlds: WorldInfo[] = [];
  readonly errors: string[] = [];
  downs = 0;
  revives = 0;
  now = 0;
  private readonly brains = new Map<string, BotBrain>();

  constructor(seed = 12345, private readonly skill = 1) {
    this.host = new GameHost(
      {
        send: (_id, msg) => this.receive(msg, false),
        broadcast: (msg) => this.receive(msg, true),
      },
      'TEST',
      seed,
    );
  }

  private receive(msg: ServerMsg, shared: boolean): void {
    if (msg.t === 'lobby') this.lobby = msg.s;
    else if (msg.t === 'world' && shared) this.worlds.push(msg.w);
    else if (msg.t === 'error') this.errors.push(msg.text);
    else if (msg.t === 'snap') {
      this.snap = msg.s;
      for (const ev of msg.s.ev) {
        if (ev.e === 'down') this.downs++;
        else if (ev.e === 'revive') this.revives++;
      }
    }
  }

  add(hero: HeroId, name = hero): string {
    const id = `bot${this.ids.length + 1}`;
    this.host.join(id, name);
    this.host.onMessage(id, { t: 'hero', hero });
    this.ids.push(id);
    this.brains.set(id, new BotBrain(this.skill));
    return id;
  }

  /** Advances one host tick, with every bot playing from the latest snapshot. */
  tick(play = true): void {
    const snap = this.snap;
    for (const id of this.ids) {
      const brain = this.brains.get(id)!;
      const me = snap?.p.find((p) => p.id === id);
      const cmds = [];
      for (let i = 0; i < STEPS; i++) {
        if (play && snap && me && snap.w === this.host.info.wid) {
          const enemies = snap.e.map(unpackEnemy);
          cmds.push(brain.think({ me, players: snap.p, enemies, projectiles: snap.pr }));
        } else {
          cmds.push(brain.idle());
        }
      }
      this.host.onMessage(id, { t: 'i', c: packCmds(cmds) });
    }
    this.now += TICK_MS;
    this.host.update(this.now);
  }

  run(seconds: number, until?: () => boolean): void {
    const ticks = Math.round(seconds * WORLD_HZ);
    for (let i = 0; i < ticks; i++) {
      this.tick();
      if (until?.()) return;
    }
  }

  playMission(mission: string, maxSeconds: number): PartyResult {
    const hostId = this.host.hostId;
    this.host.onMessage(hostId, { t: 'mission', id: mission });
    this.host.onMessage(hostId, { t: 'start' });
    const start = this.now;
    this.run(maxSeconds, () => this.host.phase === 'victory' || this.host.phase === 'defeat');
    return {
      phase: this.host.phase,
      seconds: (this.now - start) / 1000,
      stage: this.host.stage,
      lobby: this.lobby,
      downs: this.downs,
      revives: this.revives,
      errors: this.errors,
      worlds: this.worlds,
    };
  }
}
