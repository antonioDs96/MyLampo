/**
 * Game host: lobby, mission flow and snapshots on top of the World simulation.
 * Transport-agnostic: the Colyseus room wraps it on the server, and the offline mode
 * runs it in the browser through an in-memory loopback.
 */
import { MAX_PLAYERS, TICK_HZ, WORLD_DT, WORLD_HZ } from './constants';
import { HEROES, isHeroId } from './heroes';
import { CELL, collide, nearestFloor, parseLayout } from './layout';
import { HUB_LINES } from './lore';
import { MISSIONS, missionById, type MissionDef, type MissionMode } from './missions';
import { clonePlayer, neutralCmd } from './player';
import {
  packEnemy,
  packProjectile,
  packZone,
  unpackCmds,
  type ClientMsg,
  type LobbyContract,
  type LobbyState,
  type Phase,
  type ServerMsg,
  type Snapshot,
  type WorldInfo,
} from './protocol';
import { awardXp, levelFromXp } from './progress';
import { Act, EState, type HeroId, type InputCmd } from './types';
import { World, type PlayerStats } from './world';
import {
  ALL_HUBS,
  HUB_META,
  TileType,
  buildHub,
  getZone,
  tileAt,
  type HubId,
  zoneMapToLayout,
} from './proceduralBiomes';
import {
  advanceZone,
  createProceduralRuntime,
  currentLayout,
  currentZone,
  gatherResource,
  generateContractBoard,
  objectiveHudLine,
  tryCapture,
  unlockNextGate,
  updateBossObjective,
  wavesForZone,
  type MissionContract,
  type MissionKind,
  type ProceduralMissionRuntime,
} from './missionSystem';

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
  /** Active regional hub. */
  hubId: HubId = 'badiscar';
  /** Contracts currently on the board. */
  contracts: MissionContract[] = [];
  /** Selected procedural contract (null = legacy story mission). */
  contractId: string | null = null;

  private readonly io: HostIO;
  private readonly clients = new Map<string, Client>();
  private seed: number;
  private wid = 0;
  private clock = 0;
  private acc = 0;
  private lastNow = -1;
  private transition: { at: number; to: 'next' | 'victory' | 'defeat' | 'zone' } | null = null;
  private finalStats: Record<string, PlayerStats> = {};
  private xpGain: Record<string, number> = {};
  private proc: ProceduralMissionRuntime | null = null;
  private gateArmAt = 0;
  /** Solo / offline UI pause — freezes sim clock without dropping the world. */
  private paused = false;

  constructor(io: HostIO, code: string, seed: number) {
    this.io = io;
    this.code = code;
    this.seed = seed >>> 0 || 1;
    this.refreshContracts();
    this.loadHub();
  }

  private refreshContracts(): void {
    this.contracts = generateContractBoard(this.hubId, this.seed ^ (this.wid + 1) * 9973, 4);
    if (this.contractId && !this.contracts.some((c) => c.id === this.contractId)) {
      this.contractId = this.contracts[0]?.id ?? null;
    }
  }

  private selectedContract(): MissionContract | null {
    if (!this.contractId) return null;
    return this.contracts.find((c) => c.id === this.contractId) ?? null;
  }

  private isProcedural(): boolean {
    return !!this.proc;
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
          this.contractId = null;
          this.proc = null;
          this.sendLobby();
        }
        break;
      case 'hubSelect': {
        if (id !== this.hostId || this.phase !== 'hub') break;
        const hub = String(msg.hubId) as HubId;
        if (!ALL_HUBS.includes(hub) || hub === this.hubId) break;
        this.hubId = hub;
        this.contractId = null;
        this.refreshContracts();
        this.loadHub();
        break;
      }
      case 'contract':
        if (id === this.hostId && this.phase === 'hub') {
          const c = this.contracts.find((x) => x.id === String(msg.id));
          if (c) {
            this.contractId = c.id;
            this.missionId = `proc:${c.kind}`;
            this.sendLobby();
          }
        }
        break;
      case 'capture':
        if (this.phase === 'mission' && this.proc) {
          if (tryCapture(this.proc)) {
            this.world.events.push({ e: 'say', who: 'Carlos', text: 'Cattura riuscita — tramortito, non ucciso. Il Consiglio vi deve un favore.' });
            unlockNextGate(this.proc);
            this.transition = { at: this.clock + 3500, to: 'victory' };
            this.sendLobby();
            break;
          }
          // Gathering: [F] near a resource node.
          if (this.proc.contract.kind === 'GATHERING_RUN') {
            const p = this.world.players.get(id);
            const zone = currentZone(this.proc);
            if (p && zone.resourceSpawns.length) {
              let nearest = -1;
              let best = 3.5;
              for (let i = 0; i < zone.resourceSpawns.length; i++) {
                const n = zone.resourceSpawns[i]!;
                const d = Math.hypot(n.x - p.x, n.z - p.z);
                if (d < best) {
                  best = d;
                  nearest = i;
                }
              }
              if (nearest >= 0 && gatherResource(this.proc)) {
                zone.resourceSpawns.splice(nearest, 1);
                this.world.events.push({
                  e: 'say',
                  who: 'Carlos',
                  text: `Nodo estratto · ${this.proc.objectives.resourcesCarried}/${this.proc.objectives.resourcesTotal}`,
                });
                this.sendLobby();
              }
            }
          }
        }
        break;
      case 'start':
        if (id === this.hostId && this.phase === 'hub') this.startMission();
        break;
      case 'retry':
        if (id === this.hostId && this.phase === 'defeat') {
          this.phase = 'mission';
          if (this.proc) this.loadProceduralZone(false, true);
          else this.loadStage(this.stage, false, true);
        }
        break;
      case 'hub':
        if (id === this.hostId && this.phase !== 'hub') {
          this.phase = 'hub';
          this.proc = null;
          this.refreshContracts();
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
      case 'useBelt':
        if (this.world.useBelt(id, Number(msg.slot) | 0)) this.sendInv(id);
        break;
      case 'pickCard':
        if (this.world.pickLevelCard(id, Number(msg.index) | 0)) this.sendInv(id);
        break;
      case 'asi':
        if (typeof msg.ability === 'string' && this.world.spendAsi(id, msg.ability as import('./dndMegabonkRules').AbilityId)) {
          this.sendInv(id);
        }
        break;
      case 'inv':
        if (this.world.invAction(id, msg.op, String(msg.uid), msg.slot)) this.sendInv(id);
        break;
    }
  }

  private sendInv(id: string): void {
    const inv = this.world.getInventory(id);
    if (!inv) return;
    this.io.send(id, { t: 'inv', id, inv });
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
    if (c.hero) this.world.syncPe(c.id, c.xp[c.hero] ?? 0);
    this.sendLobby();
    this.sendInv(c.id);
  }

  private levelOf(c: Client, hero: HeroId | ''): number {
    if (!hero) return 1;
    return levelFromXp(c.xp[hero] ?? 0);
  }

  private spawnHero(c: Client, hero: HeroId): void {
    this.world.removePlayer(c.id);
    this.world.addPlayer(c.id, hero, this.slotOf(c.id), this.levelOf(c, hero), { starterGear: true });
    this.world.syncPe(c.id, c.xp[hero] ?? 0);
    this.sendInv(c.id);
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
    this.proc = null;
    const hubMap = buildHub(this.hubId);
    const layout = zoneMapToLayout(hubMap);
    this.world = new World({ layout, seed: this.seed, safe: true });
    this.xpGain = {};
    this.gateArmAt = 0;
    for (const c of this.clients.values()) {
      if (c.hero) this.spawnHero(c, c.hero);
    }
    const meta = HUB_META[this.hubId];
    const line = HUB_LINES[this.wid % HUB_LINES.length]!;
    this.world.events.push({ e: 'say', who: 'Carlos', text: line });
    this.announce({
      wid: ++this.wid,
      kind: 'hub',
      layoutId: hubMap.id,
      mission: '',
      stage: 0,
      stages: 0,
      title: meta.name,
      mutation: false,
      hubId: this.hubId,
      biome: meta.biome,
    });
  }

  private startMission(): void {
    const missing = [...this.clients.values()].filter((c) => !c.hero);
    if (missing.length > 0) {
      this.io.broadcast({ t: 'error', text: `Manca ancora la scelta dell'eroe: ${missing.map((c) => c.name).join(', ')}.` });
      return;
    }
    const contract = this.selectedContract();
    if (contract) {
      this.phase = 'mission';
      this.proc = createProceduralRuntime(contract);
      this.loadProceduralZone(false, true);
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
    this.proc = null;
    this.loadStage(0, false, true);
  }

  /** Procedural multi-zone (or raid arena) world build. */
  private loadProceduralZone(carry: boolean, fresh: boolean): void {
    const rt = this.proc;
    if (!rt) return;
    const old = this.world;
    const layout = currentLayout(rt);
    const waves = wavesForZone(rt);
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    const world = new World({
      layout,
      seed: this.seed,
      waves,
      introDelay: carry ? 3.5 : 4,
    });
    for (const c of this.clients.values()) {
      if (!c.hero) continue;
      const p = world.addPlayer(c.id, c.hero, this.slotOf(c.id), this.levelOf(c, c.hero), { starterGear: !carry });
      const prev = carry ? old.players.get(c.id) : undefined;
      if (prev && !fresh) {
        const keep = clonePlayer(prev);
        const max = p.maxHp;
        p.hp = keep.act === Act.Downed ? max * 0.5 : Math.min(max, keep.hp + max * 0.35);
        p.ult = keep.ult;
        p.cd = keep.cd;
      }
      if (carry) {
        const st = old.stats.get(c.id);
        if (st) world.stats.set(c.id, st);
        const inv = old.getInventory(c.id);
        if (inv) {
          world.inventories.set(c.id, inv);
          this.sendInv(c.id);
        }
      }
    }
    const zone = layout;
    const zMap = getZone(zone);
    const hint = waves[0]?.hint;
    if (hint) world.events.push({ e: 'say', who: 'Carlos', text: hint });
    this.world = world;
    this.stage = rt.zoneIndex;
    this.announce({
      wid: ++this.wid,
      kind: 'mission',
      layoutId: zMap?.id ?? `proc_${rt.zoneIndex}`,
      mission: rt.contract.id,
      stage: rt.zoneIndex,
      stages: rt.zones.length,
      title: zMap?.name ?? rt.contract.name,
      mutation: false,
      missionSeed: rt.contract.missionSeed,
      hubId: rt.contract.hubId,
      biome: rt.contract.biome,
      contractKind: rt.contract.kind,
      zoneIndex: rt.zoneIndex,
    });
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
      const p = world.addPlayer(c.id, c.hero, this.slotOf(c.id), this.levelOf(c, c.hero), { starterGear: true });
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
    const contracts: LobbyContract[] = this.contracts.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      brief: c.brief,
      danger: c.danger,
      rewardHint: c.rewardHint,
      biome: c.biome,
      hubId: c.hubId,
      missionSeed: c.missionSeed,
    }));
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
      hubId: this.hubId,
      contracts,
      contractId: this.contractId ?? undefined,
      objective: this.proc ? objectiveHudLine(this.proc) : undefined,
    };
    this.io.broadcast({ t: 'lobby', s });
  }

  private grantRunXp(victory: boolean): void {
    const mission = missionById(this.missionId);
    const mode: MissionMode = mission?.mode ?? 'story';
    this.xpGain = {};
    for (const c of this.clients.values()) {
      if (!c.hero) continue;
      const st = this.finalStats[c.id];
      if (!st) continue;
      const inv = this.world.getInventory(c.id);
      // Prefer live PE from gem pickups; fall back to the synced book.
      const prevXp = Math.max(c.xp[c.hero] ?? 0, inv?.pe ?? 0);
      const prevLevel = levelFromXp(prevXp);
      const { gained } = awardXp(c.hero, st, { victory, mode });
      const xp = prevXp + gained;
      c.xp[c.hero] = xp;
      if (inv) inv.pe = xp;
      this.world.syncPe(c.id, xp);
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
      this.sendInv(c.id);
    }
  }

  // ---------------------------------------------------------------- loop

  /** Freeze the simulation (menus / scheda). Wall-clock gaps are discarded on resume. */
  pause(): void {
    this.paused = true;
  }

  /** Resume after UI pause; pass the current monotonic clock so catch-up is skipped. */
  unpause(nowMs: number): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastNow = nowMs;
    this.acc = 0;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Call often with a monotonic clock in ms; the host advances in fixed 50 ms ticks. */
  update(nowMs: number): void {
    if (this.paused) return;
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
    // Keep XP books aligned with gem PE and push inventory when progression events fire.
    const pending = world.events;
    let needInv = false;
    for (const ev of pending) {
      if (ev.e === 'pickup' || ev.e === 'levelup') needInv = true;
    }
    for (const c of this.clients.values()) {
      if (!c.hero) continue;
      const inv = world.getInventory(c.id);
      if (!inv) continue;
      const pe = inv.pe;
      if (pe > (c.xp[c.hero] ?? 0)) c.xp[c.hero] = pe;
    }
    this.flow();
    this.io.broadcast({ t: 'snap', s: this.snapshot() });
    if (needInv) {
      for (const c of this.clients.values()) this.sendInv(c.id);
    }
  }

  private flow(): void {
    // Hub: arm the north gate when a contract is selected and a hero steps on GATE_SOCKET.
    if (this.phase === 'hub') {
      this.hubGateFlow();
      return;
    }
    if (this.phase !== 'mission') return;
    const world = this.world;

    if (this.proc) {
      this.proceduralFlow();
      return;
    }

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
    } else if (to === 'zone') {
      this.loadProceduralZone(true, false);
    } else {
      this.finalStats = this.collectStats();
      this.phase = to;
      this.grantRunXp(to === 'victory');
      this.sendLobby();
    }
  }

  private hubGateFlow(): void {
    if (!this.contractId) {
      this.gateArmAt = 0;
      return;
    }
    const onGate = [...this.world.players.values()].some((p) => tileAt(this.world.layout, p.x, p.z) === TileType.GATE_SOCKET);
    if (!onGate) {
      this.gateArmAt = 0;
      return;
    }
    if (!this.gateArmAt) {
      this.gateArmAt = this.clock + 10000;
      this.world.events.push({
        e: 'say',
        who: 'Carlos',
        text: 'Varco armato — partenza tra 10 secondi. Restate sul sigillo (o lasciate la zona per annullare).',
      });
      return;
    }
    if (this.clock >= this.gateArmAt) {
      this.gateArmAt = 0;
      this.startMission();
    }
  }

  private proceduralFlow(): void {
    const rt = this.proc!;
    const world = this.world;

    // Track boss for hunt / capture objectives.
    const boss = world.enemies.find((e) => e.type === rt.objectives.bossId);
    if (boss) {
      updateBossObjective(rt, {
        hp: boss.hp,
        maxHp: boss.maxHp,
        broken: boss.state === EState.Broken,
        dead: boss.hp <= 0 || boss.state === EState.Dead,
      });
    }

    if (!this.transition) {
      if (rt.objectives.failed) {
        this.transition = { at: this.clock + 2500, to: 'defeat' };
        return;
      }
      if (rt.objectives.complete) {
        this.transition = { at: this.clock + 3500, to: 'victory' };
        return;
      }
      if (world.players.size > 0 && world.allDown()) {
        this.transition = { at: this.clock + 2500, to: 'defeat' };
        return;
      }
      if (world.waveState === 'done') {
        unlockNextGate(rt);
        const kind = rt.contract.kind as MissionKind;
        if (kind === 'RAID_DEFENSE') {
          world.events.push({ e: 'say', who: 'Carlos', text: 'La Reliquia regge. Forziere del Consiglio in arrivo.' });
          rt.objectives.complete = true;
          this.transition = { at: this.clock + 4000, to: 'victory' };
        } else if (kind === 'GATHERING_RUN' && rt.objectives.extractUnlocked) {
          rt.objectives.complete = true;
          this.transition = { at: this.clock + 3500, to: 'victory' };
        } else if (advanceZone(rt)) {
          world.events.push({ e: 'say', who: 'Carlos', text: 'Varco aperto — avanti, Compagnia.' });
          this.transition = { at: this.clock + 3000, to: 'zone' };
        } else {
          // Final zone cleared
          if (kind === 'CAPTURE_QUEST' && !rt.objectives.captureSucceeded) {
            // Killing boss illegally still ends the run (no capture bonus).
            rt.objectives.complete = true;
          } else if (kind === 'BOSS_HUNT') {
            rt.objectives.complete = true;
          } else if (kind === 'GATHERING_RUN') {
            // Still need extract — keep gate open, wait for resources
            if (rt.objectives.resourcesCarried >= rt.objectives.resourcesTotal) {
              rt.objectives.complete = true;
            }
          }
          if (rt.objectives.complete) this.transition = { at: this.clock + 4000, to: 'victory' };
        }
        this.sendLobby();
      }
      return;
    }
    if (this.clock < this.transition.at) return;
    const to = this.transition.to;
    this.transition = null;
    if (to === 'zone') {
      this.loadProceduralZone(true, false);
    } else if (to === 'next') {
      this.loadProceduralZone(true, false);
    } else {
      this.finalStats = this.collectStats();
      this.phase = to;
      this.grantRunXp(to === 'victory');
      this.proc = null;
      this.refreshContracts();
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
      loot: world.loot.map((d) => ({
        dropId: d.dropId,
        kind: d.kind,
        x: Math.round(d.x * 100) / 100,
        z: Math.round(d.z * 100) / 100,
        vx: Math.round(d.vx * 100) / 100,
        vz: Math.round(d.vz * 100) / 100,
        amount: d.amount,
        gem: d.gem,
        itemId: d.itemId,
        rarity: d.rarity,
      })),
    };
  }
}
