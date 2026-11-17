/**
 * Drives a GameHost with bot players at full speed (no real clock, no sockets), the same
 * way the room does: three input steps per bot for every 50 ms host tick.
 */
import {
  GameHost,
  TICK_HZ,
  WORLD_HZ,
  layoutDefById,
  packCmds,
  parseLayout,
  unpackEnemy,
  type GameEvent,
  type HeroId,
  type Layout,
  type LobbyState,
  type Profile,
  type ProfileArchive,
  type Purse,
  type ServerMsg,
  type Snapshot,
  type WorldInfo,
} from '@malampu/shared';
import { BotBrain } from './bot';

const STEPS = TICK_HZ / WORLD_HZ;
const TICK_MS = 1000 / WORLD_HZ;

export class Party {
  readonly host: GameHost;
  readonly ids: string[] = [];
  lobby!: LobbyState;
  snap: Snapshot | null = null;
  readonly worlds: WorldInfo[] = [];
  readonly errors: string[] = [];
  /** Public events seen in snapshots, by kind. */
  readonly seen: GameEvent[] = [];
  /** Private messages, per player. */
  readonly mine = new Map<string, GameEvent[]>();
  readonly satchel = new Map<string, Purse>();
  readonly profiles = new Map<string, Profile>();
  downs = 0;
  revives = 0;
  now = 0;
  private readonly brains = new Map<string, BotBrain>();
  private layout: Layout | undefined;

  constructor(
    seed = 12345,
    private readonly skill = 1,
    archive?: ProfileArchive,
  ) {
    this.host = new GameHost(
      {
        send: (id, msg) => this.receive(msg, id),
        broadcast: (msg) => this.receive(msg, ''),
      },
      'TEST',
      seed,
      archive,
    );
  }

  private receive(msg: ServerMsg, to: string): void {
    if (msg.t === 'lobby') this.lobby = msg.s;
    else if (msg.t === 'world') {
      if (!to) this.worlds.push(msg.w);
      const def = layoutDefById(msg.w.layoutId);
      this.layout = def ? parseLayout(def) : undefined;
    } else if (msg.t === 'error') this.errors.push(msg.text);
    else if (msg.t === 'mine') {
      const list = this.mine.get(to) ?? [];
      list.push(...msg.ev);
      this.mine.set(to, list);
      this.satchel.set(to, msg.sat);
    } else if (msg.t === 'profile') this.profiles.set(to, msg.p);
    else if (msg.t === 'snap') {
      this.snap = msg.s;
      for (const ev of msg.s.ev) {
        this.seen.push(ev);
        if (ev.e === 'down') this.downs++;
        else if (ev.e === 'revive') this.revives++;
      }
    }
  }

  /** Joins, picks a hero and (by default) presses "Conferma Pronto". */
  add(hero: HeroId, name: string = hero, ready = true): string {
    const id = `bot${this.ids.length + 1}`;
    this.host.join(id, name);
    this.host.onMessage(id, { t: 'hero', hero });
    if (ready) this.host.onMessage(id, { t: 'ready', on: true });
    this.ids.push(id);
    this.brains.set(id, new BotBrain(this.skill));
    return id;
  }

  /** Advances one host tick, with every bot playing from the latest snapshot. */
  tick(play = true): void {
    const snap = this.snap;
    const portal = this.host.world.pois.find((p) => p.kind === 'portal' && p.state === 1);
    for (const id of this.ids) {
      const brain = this.brains.get(id)!;
      const me = snap?.p.find((p) => p.id === id);
      const cmds = [];
      for (let i = 0; i < STEPS; i++) {
        if (play && snap && me && snap.w === this.host.info.wid) {
          const enemies = snap.e.map(unpackEnemy);
          cmds.push(
            brain.think({ me, players: snap.p, enemies, projectiles: snap.pr, layout: this.layout, goal: portal, zones: snap.z }),
          );
        } else {
          cmds.push(brain.idle());
        }
      }
      this.host.onMessage(id, { t: 'i', c: packCmds(cmds) });
    }
    this.now += TICK_MS;
    this.host.update(this.now);
  }

  run(seconds: number, until?: () => boolean, play = true): boolean {
    const ticks = Math.round(seconds * WORLD_HZ);
    for (let i = 0; i < ticks; i++) {
      this.tick(play);
      if (until?.()) return true;
    }
    return false;
  }

  /** Everyone at the Choice Terminal presses the same button. */
  voteAll(choice: 'extract' | 'continue'): void {
    for (const id of this.ids) this.host.onMessage(id, { t: 'vote', choice });
  }
}
