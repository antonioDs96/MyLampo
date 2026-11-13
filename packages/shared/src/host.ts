/**
 * Game host: lobby, mission flow and snapshots on top of the World simulation.
 * Transport-agnostic: the Colyseus room wraps it on the server, and the offline mode
 * runs it in the browser through an in-memory loopback.
 */
import { MAX_PLAYERS, TICK_HZ, WORLD_DT, WORLD_HZ } from './constants';
import { HEROES, isHeroId } from './heroes';
import { collide, nearestFloor, parseLayout } from './layout';
import { HUB_LINES } from './lore';
import { HUB_LAYOUT, MISSIONS, missionById, type MissionDef, type MissionMode } from './missions';
import { clonePlayer, neutralCmd } from './player';
import {
  packEnemy,
  packProjectile,
  packZone,
  unpackCmds,
  type ClientMsg,
  type LobbyState,
  type Phase,
  type ServerMsg,
  type Snapshot,
  type WorldInfo,
} from './protocol';
import { awardXp, levelFromXp } from './progress';
import { Act, type HeroId, type InputCmd } from './types';
import { World, type PlayerStats } from './world';

export interface HostIO {
  send(id: string, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
}

interface Client {
  id: string;
  name: string;
  hero: HeroId | '';
  /** Total XP per hero id for this player (synced from the client). */
  xp: Record<string, number>;
  queue: InputCmd[];
  last: InputCmd | undefined;
  ack: number;
  /** Input steps this client may still spend (rate limiting). */
  budget: number;
  idleTicks: number;
  rtt: number;
}

const STEPS_PER_TICK = TICK_HZ / WORLD_HZ;
const TICK_MS = 1000 / WORLD_HZ;
const MAX_BUDGET = STEPS_PER_TICK * 5;
const MAX_QUEUE = 40;

export function sanitizeName(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 18);
  return s || 'Viandante';
}

export class GameHost {
  readonly code: string;
  phase: Phase = 'hub';
  missionId: string = MISSIONS[0]!.id;
  stage = 0;
  world!: World;
  info!: WorldInfo;
  hostId = '';

  private readonly io: HostIO;
  private readonly clients = new Map<string, Client>();
  private seed: number;
  private wid = 0;
  private clock = 0;
  private acc = 0;
  private lastNow = -1;
  private transition: { at: number; to: 'next' | 'victory' | 'defeat' } | null = null;
  private finalStats: Record<string, PlayerStats> = {};
  private xpGain: Record<string, number> = {};

  constructor(io: HostIO, code: string, seed: number) {
    this.io = io;
    this.code = code;
    this.seed = seed >>> 0 || 1;
    this.loadHub();
  }

  get playerCount(): number {
    return this.clients.size;
  }

  // ---------------------------------------------------------------- clients

  join(id: string, name: unknown): boolean {
    if (this.clients.size >= MAX_PLAYERS || this.clients.has(id)) return false;
    this.clients.set(id, {
      id,
      name: sanitizeName(name),
      hero: '',
      xp: {},
      queue: [],
      last: undefined,
      ack: 0,
      budget: STEPS_PER_TICK,
      idleTicks: 0,
      rtt: 0,
    });
    if (!this.hostId) this.hostId = id;
    this.io.send(id, { t: 'welcome', id });
    this.io.send(id, { t: 'world', w: this.info });
    this.sendLobby();
    return true;
  }

  leave(id: string): void {
    if (!this.clients.delete(id)) return;
    this.world.removePlayer(id);
    if (this.hostId === id) this.hostId = this.clients.keys().next().value ?? '';
    this.sendLobby();
  }

  onMessage(id: string, msg: ClientMsg): void {
    const c = this.clients.get(id);
    if (!c || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'i': {
        const cmds = unpackCmds(msg.c);
        for (const cmd of cmds) c.queue.push(cmd);
        if (c.queue.length > MAX_QUEUE) c.queue.splice(0, c.queue.length - STEPS_PER_TICK * 4);
        break;
      }
      case 'hero':
        this.pickHero(c, msg.hero);
        break;
      case 'mission':
        if (id === this.hostId && this.phase === 'hub' && missionById(String(msg.id))) {
          this.missionId = String(msg.id);
          this.sendLobby();
        }
        break;
      case 'start':
        if (id === this.hostId && this.phase === 'hub') this.startMission();
        break;
      case 'retry':
        if (id === this.hostId && this.phase === 'defeat') {
          this.phase = 'mission';
          this.loadStage(this.stage, false, true);
        }
        break;
      case 'hub':
        if (id === this.hostId && this.phase !== 'hub') {
          this.phase = 'hub';
          this.loadHub();
        }
        break;
      case 'ping':
        this.io.send(id, { t: 'pong', at: Number(msg.at) || 0 });
        break;
      case 'rtt': {
        const ms = Number(msg.ms);
        if (Number.isFinite(ms)) {
          c.rtt = Math.max(0, Math.min(1000, ms));
          this.world.rtt.set(id, c.rtt);
        }
        break;
      }
      case 'progress':
        this.mergeProgress(c, msg.xp);
        break;
    }
  }

  private mergeProgress(c: Client, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const next = { ...c.xp };
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!isHeroId(k)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) continue;
      // Take the higher total so offline gains and server awards never regress.
      next[k] = Math.max(next[k] ?? 0, Math.floor(n));
    }
    c.xp = next;
    this.sendLobby();
  }

  private levelOf(c: Client, hero: HeroId | ''): number {
    if (!hero) return 1;
    return levelFromXp(c.xp[hero] ?? 0);
  }

  private spawnHero(c: Client, hero: HeroId): void {
    this.world.removePlayer(c.id);
    this.world.addPlayer(c.id, hero, this.slotOf(c.id), this.levelOf(c, hero));
  }

  private pickHero(c: Client, raw: unknown): void {
    // Empty string releases the current hero in the tavern so friends can swap.
    if (raw === '' || raw === null || raw === undefined) {
      if (this.phase !== 'hub') {
        this.io.send(c.id, { t: 'error', text: 'Puoi lasciare un eroe solo in taverna.' });
        return;
      }
      if (!c.hero) return;
      c.hero = '';
      this.world.removePlayer(c.id);
      this.sendLobby();
      return;
    }
    if (!isHeroId(raw)) return;
    if (c.hero === raw) return;
    if (this.phase === 'mission' && c.hero) {
      this.io.send(c.id, { t: 'error', text: 'Non puoi cambiare eroe durante una missione — torna in taverna.' });
      return;
    }
    // Hub, victory and defeat all allow a new pick for the next sortie.
    if (this.phase !== 'hub' && this.phase !== 'victory' && this.phase !== 'defeat' && c.hero) {
      this.io.send(c.id, { t: 'error', text: 'Non puoi cambiare eroe adesso.' });
      return;
    }
    for (const o of this.clients.values()) {
      if (o !== c && o.hero === raw) {
        this.io.send(c.id, { t: 'error', text: `${HEROES[raw].short} è già stato scelto da ${o.name}.` });
        return;
      }
    }
    c.hero = raw;
    if (this.phase === 'hub') this.spawnHero(c, raw);
    this.sendLobby();
  }

  private slotOf(id: string): number {
    let i = 0;
    for (const k of this.clients.keys()) {
      if (k === id) return i;
      i++;
    }
    return 0;
  }

  // ---------------------------------------------------------------- worlds

  private mission(): MissionDef {
    return missionById(this.missionId) ?? MISSIONS[0]!;
  }

  private announce(info: WorldInfo): void {
    this.info = info;
    this.transition = null;
    for (const c of this.clients.values()) {
      c.queue.length = 0;
      this.world.rtt.set(c.id, c.rtt);
    }
    this.io.broadcast({ t: 'world', w: info });
    this.sendLobby();
  }

  private loadHub(): void {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    this.world = new World({ layout: parseLayout(HUB_LAYOUT), seed: this.seed, safe: true });
    this.xpGain = {};
    for (const c of this.clients.values()) {
      if (c.hero) this.spawnHero(c, c.hero);
    }
    const line = HUB_LINES[this.wid % HUB_LINES.length]!;
    this.world.events.push({ e: 'say', who: 'Carlos', text: line });
    this.announce({
      wid: ++this.wid,
      kind: 'hub',
      layoutId: HUB_LAYOUT.id,
      mission: '',
      stage: 0,
      stages: 0,
      title: HUB_LAYOUT.name,
      mutation: false,
    });
  }

  private startMission(): void {
    const missing = [...this.clients.values()].filter((c) => !c.hero);
    if (missing.length > 0) {
      this.io.broadcast({ t: 'error', text: `Manca ancora la scelta dell'eroe: ${missing.map((c) => c.name).join(', ')}.` });
      return;
    }
    const mission = this.mission();
    const mode: MissionMode = mission.mode ?? 'story';
    if (mode === 'arena') {
      const ready = [...this.clients.values()].filter((c) => c.hero);
      if (ready.length < 2) {
        this.io.broadcast({
          t: 'error',
          text: "L'arena Ultimo in piedi serve almeno due eroi in taverna. Chiamate un amico — o un nemico.",
        });
        return;
      }
    }
    this.phase = 'mission';
    this.loadStage(0, false, true);
  }

  /**
   * Builds the world for a mission stage.
   * `carry` keeps the heroes' condition from the previous stage; `fresh` restores them fully.
   */
  private loadStage(stage: number, carry: boolean, fresh: boolean): void {
    const mission = this.mission();
    const def = mission.stages[stage]!;
    const old = this.world;
    const mutation = !!def.mutation && carry;
    this.stage = stage;
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    const layout = parseLayout(def.layout);
    const mode: MissionMode = mission.mode ?? 'story';
    const arena = mode === 'arena';
    const world = new World({
      layout,
      seed: this.seed,
      waves: def.waves,
      introDelay: mutation ? 4.5 : arena ? 2.5 : 4,
      pvp: arena,
      noRevive: arena,
    });
    for (const c of this.clients.values()) {
      if (!c.hero) continue;
      const p = world.addPlayer(c.id, c.hero, this.slotOf(c.id), this.levelOf(c, c.hero));
      const prev = carry ? old.players.get(c.id) : undefined;
      if (prev && !fresh) {
        const keep = clonePlayer(prev);
        const max = p.maxHp;
        p.hp = keep.act === Act.Downed ? max * 0.5 : Math.min(max, keep.hp + max * 0.35);
        p.ult = keep.ult;
        p.cd = keep.cd;
        if (mutation) {
          const at = nearestFloor(layout, keep.x, keep.z);
          collide(layout, at.x, at.z, 0.6, at);
          p.x = at.x;
          p.z = at.z;
          p.yaw = keep.yaw;
        }
      }
      if (carry) {
        const st = old.stats.get(c.id);
        if (st) world.stats.set(c.id, st);
      }
    }
    for (const line of def.intro ?? []) world.events.push({ e: 'say', who: line.who, text: line.text });
    this.world = world;
    this.announce({
      wid: ++this.wid,
      kind: 'mission',
      layoutId: def.layout.id,
      mission: mission.id,
      stage,
      stages: mission.stages.length,
      title: def.title,
      mutation,
    });
  }

  private collectStats(): Record<string, PlayerStats> {
    const out: Record<string, PlayerStats> = {};
    for (const [id, st] of this.world.stats) if (this.clients.has(id)) out[id] = { ...st };
    return out;
  }

  private sendLobby(): void {
    const ended = this.phase === 'victory' || this.phase === 'defeat';
    const s: LobbyState = {
      code: this.code,
      host: this.hostId,
      phase: this.phase,
      mission: this.missionId,
      stage: this.stage,
      players: [...this.clients.values()].map((c) => ({
        id: c.id,
        name: c.name,
        hero: c.hero,
        level: this.levelOf(c, c.hero),
        xp: c.hero ? c.xp[c.hero] ?? 0 : 0,
      })),
      stats: ended ? this.finalStats : {},
      xpGain: ended ? this.xpGain : {},
    };
    this.io.broadcast({ t: 'lobby', s });
  }

  private grantRunXp(victory: boolean): void {
    const mission = this.mission();
    this.xpGain = {};
    for (const c of this.clients.values()) {
      if (!c.hero) continue;
      const st = this.finalStats[c.id];
      if (!st) continue;
      const prevXp = c.xp[c.hero] ?? 0;
      const prevLevel = levelFromXp(prevXp);
      const { gained } = awardXp(c.hero, st, { victory, mode: mission.mode ?? 'story' });
      const xp = prevXp + gained;
      c.xp[c.hero] = xp;
      this.xpGain[c.id] = gained;
      this.io.send(c.id, {
        t: 'xp',
        id: c.id,
        hero: c.hero,
        gained,
        xp,
        level: levelFromXp(xp),
        prevLevel,
      });
    }
  }

  // ---------------------------------------------------------------- loop

  /** Call often with a monotonic clock in ms; the host advances in fixed 50 ms ticks. */
  update(nowMs: number): void {
    if (this.lastNow < 0) this.lastNow = nowMs;
    this.acc += Math.min(250, Math.max(0, nowMs - this.lastNow));
    this.lastNow = nowMs;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.tick();
    }
  }

  private tick(): void {
    this.clock += TICK_MS;
    const world = this.world;
    for (const c of this.clients.values()) {
      if (!world.players.has(c.id)) {
        c.queue.length = 0;
        continue;
      }
      c.budget = Math.min(MAX_BUDGET, c.budget + STEPS_PER_TICK);
      const n = Math.min(c.queue.length, Math.floor(c.budget));
      for (let i = 0; i < n; i++) {
        const cmd = c.queue[i]!;
        world.applyCommand(c.id, cmd);
        c.last = cmd;
        c.ack = cmd.seq;
      }
      if (n > 0) {
        c.queue.splice(0, n);
        c.budget -= n;
        c.idleTicks = 0;
      } else if (++c.idleTicks >= 5) {
        // The client went quiet: keep its hero's timers running with empty input.
        const idle = neutralCmd(c.last);
        for (let i = 0; i < STEPS_PER_TICK; i++) world.applyCommand(c.id, idle);
        c.budget = Math.max(0, c.budget - STEPS_PER_TICK);
      }
    }

    world.step(WORLD_DT);
    this.flow();
    this.io.broadcast({ t: 'snap', s: this.snapshot() });
  }

  private flow(): void {
    if (this.phase !== 'mission') return;
    const world = this.world;
    const mission = this.mission();
    const arena = (mission.mode ?? 'story') === 'arena';
    if (!this.transition) {
      if (arena) {
        const standing = world.alivePlayers();
        if (world.players.size >= 2 && standing.length <= 1) {
          if (standing.length === 1) {
            const champ = standing[0]!;
            const name = this.clients.get(champ.id)?.name ?? HEROES[champ.hero].short;
            world.events.push({
              e: 'say',
              who: 'Carlos',
              text: `${name} resta in piedi. Gli altri… beh, la pagheranno al bancone.`,
            });
            for (const line of mission.victory) world.events.push({ e: 'say', who: line.who, text: line.text });
            this.transition = { at: this.clock + 3500, to: 'victory' };
          } else {
            world.events.push({ e: 'say', who: 'Carlos', text: 'Tutti a terra. Nessun vincitore — solo conti da saldare.' });
            this.transition = { at: this.clock + 2500, to: 'defeat' };
          }
        }
      } else if (world.players.size > 0 && world.allDown()) {
        this.transition = { at: this.clock + 2500, to: 'defeat' };
      } else if (world.waveState === 'done') {
        if (this.stage + 1 < mission.stages.length) {
          this.transition = { at: this.clock + 3500, to: 'next' };
        } else {
          for (const line of mission.victory) world.events.push({ e: 'say', who: line.who, text: line.text });
          this.transition = { at: this.clock + 4500, to: 'victory' };
        }
      }
      return;
    }
    if (this.clock < this.transition.at) return;
    const to = this.transition.to;
    this.transition = null;
    if (to === 'next') {
      this.loadStage(this.stage + 1, true, false);
    } else {
      this.finalStats = this.collectStats();
      this.phase = to;
      this.grantRunXp(to === 'victory');
      this.sendLobby();
    }
  }

  private snapshot(): Snapshot {
    const world = this.world;
    const ack: Record<string, number> = {};
    for (const c of this.clients.values()) ack[c.id] = c.ack;
    return {
      w: this.wid,
      t: this.clock,
      ack,
      p: [...world.players.values()].map(clonePlayer),
      e: world.enemies.map((e) => packEnemy(e)),
      pr: world.projectiles.map(packProjectile),
      z: world.zones.map(packZone),
      ev: world.drainEvents(),
      wave: {
        n: world.waveIdx + 1,
        of: world.waves.length,
        left: world.enemiesLeft(),
        state: world.waveState,
      },
    };
  }
}
