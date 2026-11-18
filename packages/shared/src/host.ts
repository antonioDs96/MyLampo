/**
 * Game host: Hero Selection, the hub, expeditions and snapshots on top of the World simulation.
 * Transport-agnostic: the Colyseus room wraps it on the server, and the offline mode
 * runs it in the browser through an in-memory loopback.
 *
 *   select -> hub (La Taverna di Carl) -> run (Environment ... City Boss) -> hub
 */
import { BOUNTY_BY_ID, judgeBounty, type BountyVerdict, type StageLog } from './bounties';
import {
  CITIES,
  CITY_IDS,
  HUB_LAYOUT,
  cityUnlocked,
  isCityId,
  stageBlurb,
  stageIndex,
  stageLabel,
  stageLayout,
  stageName,
  stageOf,
  type CityId,
  type Stage,
} from './campaign';
import { MAX_PLAYERS, TICK_HZ, TUNING, WORLD_DT, WORLD_HZ } from './constants';
import { COSMETIC_BY_ID, LOADOUT_SLOTS, emptyLoadout, type LoadoutSlot } from './cosmetics';
import { addPurse, afterWipe, companyBonus, deathTax, emptyPurse, fervorBonus, type Purse } from './economy';
import { HEROES, isHeroId } from './heroes';
import type { JevAdvisor } from './jevMind';
import { parseLayout } from './layout';
import { HUB_LINES } from './lore';
import { clonePlayer, neutralCmd } from './player';
import {
  bountiesUnlocked,
  buyCosmetic,
  buyNode,
  checkpointOf,
  emptyProfile,
  equipCosmetic,
  isProfileId,
  loadoutOf,
  regionBossUnlocked,
  respecTree,
  treeOf,
  type Profile,
  type ProfileArchive,
  type ShopResult,
} from './profile';
import {
  packEnemy,
  packProjectile,
  packZone,
  unpackCmds,
  type ClientMsg,
  type LobbyState,
  type Phase,
  type ReportKind,
  type RunReport,
  type ServerMsg,
  type Snapshot,
  type VoteChoice,
  type WorldInfo,
} from './protocol';
import { ABILITY_SLOTS, PATH_IDS, type AbilitySlot, type PathId } from './skillTree';
import { Act, type GameEvent, type HeroId, type InputCmd, type PingKind } from './types';
import type { QuipWriter } from './quips';
import { World, type PlayerSetup, type PlayerStats, type WorldOpts } from './world';

export interface HostIO {
  send(id: string, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
}

interface Client {
  id: string;
  name: string;
  hero: HeroId | '';
  /** Pressed "Conferma Pronto": the hero is (or is about to be) in the world. */
  ready: boolean;
  slot: number;
  queue: InputCmd[];
  last: InputCmd | undefined;
  ack: number;
  /** Input steps this client may still spend (rate limiting). */
  budget: number;
  idleTicks: number;
  rtt: number;
  /** Stable id of the saved profile. Empty until the client introduces itself. */
  profileId: string;
  profile: Profile;
  /** Loot from earlier stages of this expedition, not banked yet. */
  carried: Purse;
  /** Clock of the last ping, for rate limiting. */
  markAt: number;
}

interface Vote {
  by: string;
  votes: Map<string, VoteChoice | ''>;
}

type Transition = { at: number; to: 'wipe' | 'boss' };

const STEPS_PER_TICK = TICK_HZ / WORLD_HZ;
const TICK_MS = 1000 / WORLD_HZ;
const MAX_BUDGET = STEPS_PER_TICK * 5;
const MAX_QUEUE = 40;
const MARK_EVERY_MS = 350;
const PING_KINDS: PingKind[] = ['rally', 'danger', 'chest', 'elite'];

export function sanitizeName(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 18);
  return s || 'Viandante';
}

function isPrivate(ev: GameEvent): ev is Extract<GameEvent, { to: string }> {
  return ev.e === 'drop' || ev.e === 'take';
}

export class GameHost {
  readonly code: string;
  phase: Phase = 'select';
  world!: World;
  info!: WorldInfo;
  hostId = '';
  /** Strangers may join, and the client labels the room as the public tavern. */
  readonly isPublic: boolean;
  /** Where the expedition is. Null in the hub. */
  stage: Stage | null = null;
  /** Consecutive stages entered without saving: the Fervor. */
  streak = 0;

  private readonly io: HostIO;
  private readonly clients = new Map<string, Client>();
  private seed: number;
  private wid = 0;
  private clock = 0;
  private acc = 0;
  private lastNow = -1;
  private transition: Transition | null = null;
  private vote: Vote | null = null;
  private report: RunReport | null = null;
  private reports = 0;
  /** Stages cleared so far in this expedition, in order: what bounties are judged on. */
  private log: StageLog[] = [];
  /** Contract the Host signed before leaving ('' = none). */
  private bounty = '';
  private bountyState: BountyVerdict = 'open';
  private judgeIn = 0;
  /** Solo / offline UI pause: freezes the simulation without dropping the world. */
  private paused = false;
  private readonly archive?: ProfileArchive;
  /** Tactical Jev advisor. Absent when the server has no TypeSafe key. */
  private readonly jev?: JevAdvisor;
  /** Lite model for enemy one-liners. Absent: the written taunt is used. */
  private readonly quips?: QuipWriter;

  constructor(
    io: HostIO,
    code: string,
    seed: number,
    archive?: ProfileArchive,
    isPublic = false,
    jev?: JevAdvisor,
    quips?: QuipWriter,
  ) {
    this.io = io;
    this.archive = archive;
    this.jev = jev;
    this.quips = quips;
    this.code = code;
    this.isPublic = isPublic;
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
      ready: false,
      slot: this.freeSlot(),
      queue: [],
      last: undefined,
      ack: 0,
      budget: STEPS_PER_TICK,
      idleTicks: 0,
      rtt: 0,
      profileId: '',
      profile: emptyProfile(),
      carried: emptyPurse(),
      markAt: -1e9,
    });
    if (!this.hostId) this.hostId = id;
    this.io.send(id, { t: 'welcome', id });
    this.io.send(id, { t: 'world', w: this.info });
    this.io.send(id, { t: 'profile', p: this.clients.get(id)!.profile });
    this.sendLobby();
    return true;
  }

  leave(id: string): void {
    const c = this.clients.get(id);
    if (!c) return;
    // Walking out of an expedition counts as falling in it: the current stage is taxed.
    if (this.phase === 'run' && this.world.players.has(id)) {
      this.bank(c, afterWipe(c.carried, this.world.satchelOf(id)));
    }
    this.saveProfile(c);
    this.clients.delete(id);
    this.world.removePlayer(id);
    if (this.hostId === id) this.hostId = this.clients.keys().next().value ?? '';
    if (this.vote) {
      this.vote.votes.delete(id);
      this.checkVote();
    }
    if (this.phase === 'select') this.checkAllReady();
    if (this.phase === 'run' && this.world.players.size === 0) this.endRun();
    this.sendLobby();
  }

  private freeSlot(): number {
    const used = new Set([...this.clients.values()].map((c) => c.slot));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
  }

  private hostClient(): Client | undefined {
    return this.clients.get(this.hostId);
  }

  onMessage(id: string, msg: ClientMsg): void {
    const c = this.clients.get(id);
    if (!c || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'i': {
        const cmds = unpackCmds(msg.c);
        const seen = Number(msg.v);
        const vt = Number.isFinite(seen) && seen > 0 ? seen : 0;
        for (const cmd of cmds) {
          cmd.vt = vt;
          c.queue.push(cmd);
        }
        if (c.queue.length > MAX_QUEUE) c.queue.splice(0, c.queue.length - STEPS_PER_TICK * 4);
        break;
      }
      case 'hero':
        this.pickHero(c, msg.hero);
        break;
      case 'ready':
        this.setReady(c, msg.on !== false);
        break;
      case 'reselect':
        this.reselect(c);
        break;
      case 'run':
        if (id === this.hostId) this.startRun(String(msg.city));
        break;
      case 'vote':
        this.castVote(c, String(msg.choice));
        break;
      case 'mark':
        this.mark(c, msg.kind, Number(msg.x), Number(msg.z));
        break;
      case 'tree':
        this.shopTree(c, msg.op, String(msg.slot), String(msg.path ?? ''));
        break;
      case 'cosm':
        this.shopCosmetic(c, msg.op, String(msg.id ?? ''), String(msg.slot ?? ''));
        break;
      case 'bounty':
        this.signBounty(c, String(msg.id ?? ''));
        break;
      case 'profile':
        this.bindProfile(c, msg.id);
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
    }
  }

  // ---------------------------------------------------------------- profile

  private bindProfile(c: Client, raw: unknown): void {
    if (!isProfileId(raw) || c.profileId === raw) return;
    // Two tabs on one profile would overwrite each other's bank.
    for (const o of this.clients.values()) if (o !== c && o.profileId === raw) return;
    const fresh = c.profile;
    c.profileId = raw;
    c.profile = this.archive?.load(raw) ?? emptyProfile();
    // Anything earned before the client introduced itself is kept.
    c.profile.gems += fresh.gems;
    c.profile.threads += fresh.threads;
    this.io.send(c.id, { t: 'profile', p: c.profile });
    if (c.hero && this.world.players.has(c.id)) this.world.retune(c.id, treeOf(c.profile, c.hero));
    this.sendLobby();
  }

  private saveProfile(c: Client): void {
    if (c.profileId) this.archive?.save(c.profileId, c.profile);
  }

  private pushProfile(c: Client): void {
    this.saveProfile(c);
    this.io.send(c.id, { t: 'profile', p: c.profile });
  }

  private bank(c: Client, purse: Purse): void {
    c.profile.gems += purse.gems;
    c.profile.threads += purse.threads;
    c.carried = emptyPurse();
  }

  private deny(c: Client, res: ShopResult): boolean {
    if (res.ok) return false;
    this.io.send(c.id, { t: 'error', text: res.why });
    return true;
  }

  /** Iej. Only in the hub: the tree never changes in the middle of an expedition. */
  private shopTree(c: Client, op: unknown, slot: string, path: string): void {
    if (this.phase === 'run' || !c.hero) return;
    if (op === 'respec') {
      const only = (ABILITY_SLOTS as string[]).includes(slot) ? (slot as AbilitySlot) : undefined;
      respecTree(c.profile, c.hero, only);
    } else if (op === 'buy') {
      if (!(ABILITY_SLOTS as string[]).includes(slot) || !(PATH_IDS as string[]).includes(path)) return;
      if (this.deny(c, buyNode(c.profile, c.hero, slot as AbilitySlot, path as PathId))) return;
    } else return;
    this.world.retune(c.id, treeOf(c.profile, c.hero));
    this.pushProfile(c);
  }

  /** Saraya. Cosmetics only: nothing here reaches the simulation. */
  private shopCosmetic(c: Client, op: unknown, id: string, slot: string): void {
    if (this.phase === 'run') return;
    if (op === 'buy') {
      if (this.deny(c, buyCosmetic(c.profile, id))) return;
    } else if (op === 'equip') {
      const kind = slot || COSMETIC_BY_ID[id]?.kind || '';
      if (kind !== 'title' && !(LOADOUT_SLOTS as string[]).includes(kind)) return;
      if (kind !== 'title' && !c.hero) return;
      if (this.deny(c, equipCosmetic(c.profile, c.hero || 'albereth', kind as LoadoutSlot | 'title', id))) return;
    } else return;
    this.pushProfile(c);
    this.sendLobby();
  }

  /** Eleonora. The Host signs one contract for the whole company. */
  private signBounty(c: Client, id: string): void {
    if (this.phase === 'run' || c.id !== this.hostId) return;
    if (id && !BOUNTY_BY_ID[id]) return;
    if (id && !bountiesUnlocked(c.profile)) {
      this.io.send(c.id, { t: 'error', text: 'Eleonora tratta solo con chi ha già liberato una Città.' });
      return;
    }
    c.profile.bounty = id;
    this.pushProfile(c);
    this.sendLobby();
  }

  // ---------------------------------------------------------------- hero selection

  private pickHero(c: Client, raw: unknown): void {
    if (c.ready) return;
    if (raw === '' || raw === null || raw === undefined) {
      c.hero = '';
      this.sendLobby();
      return;
    }
    if (!isHeroId(raw) || c.hero === raw) return;
    for (const o of this.clients.values()) {
      if (o !== c && o.hero === raw) {
        this.io.send(c.id, { t: 'error', text: `${HEROES[raw].short} è già stato scelto da ${o.name}.` });
        return;
      }
    }
    c.hero = raw;
    this.sendLobby();
  }

  private setReady(c: Client, on: boolean): void {
    if (on === c.ready) return;
    if (!on) {
      // Taking it back is only possible while the lobby is still gathering.
      if (this.phase !== 'select') return;
      c.ready = false;
      this.sendLobby();
      return;
    }
    if (!c.hero) {
      this.io.send(c.id, { t: 'error', text: 'Scegli prima un eroe.' });
      return;
    }
    c.ready = true;
    if (this.phase === 'select') {
      this.checkAllReady();
    } else {
      // Late arrival: the company is already in the tavern or in the field.
      this.spawn(c, undefined);
      if (this.phase === 'run') {
        this.world.events.push({ e: 'say', who: 'Carl', text: `${c.name} raggiunge la Compagnia.` });
        if (this.vote) this.vote.votes.set(c.id, '');
      }
    }
    this.sendLobby();
  }

  /** The whole lobby pressed "Conferma Pronto": everyone walks into the tavern together. */
  private checkAllReady(): void {
    if (this.phase !== 'select' || this.clients.size === 0) return;
    for (const c of this.clients.values()) if (!c.ready || !c.hero) return;
    this.phase = 'hub';
    this.loadHub();
  }

  /** Back to the Hero Selection screen from the tavern. */
  private reselect(c: Client): void {
    if (this.phase !== 'hub' || !c.ready) return;
    c.ready = false;
    this.world.removePlayer(c.id);
    this.sendLobby();
  }

  private spawn(c: Client, setup: PlayerSetup | undefined): void {
    if (!c.hero) return;
    this.world.removePlayer(c.id);
    this.world.addPlayer(c.id, c.hero, c.slot, { ...setup, tree: treeOf(c.profile, c.hero) });
    this.world.rtt.set(c.id, c.rtt);
    c.queue.length = 0;
    this.sendMine(c, []);
  }

  // ---------------------------------------------------------------- worlds

  /** New room, fresh foe ids: drop cached Jev answers before they latch onto the wrong body. */
  private openWorld(opts: WorldOpts): World {
    this.jev?.reset();
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return new World({ ...opts, seed: this.seed, jev: this.jev, quips: this.quips });
  }

  private announce(info: WorldInfo): void {
    this.info = info;
    this.transition = null;
    this.vote = null;
    for (const c of this.clients.values()) c.queue.length = 0;
    this.io.broadcast({ t: 'world', w: info });
    this.sendLobby();
  }

  private loadHub(): void {
    this.stage = null;
    this.streak = 0;
    this.log = [];
    this.world = this.openWorld({ layout: parseLayout(HUB_LAYOUT), seed: this.seed, safe: true });
    for (const c of this.clients.values()) {
      c.carried = emptyPurse();
      if (c.ready && this.phase !== 'select') this.spawn(c, undefined);
    }
    this.world.events.push({ e: 'say', who: 'Carl', text: HUB_LINES[this.wid % HUB_LINES.length]! });
    this.announce({
      wid: ++this.wid,
      kind: 'hub',
      layoutId: HUB_LAYOUT.id,
      title: HUB_LAYOUT.name,
      label: 'Hub',
      blurb: 'La tregua vale per tutti. Scegliete la rotta al Tavolo della Mappa.',
    });
  }

  /** Map Table: the Host starts a City from its checkpoint, or dares the Region Boss. */
  private startRun(target: string): void {
    const host = this.hostClient();
    if (this.phase !== 'hub' || !host) return;
    if (this.world.players.size === 0) return;
    let stage: Stage;
    if (target === 'boss') {
      if (!regionBossUnlocked(host.profile)) {
        this.io.send(host.id, { t: 'error', text: 'Il Leviatano si mostra solo a chi ha abbattuto i tre Boss di Città.' });
        return;
      }
      stage = { kind: 'regionBoss' };
    } else if (isCityId(target)) {
      if (!cityUnlocked(host.profile.cleared, target)) {
        const prev = CITY_IDS[CITY_IDS.indexOf(target) - 1]!;
        this.io.send(host.id, { t: 'error', text: `${CITIES[target].name} è sigillata: prima deve cadere ${CITIES[prev].name}.` });
        return;
      }
      stage = stageOf(target, checkpointOf(host.profile, target));
    } else {
      // Regions beyond the Costa Est stay sealed until the Region Boss falls.
      this.io.send(host.id, { t: 'error', text: 'Questa rotta è ancora sigillata.' });
      return;
    }
    this.phase = 'run';
    this.streak = 0;
    this.log = [];
    this.report = null;
    this.bounty = stage.kind === 'regionBoss' ? '' : host.profile.bounty;
    this.bountyState = 'open';
    for (const c of this.clients.values()) c.carried = emptyPurse();
    this.loadStage(stage, new Map());
  }

  private loadStage(stage: Stage, carry: Map<string, PlayerSetup>): void {
    this.stage = stage;
    this.world = this.openWorld({ layout: parseLayout(stageLayout(stage)), seed: this.seed, streak: this.streak });
    for (const c of this.clients.values()) {
      if (c.ready) this.spawn(c, carry.get(c.id));
    }
    const name = stageName(stage);
    this.world.events.push({ e: 'say', who: 'Carl', text: stageBlurb(stage) });
    const fervor = fervorBonus(this.streak);
    if (fervor > 0) {
      this.world.events.push({ e: 'hint', text: `Fervore: bottino +${Math.round(fervor * 100)}%` });
    }
    this.announce({
      wid: ++this.wid,
      kind: 'run',
      layoutId: stageLayout(stage).id,
      title: name,
      label: stageLabel(stage),
      blurb: stageBlurb(stage),
    });
  }

  /** What the company did in the current stage, for Eleonora. */
  private stageLog(cleared: boolean): StageLog {
    const out: StageLog = {
      index: this.stage ? stageIndex(this.stage) : 0,
      cleared,
      taken: 0,
      ults: 0,
      downs: 0,
      revives: 0,
      bossTime: this.world.bossDead ? this.world.bossDeadAt : Infinity,
    };
    for (const st of this.world.stats.values()) {
      out.taken += st.taken;
      out.ults += st.ults;
      out.downs += st.downs;
      out.revives += st.revives;
    }
    return out;
  }

  private judge(cleared: boolean): BountyVerdict {
    if (!this.bounty) return 'open';
    return judgeBounty(this.bounty, [...this.log, this.stageLog(cleared)]);
  }

  private collectStats(): Record<string, PlayerStats> {
    const out: Record<string, PlayerStats> = {};
    for (const [id, st] of this.world.stats) if (this.clients.has(id)) out[id] = { ...st };
    return out;
  }

  /** Clients whose heroes are in the field. */
  private party(): Client[] {
    return [...this.clients.values()].filter((c) => this.world.players.has(c.id));
  }

  // ---------------------------------------------------------------- choice terminal

  private openVote(by: string): void {
    const votes = new Map<string, VoteChoice | ''>();
    for (const c of this.party()) votes.set(c.id, '');
    this.vote = { by, votes };
    this.world.events.push({
      e: 'say',
      who: 'Carl',
      text: 'Il Portale è aperto. Tornate a casa col bottino, o andate avanti: ma decidete tutti insieme.',
    });
    this.sendLobby();
  }

  private castVote(c: Client, choice: string): void {
    if (!this.vote || !this.vote.votes.has(c.id)) return;
    if (choice !== 'extract' && choice !== 'continue' && choice !== '') return;
    this.vote.votes.set(c.id, choice);
    this.checkVote();
    this.sendLobby();
  }

  /** Unanimity, either way. Until then the terminal stays open. */
  private checkVote(): void {
    const vote = this.vote;
    if (!vote || !this.stage || this.stage.kind !== 'env') return;
    if (vote.votes.size === 0) {
      this.vote = null;
      this.world.reopenPortal();
      return;
    }
    const first = vote.votes.values().next().value ?? '';
    if (!first) return;
    for (const v of vote.votes.values()) if (v !== first) return;
    this.vote = null;
    if (first === 'extract') this.extract();
    else this.goOn();
  }

  /** B - Go on: wounds stay, buffs go, the Fervor grows. */
  private goOn(): void {
    const stage = this.stage;
    if (!stage || stage.kind !== 'env') return;
    this.log.push(this.stageLog(true));
    this.world.sweepDrops();
    const carry = new Map<string, PlayerSetup>();
    for (const c of this.party()) {
      c.carried = addPurse(c.carried, this.world.satchelOf(c.id));
      const p = this.world.players.get(c.id)!;
      const hp = p.act === Act.Downed ? p.maxHp * TUNING.carryDownedHp : p.hp;
      carry.set(c.id, { hp, ult: p.ult });
    }
    this.streak++;
    this.loadStage(stageOf(stage.city, stage.index + 1), carry);
  }

  /** A - Return to the hub: the satchel is banked and the City checkpoint is saved. */
  private extract(): void {
    const stage = this.stage;
    if (!stage || stage.kind !== 'env') return;
    this.finish('extract', (c) => {
      const next = stage.index + 1;
      const own = checkpointOf(c.profile, stage.city);
      c.profile.checkpoint[stage.city] = c.id === this.hostId ? next : Math.max(own, next);
    });
  }

  /** Banks the whole expedition for everyone in the field and goes home. */
  private finish(kind: ReportKind, each: (c: Client) => void): void {
    this.world.sweepDrops();
    const verdict = this.judge(true);
    const def = verdict === 'done' ? BOUNTY_BY_ID[this.bounty] : undefined;
    const report = this.newReport(kind);
    for (const c of this.party()) {
      const purse = addPurse(c.carried, this.world.satchelOf(c.id));
      if (def) {
        purse.threads += def.reward;
        c.profile.bountiesPaid++;
      }
      report.banked[c.id] = purse;
      this.bank(c, purse);
      each(c);
    }
    if (def) {
      report.bounty = def.id;
      report.bountyPaid = def.reward;
      const host = this.hostClient();
      if (host) host.profile.bounty = '';
    }
    this.endRun(report);
  }

  private newReport(kind: ReportKind): RunReport {
    return {
      n: ++this.reports,
      kind,
      label: this.stage ? stageLabel(this.stage) : '',
      banked: {},
      taxed: {},
      bounty: '',
      bountyPaid: 0,
      stats: this.collectStats(),
    };
  }

  /** Everyone at 0 HP: the Death Tax burns 30% of what was found in this stage only. */
  private wipe(): void {
    const stage = this.stage;
    if (!stage) return;
    const report = this.newReport('wipe');
    for (const c of this.party()) {
      const here = this.world.satchelOf(c.id);
      report.taxed[c.id] = deathTax(here);
      const purse = afterWipe(c.carried, here);
      report.banked[c.id] = purse;
      this.bank(c, purse);
      // The company restarts from the beginning of the stage it fell in.
      if (stage.kind !== 'regionBoss') {
        const at = stageIndex(stage);
        const own = checkpointOf(c.profile, stage.city);
        c.profile.checkpoint[stage.city] = c.id === this.hostId ? at : Math.max(own, at);
      }
    }
    this.endRun(report);
  }

  /** A City Boss or the Region Boss fell: there is nothing to vote, the company goes home rich. */
  private bossWin(): void {
    const stage = this.stage;
    if (!stage || stage.kind === 'env') return;
    if (stage.kind === 'cityBoss') {
      const city: CityId = stage.city;
      this.finish('city', (c) => {
        if (!c.profile.cleared.includes(city)) c.profile.cleared.push(city);
        c.profile.checkpoint[city] = 0;
      });
    } else {
      this.finish('region', (c) => {
        c.profile.regionCleared = true;
      });
    }
  }

  private endRun(report?: RunReport): void {
    if (report) this.report = report;
    this.phase = 'hub';
    this.bounty = '';
    for (const c of this.clients.values()) this.pushProfile(c);
    this.loadHub();
  }

  // ---------------------------------------------------------------- pings

  private mark(c: Client, kind: unknown, x: number, z: number): void {
    if (!this.world.players.has(c.id)) return;
    if (!PING_KINDS.includes(kind as PingKind) || !Number.isFinite(x) || !Number.isFinite(z)) return;
    if (this.clock - c.markAt < MARK_EVERY_MS) return;
    c.markAt = this.clock;
    this.world.events.push({ e: 'ping', by: c.id, kind: kind as PingKind, x, z });
  }

  // ---------------------------------------------------------------- lobby

  private sendLobby(): void {
    const host = this.hostClient();
    const stage = this.stage;
    const vote = this.vote;
    const s: LobbyState = {
      code: this.code,
      host: this.hostId,
      public: this.isPublic,
      phase: this.phase,
      players: [...this.clients.values()].map((c) => ({
        id: c.id,
        name: c.name,
        hero: c.hero,
        ready: c.ready,
        slot: c.slot,
        look: c.hero ? loadoutOf(c.profile, c.hero) : emptyLoadout(),
        title: COSMETIC_BY_ID[c.profile.title]?.text ?? '',
      })),
      table: {
        checkpoint: host ? { ...host.profile.checkpoint } : {},
        cleared: host ? [...host.profile.cleared] : [],
        regionBoss: host ? regionBossUnlocked(host.profile) : false,
        regionCleared: host?.profile.regionCleared ?? false,
        bounties: host ? bountiesUnlocked(host.profile) : false,
        bounty: host?.profile.bounty ?? '',
      },
      run:
        this.phase === 'run' && stage
          ? {
              stage,
              label: stageLabel(stage),
              name: stageName(stage),
              streak: this.streak,
              fervor: fervorBonus(this.streak),
              company: companyBonus(this.world.players.size),
              bounty: this.bounty,
              bountyState: this.bountyState,
            }
          : null,
      vote:
        vote && stage && stage.kind === 'env'
          ? {
              by: vote.by,
              votes: Object.fromEntries(vote.votes),
              next: stageLabel(stageOf(stage.city, stage.index + 1)),
              nextFervor: fervorBonus(this.streak + 1),
            }
          : null,
      report: this.report,
    };
    this.io.broadcast({ t: 'lobby', s });
  }

  private sendMine(c: Client, ev: GameEvent[]): void {
    const sat = this.phase === 'run' ? addPurse(c.carried, this.world.satchelOf(c.id)) : emptyPurse();
    this.io.send(c.id, { t: 'mine', ev, sat });
  }

  // ---------------------------------------------------------------- loop

  /** Freeze the simulation (solo menus). Wall-clock gaps are discarded on resume. */
  pause(): void {
    this.paused = true;
  }

  /** Resume after a pause; pass the current monotonic clock so catch-up is skipped. */
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
    world.clock = this.clock;
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
    // flow() may have swapped the world: snapshot whatever is current.
    this.publish();
  }

  private flow(): void {
    if (this.phase !== 'run' || !this.stage) return;
    const world = this.world;
    if (this.transition) {
      if (this.clock < this.transition.at) return;
      const to = this.transition.to;
      this.transition = null;
      if (to === 'wipe') this.wipe();
      else this.bossWin();
      return;
    }
    if (world.players.size > 0 && world.allDown()) {
      this.vote = null;
      world.events.push({ e: 'say', who: 'Carl', text: 'Tutti a terra. Vi riporto a casa: il mare si tiene la sua parte.' });
      this.transition = { at: this.clock + 2500, to: 'wipe' };
      this.sendLobby();
      return;
    }
    if (this.stage.kind !== 'env') {
      if (world.bossDead) this.transition = { at: this.clock + 4500, to: 'boss' };
    } else if (world.portalBy && !this.vote) {
      this.openVote(world.portalBy);
    }
    if (this.bounty && --this.judgeIn <= 0) {
      this.judgeIn = WORLD_HZ;
      const verdict = this.judge(false);
      // A contract is only "done" once the company is safely home.
      const shown: BountyVerdict = verdict === 'failed' ? 'failed' : 'open';
      if (shown !== this.bountyState) {
        this.bountyState = shown;
        this.sendLobby();
      }
    }
  }

  private publish(): void {
    const world = this.world;
    const all = world.drainEvents();
    const pub: GameEvent[] = [];
    const mine = new Map<string, GameEvent[]>();
    for (const ev of all) {
      if (!isPrivate(ev)) {
        pub.push(ev);
        continue;
      }
      const list = mine.get(ev.to);
      if (list) list.push(ev);
      else mine.set(ev.to, [ev]);
    }
    this.io.broadcast({ t: 'snap', s: this.snapshot(pub) });
    for (const [id, ev] of mine) {
      const c = this.clients.get(id);
      if (c) this.sendMine(c, ev);
    }
  }

  private snapshot(ev: GameEvent[]): Snapshot {
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
      ev,
      poi: world.pois.map((p) => p.state),
      flood: world.flood,
      syn: [...world.synergy],
      left: world.enemiesLeft(),
      time: Math.round(world.time * 10) / 10,
    };
  }
}
