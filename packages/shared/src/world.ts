/**
 * Authoritative simulation of one fixed map: an Environment, a boss arena or the hub.
 * Players, enemy AI, projectiles, zones, abilities, instanced loot and points of interest.
 * It is transport-agnostic: the server runs it, and the offline mode runs the very same code in the browser.
 *
 * Nothing here survives the map: momentum, Synergy buffs and auras die with the World,
 * which is how every Environment starts clean.
 */
import { INTERP_DELAY_MS, TICK_HZ, TUNING } from './constants';
import { MINIBOSS_ORB_HEAL, emptyPurse, rollDrops, type Purse } from './economy';
import { ENEMIES, isBossRank, type EnemyAttackDef, type EnemyDef } from './enemies';
import {
  canCommitAttack,
  chargeWindow,
  clusterCount,
  flankPoint,
  isBehind,
  familyOf,
  isolationOf,
  personaOf,
  pickAttackIndex,
  preyScore,
  retargetWindow,
  steerMode,
  familyWordIt,
  sufferRead,
  sufferSentence,
  sufferSentenceIt,
  tauntLine,
  type AttackFamily,
  type HunterView,
  type MindHint,
  type PreyView,
  type RoomOrder,
  type SufferRead,
} from './enemyMind';
import { jevEligible, legalAttackSnaps, type JevAdvisor, type RoomBrief } from './jevMind';
import type { QuipFacts, QuipWriter } from './quips';
import { HEROES, type AttackDef } from './heroes';
import { fairShare, partyAttackSlots, shadowSpawnCount, zergDamage } from './partyScale';
import {
  buildFlow,
  canStep,
  collide,
  flowDirection,
  highGroundMul,
  losClear,
  meleeHeightBlocked,
  nearestAtElevation,
  nearestFloor,
  sightBlocked,
  standElevation,
  type Layout,
  type Point,
} from './layout';
import { angleDiff, approachAngle, clamp, Rng, wrapAngle, yawOf } from './math';
import {
  addStatus,
  getStatus,
  hasStatus,
  isArmored,
  newPlayer,
  removeStatus,
  stepPlayer,
  type AllyLite,
  type EnemyLite,
  type PlayerEvent,
  type PoiLite,
  type StepCtx,
} from './player';
import {
  BLEED_DPS,
  NO_MODS,
  PUDDLE_DPS,
  REFLECT_FRACTION,
  REFLECT_GUARD,
  REFLECT_RANGE,
  abilityMods,
  abilitySheet,
  type AbilityMods,
  type AbilitySlot,
  type HeroTree,
} from './skillTree';
import { cooldownAccel, naturalArmor } from './stats';
import {
  Act,
  ES,
  EState,
  PS,
  type DropKind,
  type EnemyState,
  type EnemyTypeId,
  type GameEvent,
  type HeroId,
  type InputCmd,
  type PlayerState,
  type PoiKind,
  type Projectile,
  type Zone,
} from './types';

const T = (s: number): number => s * TICK_HZ;
const RAD = Math.PI / 180;

/** Ranged and magic heroes ignore the two-terrace melee cutoff. Their shots still stop on walls and higher ground. */
function ignoresMeleeHeight(hero: HeroId): boolean {
  return hero === 'rycard' || hero === 'gabryel' || hero === 'anthon';
}

/** Heroes whose basic attacks are spells: they ignore shield walls. Every Special and Ultimate is magic too. */
function castsMagic(hero: HeroId): boolean {
  return hero === 'gabryel' || hero === 'anthon';
}

const ACT_IT: Record<string, string> = {
  attack: 'attacca',
  heavy: 'carica un attacco pesante',
  charge: 'sta caricando',
  dodge: 'schiva',
  block: 'para',
  hitstun: 'barcolla dai colpi presi',
  ability: "usa l'abilità",
  ultimate: 'usa la suprema',
  execute: 'prova un’esecuzione',
  revive: 'sta rianimando un compagno',
  idle: 'sta fermo',
};
const RING_SPEED = 10;
const RING_MAX = 34;
const SPAWN_TIME = 1.1;
const CORPSE_TIME = 2.6;
/** No elevation is flooded. */
export const FLOOD_DRY = -3;
const DROP_MAGNET = 7;
const DROP_PICK = 1.3;
const DROP_SPEED = 15;

export interface PlayerStats {
  dmg: number;
  kills: number;
  taken: number;
  parries: number;
  dodges: number;
  revives: number;
  downs: number;
  execs: number;
  /** Distinctive ability uses. */
  casts: number;
  /** Ultimate uses. */
  ults: number;
  /** Healing done to allies (and self when credited). */
  heals: number;
}

/** Passive party buffs a Synergy Chest can grant. They last until the Environment ends. */
export const SYNERGY_BUFFS = [
  { id: 'regen', name: 'Linfa Condivisa', text: 'Tutta la Compagnia rigenera vita nel tempo.' },
  { id: 'might', name: 'Furore Corale', text: '+10% danni per tutta la Compagnia.' },
  { id: 'ward', name: 'Pelle di Scoglio', text: '−10% danni subiti per tutta la Compagnia.' },
  { id: 'haste', name: 'Vento in Poppa', text: 'Tutta la Compagnia si muove e colpisce più in fretta.' },
] as const;
export type SynergyId = (typeof SYNERGY_BUFFS)[number]['id'];

export function synergyInfo(id: string): { id: string; name: string; text: string } {
  return SYNERGY_BUFFS.find((b) => b.id === id) ?? { id, name: id, text: '' };
}

/** A point of interest. state: 0 locked, 1 ready, 2 used. */
export interface PoiState {
  id: number;
  kind: PoiKind;
  x: number;
  z: number;
  state: number;
}

/** Instanced loot: only `owner` sees it and only `owner` can pick it up. */
export interface Drop {
  id: number;
  owner: string;
  kind: DropKind;
  x: number;
  z: number;
  amount: number;
}

interface HitSpec {
  dmg: number;
  red: boolean;
  kb: number;
  /** Origin of the hit: used for facing checks and knockback direction. */
  ox: number;
  oz: number;
  /** Enemy that dealt it (0 = none). */
  src: number;
  slow?: number;
  /** Melee physical blow: Natural Armor and reflecting shields apply. Everything else is elemental or magic. */
  physical?: boolean;
  /** Harpoon: the hero is dragged to this spot when the hit lands. */
  hook?: Point;
  /** Re-checked when the lag grace expires: the hit misses if this returns false. */
  still?: (p: PlayerState) => boolean;
  /** Attack family, captured when the swing starts so a late hit still teaches the right lesson. */
  family?: AttackFamily;
  /**
   * The red or blue signal of this blow, in world seconds: it appeared at `start` and the blow
   * itself is released at `end`. A dodge pressed inside that span answers the alert. A parry does
   * too, except on a red attack, which is dodged or it lands.
   */
  alert?: { start: number; end: number };
}

interface PendingHit {
  pid: string;
  spec: HitSpec;
  until: number;
  /** Server clock (ms) of the strike, 0 when the player's client does not report what it shows. */
  at: number;
}

type HitResult = 'none' | 'dodged' | 'parried' | 'blocked' | 'hit' | 'pending';

/** What a hero brings into a map from the previous one. */
export interface PlayerSetup {
  /** Wounds persist between Environments. */
  hp?: number;
  ult?: number;
  /** Skill Tree nodes equipped on this hero. */
  tree?: HeroTree;
}

export interface WorldOpts {
  layout: Layout;
  seed: number;
  /** Safe area: nobody can be downed and nothing drops (the hub). */
  safe?: boolean;
  /** Consecutive Environments entered without saving: the Fervor loot multiplier. */
  streak?: number;
  /**
   * Optional Jev advisor. Absent (tests, no API key) the persona decides alone.
   * Peek is synchronous; the advisor never blocks a tick.
   */
  jev?: JevAdvisor;
  /** Optional lite model for one-line taunts. Absent: the written line is used at once. */
  quips?: QuipWriter;
}

const tmp: Point = { x: 0, z: 0 };

export class World {
  readonly layout: Layout;
  readonly rng: Rng;
  readonly safe: boolean;
  readonly streak: number;
  readonly jev?: JevAdvisor;
  readonly quips?: QuipWriter;
  time = 0;
  /** Host clock in ms, the same one snapshots carry. 0 when nothing drives it (tests, tools). */
  clock = 0;
  /** Latest server clock each player's client reported having on screen. */
  private seen = new Map<string, number>();
  /** World time (s) each enemy's current signal appeared. */
  private signals = new Map<number, number>();
  /** World time (s) of each hero's latest dodge and of the moment they raised their guard. */
  private reacted = new Map<string, { dodgeAt: number; blockAt: number }>();
  readonly players = new Map<string, PlayerState>();
  enemies: EnemyState[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  /** Feedback events produced since the last drain. */
  events: GameEvent[] = [];
  readonly stats = new Map<string, PlayerStats>();
  /** Round-trip time per player in ms, reported by the transport (drives lag forgiveness). */
  readonly rtt = new Map<string, number>();

  /** Chests, shrines and the Extraction Portal of this map. */
  readonly pois: PoiState[] = [];
  /** Instanced loot lying on the ground. */
  drops: Drop[] = [];
  /** What each hero picked up in this map. */
  readonly satchel = new Map<string, Purse>();
  /** Party buffs granted by Synergy Chests. */
  readonly synergy: SynergyId[] = [];
  /** Highest elevation under toxic water. */
  flood = FLOOD_DRY;
  /** The Mini-Boss or boss that closes this map (0 = none). */
  bossId = 0;
  bossDead = false;
  /** Seconds the boss fight has lasted once the boss is dead, measured from the map start. */
  bossDeadAt = 0;
  /** Set when a hero opens the Extraction Portal. The host starts the vote and clears it. */
  portalBy = '';

  private readonly mods = new Map<string, Record<AbilitySlot, AbilityMods>>();
  /** Damage each foe recently took from each hero: the aggro table. */
  private readonly threat = new Map<number, Map<string, number>>();
  private readonly furyIdle = new Map<string, number>();
  private readonly shadows: { type: EnemyTypeId; x: number; z: number; done: boolean }[] = [];
  /** Summoned foes never drop loot. */
  private readonly summoned = new Set<number>();
  private slowTick = 0;
  /** Heroes a toxic cloud already hurt during this step. */
  private readonly gassed = new Set<string>();
  private zergWarned = false;

  private pending: PendingHit[] = [];
  private nextId = 1;
  private readonly flows = new Map<string, { field: Int16Array; at: number }>();
  private lite: EnemyLite[] = [];
  private allies: AllyLite[] = [];
  private poiLite: PoiLite[] = [];
  /** First elite/boss of each type announces its counter-strategy. */
  private readonly seenPersona = new Set<EnemyTypeId>();
  /** Pre-placed foes. They patrol until a hero enters the vision cone. */
  private readonly garrison = new Set<number>();
  /** Recent hits on each hero: what landed, what they stopped. */
  private readonly suffer = new Map<string, { t: number; family: AttackFamily; landed: boolean }[]>();
  /** Colour of the swing this foe committed last. */
  private readonly lastSwing = new Map<number, 'blue' | 'red'>();
  private lastTauntKey = '';
  private lastTauntText = '';
  private lastTauntHero = '';
  private tauntN = 0;
  private lastTauntAt = -99;
  /** Holds the written line until a lite model answers, or the wait runs out. */
  private waitingQuip: { key: string; since: number; who: string; text: string; id: number; heroId: string } | null = null;
  private readonly ctx: StepCtx;
  private readonly pev: PlayerEvent[] = [];

  constructor(opts: WorldOpts) {
    this.layout = opts.layout;
    this.rng = new Rng(opts.seed);
    this.tauntN = Math.abs(opts.seed | 0);
    this.safe = !!opts.safe;
    this.streak = opts.streak ?? 0;
    this.jev = opts.jev;
    this.quips = opts.quips;
    this.ctx = { layout: this.layout, enemies: this.lite, allies: this.allies, pois: this.poiLite };
    for (const d of this.layout.dummySpawns) this.spawnEnemy('manichino', d.x, d.z);
    const boss = this.layout.def.roster?.boss;
    for (const g of this.layout.placed) {
      const e = this.spawnEnemy(g.type as EnemyTypeId, g.x, g.z);
      e.state = EState.Idle;
      e.yaw = g.yaw;
      e.t = 0;
      e.cool = this.rng.range(0.4, 1.8);
      this.garrison.add(e.id);
      if (g.type === boss) this.bossId = e.id;
    }
    for (const s of this.layout.shadows) this.shadows.push({ type: s.type as EnemyTypeId, x: s.x, z: s.z, done: false });
    for (const poi of this.layout.pois) {
      // The portal stays shut until the Mini-Boss falls.
      const locked = poi.kind === 'portal' && this.bossId !== 0;
      this.pois.push({ id: poi.id, kind: poi.kind, x: poi.x, z: poi.z, state: locked ? 0 : 1 });
    }
  }

  // ---------------------------------------------------------------- players

  addPlayer(id: string, hero: HeroId, slot: number, setup?: PlayerSetup): PlayerState {
    const spawns = this.layout.playerSpawns;
    const s = spawns[slot % spawns.length]!;
    const p = newPlayer(id, hero, s.x, s.z, yawOf(this.layout.center.x - s.x, this.layout.center.z - s.z));
    if (setup?.hp !== undefined) p.hp = clamp(setup.hp, 1, p.maxHp);
    if (setup?.ult !== undefined) p.ult = clamp(setup.ult, 0, 100);
    p.dmgMul = this.synergy.includes('might') ? 1.1 : 1;
    this.players.set(id, p);
    this.retune(id, setup?.tree);
    if (!this.satchel.has(id)) this.satchel.set(id, emptyPurse());
    if (!this.stats.has(id)) {
      this.stats.set(id, {
        dmg: 0,
        kills: 0,
        taken: 0,
        parries: 0,
        dodges: 0,
        revives: 0,
        downs: 0,
        execs: 0,
        casts: 0,
        ults: 0,
        heals: 0,
      });
    }
    return p;
  }

  /** Applies the Skill Tree nodes of a hero already in the map (Iej, in the hub). */
  retune(id: string, tree?: HeroTree): void {
    const p = this.players.get(id);
    if (!p) return;
    const mods = {
      e: tree ? abilityMods(tree.e) : NO_MODS,
      r: tree ? abilityMods(tree.r) : NO_MODS,
    };
    this.mods.set(id, mods);
    const accel = cooldownAccel(p.hero);
    p.cdMul = 1 / (accel * mods.e.haste);
    p.ultMul = accel * mods.r.haste;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.pending = this.pending.filter((h) => h.pid !== id);
    this.seen.delete(id);
    this.reacted.delete(id);
    this.mods.delete(id);
    this.furyIdle.delete(id);
    this.drops = this.drops.filter((d) => d.owner !== id);
  }

  private modsOf(p: PlayerState, slot: AbilitySlot): AbilityMods {
    return this.mods.get(p.id)?.[slot] ?? NO_MODS;
  }

  /** Gemme and Fili this hero picked up in this map. */
  satchelOf(id: string): Purse {
    return this.satchel.get(id) ?? emptyPurse();
  }

  alivePlayers(): PlayerState[] {
    const out: PlayerState[] = [];
    for (const p of this.players.values()) if (p.act !== Act.Downed) out.push(p);
    return out;
  }

  allDown(): boolean {
    if (this.players.size === 0) return false;
    for (const p of this.players.values()) if (p.act !== Act.Downed) return false;
    return true;
  }

  private graceFor(id: string): number {
    const rtt = this.rtt.get(id) ?? 0;
    return clamp(rtt + INTERP_DELAY_MS, TUNING.graceMinMs, TUNING.graceMaxMs) / 1000;
  }

  /** True while this player's commands keep telling us what their screen was showing. */
  private reportsView(id: string): boolean {
    const seen = this.seen.get(id);
    return seen !== undefined && this.clock > 0 && this.clock - seen < 600;
  }

  private refreshLite(): void {
    this.lite.length = 0;
    for (const e of this.enemies) {
      const def = ENEMIES[e.type];
      const alive = this.hittable(e) || e.state === EState.Special;
      this.lite.push({ id: e.id, x: e.x, z: e.z, r: def.radius, alive, broken: e.state === EState.Broken });
    }
    this.allies.length = 0;
    for (const p of this.players.values()) {
      this.allies.push({ id: p.id, x: p.x, z: p.z, downed: p.act === Act.Downed });
    }
    this.poiLite.length = 0;
    for (const poi of this.pois) {
      this.poiLite.push({ id: poi.id, kind: poi.kind, x: poi.x, z: poi.z, ready: poi.state === 1 });
    }
  }

  /** Applies one input command (one 60 Hz step) for a player and resolves what it caused. */
  applyCommand(id: string, cmd: InputCmd): void {
    const p = this.players.get(id);
    if (!p) return;
    if (cmd.vt && this.clock > 0) {
      // Nobody can have seen a strike the server has not sent yet.
      this.seen.set(id, Math.max(this.seen.get(id) ?? 0, Math.min(cmd.vt, this.clock)));
      // From here on the player is reacting to a strike they have already watched land.
      this.resolvePending(id);
    }
    this.refreshLite();
    const ev = this.pev;
    ev.length = 0;
    stepPlayer(p, cmd, this.ctx, ev);
    for (const e of ev) {
      switch (e.type) {
        case 'melee':
          this.playerMelee(p, e.heavy ? HEROES[p.hero].heavy : HEROES[p.hero].light[e.idx]!, e.heavy);
          break;
        case 'shoot':
          this.playerShoot(p, e.heavy ? HEROES[p.hero].heavy : HEROES[p.hero].light[e.idx]!, e.heavy);
          break;
        case 'ability':
          this.castAbility(p);
          break;
        case 'ult':
          this.castUlt(p);
          break;
        case 'execute':
          this.execute(p, e.target);
          break;
        case 'revive':
          this.revive(e.target, p);
          break;
        case 'poi':
          this.usePoi(p, e.poi);
          break;
        case 'dodge':
          this.noteReaction(id, 'dodge');
          this.lateDodge(p);
          if (p.hero === 'anthon' && p.blink) this.anthonTrail(p);
          break;
        case 'block':
          this.noteReaction(id, 'block');
          this.lateBlock(p);
          break;
      }
    }
  }

  // ---------------------------------------------------------------- hero attacks

  private chargeOf(p: PlayerState, heavy: boolean): { mult: number; full: boolean } {
    if (!heavy) return { mult: 1, full: false };
    return { mult: 1 + (TUNING.chargedDamage - 1) * p.charge, full: p.charge >= 1 };
  }

  /** True when the two-terrace rule stops a blow between this hero and this foe. */
  private heightStops(p: PlayerState, e: EnemyState): boolean {
    if (ignoresMeleeHeight(p.hero) || ENEMIES[e.type].towering) return false;
    return meleeHeightBlocked(this.layout, p.x, p.z, e.x, e.z);
  }

  private playerMelee(p: PlayerState, def: AttackDef, heavy: boolean): void {
    const { mult, full } = this.chargeOf(p, heavy);
    const magic = castsMagic(p.hero);
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let any = false;
    const strike = (e: EnemyState): boolean =>
      this.damageEnemy(e, def.dmg * mult, def.poise * mult, p, {
        kb: def.kb,
        heavy,
        effect: full ? def.charged : undefined,
        magic,
        basic: true,
      });

    if (def.aoe) {
      const ahead = def.aoeAhead ?? 0;
      const cx = p.x + fx * ahead;
      const cz = p.z + fz * ahead;
      const radius = def.aoe * (full && def.charged === 'slam' ? 1.35 : 1);
      for (const e of this.enemies) {
        if (!this.hittable(e) || this.heightStops(p, e)) continue;
        const d = Math.hypot(e.x - cx, e.z - cz) - ENEMIES[e.type].radius;
        if (d > radius + TUNING.lagPad) continue;
        any = strike(e) || any;
      }
      this.events.push({ e: 'fx', what: 'slam', x: cx, z: cz, r: radius });
    } else {
      const half = (def.arc / 2 + 12) * RAD;
      for (const e of this.enemies) {
        if (!this.hittable(e) || this.heightStops(p, e)) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz) - ENEMIES[e.type].radius;
        if (d > def.range + TUNING.lagPad) continue;
        if (def.arc < 360 && d > 0.8 && Math.abs(angleDiff(yawOf(dx, dz), p.yaw)) > half) continue;
        any = strike(e) || any;
      }
    }
    if (any) {
      removeStatus(p.st, PS.Counter);
      // Step into the hit: heavier heroes plant harder, lighter ones dart.
      const plant = TUNING.lungeOnHit * (0.65 + HEROES[p.hero].mass * 0.4) * (heavy ? 1.25 : 1);
      p.kx += fx * plant;
      p.kz += fz * plant;
    }
  }

  private aimPoint(p: PlayerState, ahead: number): Point {
    const e = this.enemies.find((x) => x.id === p.tgt && this.hittable(x));
    if (e) return { x: e.x, z: e.z };
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let d = ahead;
    const eye = standElevation(this.layout, p.x, p.z);
    while (d > 1 && sightBlocked(this.layout, p.x + fx * d, p.z + fz * d, eye)) d -= 1;
    return { x: p.x + fx * d, z: p.z + fz * d };
  }

  private playerShoot(p: PlayerState, def: AttackDef, heavy: boolean): void {
    const { mult, full } = this.chargeOf(p, heavy);
    if (!def.proj) {
      const at = this.aimPoint(p, 9);
      this.addZone('pull', at.x, at.z, full ? 6 : 4.5, 0.9, p.id, def.dmg * mult);
      return;
    }
    const proj = def.proj;
    const count = proj.count ?? 1;
    for (let i = 0; i < count; i++) {
      const a = p.yaw + (i - (count - 1) / 2) * 0.09;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      this.projectiles.push({
        id: this.nextId++,
        kind: proj.kind,
        x: p.x + dx * 0.9,
        z: p.z + dz * 0.9,
        dx,
        dz,
        speed: proj.speed,
        r: proj.r,
        dmg: def.dmg * mult,
        poise: def.poise * mult,
        owner: p.id,
        src: 0,
        ttl: proj.range / proj.speed,
        pierce: full && def.charged === 'pierce' ? 99 : (proj.pierce ?? 0),
        aoe: (proj.aoe ?? 0) * (full && def.charged === 'big' ? 1.45 : 1),
        red: false,
        effect: heavy ? 'heavy' : '',
        hit: [],
        eye: standElevation(this.layout, p.x, p.z),
      });
    }
  }

  private hittable(e: EnemyState): boolean {
    return e.state !== EState.Dead && e.state !== EState.Special && !hasStatus(e.st, ES.Burrow);
  }

  // ---------------------------------------------------------------- momentum

  /** Tier 0..4 of the momentum meter. */
  private furyTier(fury: number): number {
    let tier = 0;
    for (const at of TUNING.furyTiers) if (fury >= at) tier++;
    return tier;
  }

  /** Repeated hits, perfect dodges and elite kills feed the meter. */
  private feedFury(p: PlayerState, amount: number): void {
    if (this.safe) return;
    const before = this.furyTier(p.fury);
    // Fame eterna: Vyncent's blood runs hotter.
    p.fury = Math.min(TUNING.furyMax, p.fury + amount * (p.hero === 'vyncent' ? 1.25 : 1));
    this.furyIdle.set(p.id, 0);
    const after = this.furyTier(p.fury);
    if (after > before) this.events.push({ e: 'fury', id: p.id, tier: after });
  }

  private stepMomentum(dt: number): void {
    for (const p of this.players.values()) {
      if (p.act === Act.Downed) {
        p.fury = 0;
        continue;
      }
      const idle = (this.furyIdle.get(p.id) ?? 0) + dt;
      this.furyIdle.set(p.id, idle);
      if (idle > TUNING.furyHold) p.fury = Math.max(0, p.fury - TUNING.furyDecay * dt);
      const tier = this.furyTier(p.fury);
      const hold = T(0.3);
      if (tier >= 1) addStatus(p.st, PS.Frenzy, hold, 0);
      if (tier >= 2) addStatus(p.st, PS.Keen, hold, 0);
      if (tier >= 3) addStatus(p.st, PS.Surge, hold, 0);
      if (tier >= 4) {
        for (const a of this.alliesNear(p.x, p.z, TUNING.leechRange)) addStatus(a.st, PS.Leech, hold, 0);
      }
    }
  }

  /** Passive party buffs from Synergy Chests, refreshed while the map lasts. */
  private stepSynergy(): void {
    if (this.synergy.length === 0) return;
    const hold = T(0.3);
    for (const p of this.players.values()) {
      if (p.act === Act.Downed) continue;
      if (this.synergy.includes('regen')) addStatus(p.st, PS.Regen, hold, (p.maxHp || HEROES[p.hero].hp) * 0.012);
      if (this.synergy.includes('haste')) addStatus(p.st, PS.Haste, hold, 0.08);
    }
  }

  // ---------------------------------------------------------------- damage to enemies

  /** Applies damage from a hero (or from the world when `p` is null). Returns true if it landed. */
  damageEnemy(
    e: EnemyState,
    dmg: number,
    poise: number,
    p: PlayerState | null,
    opts: {
      kb?: number;
      heavy?: boolean;
      effect?: string;
      /** Exact damage: no multipliers, no crits. */
      raw?: boolean;
      crit?: number;
      /** Elemental or magic: ignores shield walls. */
      magic?: boolean;
      /** A basic attack connected: it feeds the momentum meter. */
      basic?: boolean;
    } = {},
  ): boolean {
    if (!this.hittable(e)) return false;
    const def = ENEMIES[e.type];
    let mul = 1;
    let crit = opts.crit ?? 0;
    if (p && !opts.raw) {
      const up = getStatus(p.st, PS.DmgUp);
      if (up) mul *= 1 + up.p;
      if (hasStatus(p.st, PS.Wolf)) mul *= 1.5;
      if (hasStatus(p.st, PS.Berserk)) mul *= 1.35;
      if (hasStatus(p.st, PS.Counter)) {
        mul *= TUNING.counterDamage;
        poise *= TUNING.counterPoise;
        crit = 2;
      }
      const toPlayer = yawOf(p.x - e.x, p.z - e.z);
      const facing = Math.abs(angleDiff(toPlayer, e.yaw));
      if (hasStatus(p.st, PS.Stealth)) {
        mul *= 2;
        crit = Math.max(crit, 1);
      } else if (p.hero === 'albereth' && facing > TUNING.backstabArc * RAD) {
        mul *= TUNING.alberethBackstabMul;
        crit = Math.max(crit, 1);
      }
      if (p.hero === 'rycard') {
        const dist = Math.hypot(p.x - e.x, p.z - e.z);
        if (dist > TUNING.rycardDistanceBonusStart) {
          const t = Math.min(1, (dist - TUNING.rycardDistanceBonusStart) / TUNING.rycardDistanceBonusSpan);
          mul *= 1 + TUNING.rycardDistanceBonusMax * t;
        }
      }
      if (p.hero === 'fabyorn') {
        const max = p.maxHp || HEROES.fabyorn.hp;
        if (max > 0 && p.hp / max <= TUNING.fabyornLowHp) mul *= TUNING.fabyornLowHpDmgMul;
      }
      mul *= this.kazaBondMul(p);
      // Critical hits: a base chance, raised by the second momentum tier.
      if (crit === 0) {
        const chance = TUNING.critBase + (hasStatus(p.st, PS.Keen) ? TUNING.critKeen : 0);
        if (this.rng.next() < chance) {
          mul *= TUNING.critMul;
          crit = 1;
        }
      }
      // Shield wall: frontal physical blows glance off. Flanks, spells and abilities do not.
      if (def.armor && !opts.magic && facing <= 75 * RAD && e.state !== EState.Broken) {
        mul *= 1 - def.armor;
        this.events.push({ e: 'fx', what: 'clang', x: e.x, z: e.z, r: 1 });
      }
      mul *= p.dmgMul || 1;
      mul *= highGroundMul(this.layout, p.x, p.z, e.x, e.z);
    }
    if (!opts.raw) {
      if (hasStatus(e.st, ES.Marked)) mul *= TUNING.markedDamageMul;
      if (hasStatus(e.st, ES.Frozen)) mul *= TUNING.frozenDamageMul;
      if (hasStatus(e.st, ES.Confused)) mul *= TUNING.confusedDamageMul;
      if (e.state === EState.Broken) mul *= TUNING.brokenDamageMul;
    }
    const amount = Math.max(1, Math.round(dmg * mul));
    e.hp -= amount;
    e.sinceHit = 0;
    if (def.dummy) e.hp = Math.max(1, e.hp);
    if (p) {
      e.lastHitBy = p.id;
      const st = this.stats.get(p.id);
      if (st) st.dmg += amount;
      let table = this.threat.get(e.id);
      if (!table) this.threat.set(e.id, (table = new Map()));
      table.set(p.id, (table.get(p.id) ?? 0) + amount);
      if (opts.basic) this.feedFury(p, TUNING.furyPerHit);
      if (p.hero === 'vyncent' && opts.basic) {
        const steal = hasStatus(p.st, PS.Wolf) ? 0.12 : TUNING.vyncentLifesteal;
        this.heal(p, amount * steal, false, p.id);
      }
      if (hasStatus(p.st, PS.Leech) && !opts.raw) this.heal(p, amount * TUNING.leechFraction, false, p.id);
      // A garrison that is hit wakes up, whoever did it and from wherever.
      if (e.state === EState.Idle && this.garrison.has(e.id)) this.wakeGarrison(e, p);
    }
    const kill = e.hp <= 0;
    this.events.push({
      e: 'hit',
      id: e.id,
      dmg: amount,
      by: p ? p.id : '',
      x: e.x,
      z: e.z,
      crit,
      kill,
      heavy: !!opts.heavy,
      kb: opts.kb ?? 0,
    });
    if (kill) {
      this.kill(e, p);
      return true;
    }

    if (opts.effect === 'freeze') this.freeze(e, 2.5);
    else if (opts.effect === 'confuse') this.confuse(e, 2.5);

    if (opts.heavy && hasStatus(e.st, ES.Frozen) && opts.effect !== 'freeze') removeStatus(e.st, ES.Frozen);

    if (e.state !== EState.Broken) {
      e.poise += poise;
      if (poise > 0) {
        this.events.push({ e: 'poise', id: e.id, dmg: Math.round(poise), x: e.x, z: e.z });
      }
      if (e.poise >= e.maxPoise) {
        this.breakEnemy(e);
      } else if (!def.steady && !hasStatus(e.st, ES.Frozen)) {
        const atk = def.attacks[e.atk];
        const armored = (e.state === EState.Windup && atk?.kind === 'red') || e.resolve > 0;
        if (!armored && poise > 0) {
          e.state = EState.Stagger;
          e.t = 0;
          e.n = opts.heavy ? 0.55 : 0.36;
          // Nobody can be pinned forever: after a few flinches in a row the enemy shrugs hits off.
          if (++e.flinches >= TUNING.flinchLimit) {
            e.flinches = 0;
            e.resolve = TUNING.resolveTime;
          }
        }
      }
    }
    // Broken enemies stay put so the execution can reach them.
    if (p && opts.kb && e.state !== EState.Broken) {
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const mass = HEROES[p.hero].mass;
      const resist = def.boss ? 0.15 : def.steady ? 0.5 : 1;
      const k = opts.kb * resist * TUNING.knockMul * (0.75 + mass * 0.35);
      e.kx += (dx / d) * k;
      e.kz += (dz / d) * k;
    }
    return true;
  }

  /**
   * Bosses shrug off crowd control for a while after each one that lands.
   * Returns false when the control is refused.
   */
  private control(e: EnemyState): boolean {
    const def = ENEMIES[e.type];
    if (!isBossRank(def)) return true;
    if (e.ward > 0) {
      this.events.push({ e: 'immune', id: e.id });
      return false;
    }
    e.ward = TUNING.ccWard;
    addStatus(e.st, ES.Ward, TUNING.ccWard, 0);
    return true;
  }

  private freeze(e: EnemyState, secs: number): void {
    const def = ENEMIES[e.type];
    if (!this.control(e)) return;
    if (def.boss) addStatus(e.st, ES.Slow, secs, 0.5);
    else addStatus(e.st, ES.Frozen, def.elite ? secs * 0.5 : secs, 0);
  }

  private confuse(e: EnemyState, secs: number): void {
    const def = ENEMIES[e.type];
    if (!this.control(e)) return;
    if (def.boss) {
      addStatus(e.st, ES.Slow, secs * 0.6, 0.4);
      return;
    }
    addStatus(e.st, ES.Confused, def.elite ? secs * 0.5 : secs, 0);
    if (e.state === EState.Windup) {
      e.state = EState.Chase;
      e.t = 0;
      e.cool = 1;
    }
    e.target = '';
  }

  private taunt(e: EnemyState, p: PlayerState, secs: number): void {
    if (ENEMIES[e.type].dummy || !this.control(e)) return;
    e.target = p.id;
    addStatus(e.st, ES.Taunted, secs, 0);
    if (e.state === EState.Idle && this.garrison.has(e.id)) this.aggro(e, p);
  }

  private silenceEnemy(e: EnemyState, secs: number): void {
    if (ENEMIES[e.type].dummy || !this.control(e)) return;
    addStatus(e.st, ES.Silenced, ENEMIES[e.type].elite ? secs * 0.5 : secs, 0);
  }

  private breakEnemy(e: EnemyState): void {
    e.state = EState.Broken;
    e.t = 0;
    e.poise = e.maxPoise;
    this.events.push({ e: 'broken', id: e.id });
  }

  private kill(e: EnemyState, p: PlayerState | null): void {
    const def = ENEMIES[e.type];
    e.hp = 0;
    e.state = EState.Dead;
    e.t = 0;
    e.st.length = 0;
    this.threat.delete(e.id);
    if (p) {
      const st = this.stats.get(p.id);
      if (st) st.kills++;
      if (def.elite) this.feedFury(p, TUNING.furyEliteKill);
    }
    if (def.burst) this.addZone('burst', e.x, e.z, 3, 0.9, '', def.burst);
    if (!this.safe && !def.dummy && !this.summoned.has(e.id)) this.dropLoot(e, def);
    this.summoned.delete(e.id);
    if (e.id === this.bossId) this.bossFell(e, def);
  }

  /** The boss of the map is dead: the portal opens and the survivors breathe. */
  private bossFell(e: EnemyState, def: EnemyDef): void {
    this.bossDead = true;
    this.bossDeadAt = this.time;
    this.flood = FLOOD_DRY;
    this.events.push({ e: 'flood', level: FLOOD_DRY });
    this.zones = this.zones.filter((z) => z.kind !== 'toxic' && z.kind !== 'shock' && z.kind !== 'silence');
    for (const o of this.enemies) {
      if (o.id !== e.id && this.summoned.has(o.id) && o.state !== EState.Dead) {
        o.hp = 0;
        o.state = EState.Dead;
        o.t = 0;
        o.st.length = 0;
      }
    }
    for (const poi of this.pois) {
      if (poi.kind !== 'portal' || poi.state !== 0) continue;
      poi.state = 1;
      this.events.push({ e: 'poi', id: poi.id, kind: poi.kind, state: 1, by: '' });
    }
    this.events.push({ e: 'clear' });
    this.events.push({ e: 'say', who: def.name, text: 'Sconfitto.' });
  }

  // ---------------------------------------------------------------- loot

  /** Every hero rolls a private drop: nobody sees or steals another's loot. */
  private dropLoot(e: EnemyState, def: EnemyDef): void {
    const humans = this.players.size;
    const heft = clamp((def.hp - 55) / 95, 0, 1);
    for (const p of this.players.values()) {
      const roll = rollDrops(def.rank, { humans, streak: this.streak, heft }, () => this.rng.next());
      if (roll.gems > 0) this.addDrop(p.id, 'gem', e.x, e.z, roll.gems);
      if (roll.threads > 0) this.addDrop(p.id, 'thread', e.x, e.z, roll.threads);
      // A Mini-Boss always leaves a healing orb for each hero.
      if (def.rank === 'mini') this.addDrop(p.id, 'orb', e.x, e.z, Math.round(MINIBOSS_ORB_HEAL * 100));
    }
  }

  private addDrop(owner: string, kind: DropKind, x: number, z: number, amount: number): void {
    const a = this.rng.range(0, Math.PI * 2);
    const at = nearestFloor(this.layout, x + Math.sin(a) * 1.4, z + Math.cos(a) * 1.4);
    const drop: Drop = { id: this.nextId++, owner, kind, x: at.x, z: at.z, amount };
    this.drops.push(drop);
    this.events.push({ e: 'drop', to: owner, id: drop.id, kind, x: drop.x, z: drop.z, amount });
  }

  private stepDrops(dt: number): void {
    if (this.drops.length === 0) return;
    const keep: Drop[] = [];
    for (const d of this.drops) {
      const p = this.players.get(d.owner);
      if (!p) continue;
      if (p.act === Act.Downed) {
        keep.push(d);
        continue;
      }
      const dx = p.x - d.x;
      const dz = p.z - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist > DROP_PICK) {
        if (dist < DROP_MAGNET) {
          const step = Math.min(dist, DROP_SPEED * dt);
          d.x += (dx / dist) * step;
          d.z += (dz / dist) * step;
        }
        keep.push(d);
        continue;
      }
      if (d.kind === 'orb') {
        this.heal(p, ((p.maxHp || HEROES[p.hero].hp) * d.amount) / 100, true, p.id);
      } else {
        const purse = this.satchel.get(p.id) ?? emptyPurse();
        if (d.kind === 'gem') purse.gems += d.amount;
        else purse.threads += d.amount;
        this.satchel.set(p.id, purse);
      }
      this.events.push({ e: 'take', to: p.id, id: d.id, kind: d.kind, amount: d.amount });
    }
    this.drops = keep;
  }

  /** The map is over and the company is leaving on its feet: nothing is left on the ground. */
  sweepDrops(): void {
    for (const d of this.drops) {
      if (d.kind === 'orb' || !this.players.has(d.owner)) continue;
      const purse = this.satchel.get(d.owner) ?? emptyPurse();
      if (d.kind === 'gem') purse.gems += d.amount;
      else purse.threads += d.amount;
      this.satchel.set(d.owner, purse);
      this.events.push({ e: 'take', to: d.owner, id: d.id, kind: d.kind, amount: d.amount });
    }
    this.drops = [];
  }

  // ---------------------------------------------------------------- points of interest

  private usePoi(p: PlayerState, id: number): void {
    const poi = this.pois.find((o) => o.id === id);
    if (!poi || poi.state !== 1) return;
    poi.state = 2;
    this.events.push({ e: 'poi', id: poi.id, kind: poi.kind, state: 2, by: p.id });
    if (poi.kind === 'chest') {
      const left = SYNERGY_BUFFS.filter((b) => !this.synergy.includes(b.id));
      const buff = left.length > 0 ? left[this.rng.int(left.length)]! : SYNERGY_BUFFS[0];
      if (!this.synergy.includes(buff.id)) this.synergy.push(buff.id);
      if (buff.id === 'might') for (const a of this.players.values()) a.dmgMul = 1.1;
      this.events.push({ e: 'synergy', buff: buff.id, by: p.id });
    } else if (poi.kind === 'shrine') {
      this.addZone('shrine', poi.x, poi.z, TUNING.shrineRadius, TUNING.shrineDuration, p.id, TUNING.shrineHeal);
      // The light gives the basin away: everything on the rims comes running.
      for (const e of this.enemies) {
        if (e.state !== EState.Idle || !this.garrison.has(e.id) || e.id === this.bossId) continue;
        if (Math.hypot(e.x - poi.x, e.z - poi.z) <= TUNING.garrisonAlert) this.aggro(e, p);
      }
    } else {
      this.portalBy = p.id;
    }
  }

  /** The vote was cancelled: the portal can be channelled again. */
  reopenPortal(): void {
    this.portalBy = '';
    for (const poi of this.pois) if (poi.kind === 'portal' && poi.state === 2) poi.state = 1;
  }

  /** Dormant spawn points pour extra bodies on the flanks of a large company. */
  private stepShadows(): void {
    const count = shadowSpawnCount(this.players.size);
    if (count === 0) return;
    for (const s of this.shadows) {
      if (s.done) continue;
      let seen: PlayerState | undefined;
      for (const p of this.players.values()) {
        if (p.act === Act.Downed) continue;
        if (Math.hypot(p.x - s.x, p.z - s.z) <= TUNING.shadowWake) {
          seen = p;
          break;
        }
      }
      if (!seen) continue;
      s.done = true;
      for (let i = 0; i < count; i++) {
        const at = nearestFloor(this.layout, s.x + this.rng.range(-1.2, 1.2), s.z + this.rng.range(-1.2, 1.2));
        const e = this.spawnEnemy(s.type, at.x, at.z);
        e.target = seen.id;
      }
    }
  }

  private execute(p: PlayerState, targetId: number): void {
    const e = this.enemies.find((x) => x.id === targetId);
    if (!e || e.state !== EState.Broken) return;
    const def = ENEMIES[e.type];
    if (Math.hypot(e.x - p.x, e.z - p.z) - def.radius > TUNING.executeRange + 2.5) return;
    const amount = def.boss
      ? e.maxHp * TUNING.executeBossFrac
      : def.elite
        ? e.maxHp * TUNING.executeEliteFrac
        : e.hp;
    const st = this.stats.get(p.id);
    if (st) st.execs++;
    p.ult = Math.min(100, p.ult + TUNING.ultExecute);
    this.heal(p, (p.maxHp || HEROES[p.hero].hp) * TUNING.executeHeal, false, p.id);
    this.events.push({ e: 'exec', id: e.id, by: p.id });
    this.damageEnemy(e, amount, 0, p, { raw: true, crit: 3 });
    if (e.state === EState.Broken) {
      e.state = EState.Stagger;
      e.t = 0;
      e.n = 1;
      e.poise = 0;
    }
  }

  /**
   * Dalìth and Anthon grew up in the same chaos. While both are on their feet
   * and within 9 m, each of their blows lands harder.
   */
  private kazaBondMul(p: PlayerState): number {
    const other = p.hero === 'dalith' ? 'anthon' : p.hero === 'anthon' ? 'dalith' : '';
    if (!other) return 1;
    for (const a of this.players.values()) {
      if (a.hero !== other || a.act === Act.Downed) continue;
      if (Math.hypot(a.x - p.x, a.z - p.z) <= 9) return 1.12;
    }
    return 1;
  }

  heal(p: PlayerState, amount: number, announce = true, byId?: string): void {
    if (p.act === Act.Downed || amount <= 0) return;
    const max = p.maxHp || HEROES[p.hero].hp;
    const before = p.hp;
    p.hp = Math.min(max, p.hp + amount);
    const gained = p.hp - before;
    if (gained >= 1 && byId) {
      const st = this.stats.get(byId);
      if (st) st.heals += gained;
    }
    if (announce && gained >= 1) this.events.push({ e: 'heal', id: p.id, amt: Math.round(gained) });
  }

  revive(targetId: string, by: PlayerState | null): void {
    const t = this.players.get(targetId);
    if (!t || t.act !== Act.Downed) return;
    t.act = Act.Idle;
    t.t = 0;
    t.hp = (t.maxHp || HEROES[t.hero].hp) * TUNING.reviveHp;
    t.stamina = t.maxStamina || HEROES[t.hero].stamina;
    t.iframes = T(TUNING.reviveInvuln);
    if (by) {
      const st = this.stats.get(by.id);
      if (st) st.revives++;
    }
    this.events.push({ e: 'revive', id: t.id, by: by ? by.id : '' });
  }

  // ---------------------------------------------------------------- abilities

  private enemiesNear(x: number, z: number, r: number): EnemyState[] {
    return this.enemies.filter((e) => this.hittable(e) && Math.hypot(e.x - x, e.z - z) - ENEMIES[e.type].radius <= r);
  }

  private alliesNear(x: number, z: number, r: number, includeDowned = false): PlayerState[] {
    const out: PlayerState[] = [];
    for (const a of this.players.values()) {
      if (!includeDowned && a.act === Act.Downed) continue;
      if (Math.hypot(a.x - x, a.z - z) <= r) out.push(a);
    }
    return out;
  }

  /** What the equipped Skill Tree node adds once the Special or the Ultimate has landed. */
  private aftermath(p: PlayerState, m: AbilityMods, x: number, z: number, r: number): void {
    if (m.puddle > 0) this.addZone('ember', x, z, Math.max(3, r * 0.55), m.puddle, p.id, PUDDLE_DPS);
    if (m.bleed > 0 || m.silence > 0) {
      for (const e of this.enemiesNear(x, z, Math.max(3, r))) {
        if (m.bleed > 0) addStatus(e.st, ES.Bleed, m.bleed, BLEED_DPS);
        if (m.silence > 0) this.silenceEnemy(e, m.silence);
      }
    }
    if (m.reflect > 0) {
      for (const a of this.alliesNear(p.x, p.z, REFLECT_RANGE)) addStatus(a.st, PS.Reflect, T(m.reflect), 0);
      this.events.push({ e: 'fx', what: 'reflect', x: p.x, z: p.z, r: REFLECT_RANGE });
    }
  }

  private castAbility(p: PlayerState): void {
    const st = this.stats.get(p.id);
    if (st) st.casts++;
    const id = HEROES[p.hero].ability.id;
    const m = this.modsOf(p, 'e');
    const sheet = abilitySheet(id);
    const R = sheet.radius * m.area;
    const D = sheet.dmg * m.power;
    const magic = true;
    let cx = p.x;
    let cz = p.z;
    const cast = (what: string, r: number, x = p.x, z = p.z) =>
      this.events.push({ e: 'cast', id: p.id, what, x, z, yaw: p.yaw, r });
    switch (id) {
      case 'ocarina': {
        for (const e of this.enemiesNear(p.x, p.z, R)) this.confuse(e, 5);
        cast(id, R);
        break;
      }
      case 'canto': {
        for (const a of this.alliesNear(p.x, p.z, R)) {
          addStatus(a.st, PS.Regen, T(4), (HEROES[a.hero].hp * (sheet.heal ?? 0) * m.power) / 4);
          removeStatus(a.st, PS.Slow);
        }
        cast(id, R);
        break;
      }
      case 'balzo': {
        for (const e of this.enemiesNear(p.x, p.z, R)) this.damageEnemy(e, D, 26, p, { kb: 5, heavy: true, magic });
        removeStatus(p.st, PS.Counter);
        cast(id, R);
        break;
      }
      case 'provocazione': {
        for (const e of this.enemiesNear(p.x, p.z, R)) this.taunt(e, p, 5);
        addStatus(p.st, PS.Guard, T(5), 0.45);
        cast(id, R);
        break;
      }
      case 'marchio': {
        const e = this.enemies.find((x) => x.id === p.tgt && this.hittable(x));
        const at = e ? { x: e.x, z: e.z } : this.aimPoint(p, sheet.range);
        for (const o of this.enemiesNear(at.x, at.z, R)) addStatus(o.st, ES.Marked, 9, 0);
        if (e) this.damageEnemy(e, D, 10, p, { kb: 1, magic });
        cx = at.x;
        cz = at.z;
        cast(id, R, at.x, at.z);
        break;
      }
      case 'gelo': {
        const half = 45 * RAD;
        for (const e of this.enemiesNear(p.x, p.z, R)) {
          const a = Math.abs(angleDiff(yawOf(e.x - p.x, e.z - p.z), p.yaw));
          if (a > half && Math.hypot(e.x - p.x, e.z - p.z) > 1.5) continue;
          if (this.damageEnemy(e, D, 20, p, { kb: 2, magic }) && e.state !== EState.Dead) this.freeze(e, 3);
        }
        removeStatus(p.st, PS.Counter);
        cast(id, R);
        break;
      }
      case 'bolla': {
        this.addZone('bubble', p.x, p.z, R, 9, p.id, 0);
        cast(id, R);
        break;
      }
      case 'ondata': {
        const roll = this.rng.int(5);
        const area = m.area;
        if (roll === 0) {
          for (const e of this.enemiesNear(p.x, p.z, 6 * area)) this.damageEnemy(e, D, 30, p, { kb: 6, heavy: true, magic });
        } else if (roll === 1) {
          const near = this.enemiesNear(p.x, p.z, 14 * area)
            .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
            .slice(0, 5);
          for (const e of near) {
            this.events.push({ e: 'fx', what: 'bolt', x: e.x, z: e.z, r: 1 });
            this.damageEnemy(e, D * 0.66, 22, p, { kb: 1, heavy: true, magic });
          }
        } else if (roll === 2) {
          for (const e of this.enemiesNear(p.x, p.z, R)) this.freeze(e, 2.5);
        } else if (roll === 3) {
          for (const a of this.alliesNear(p.x, p.z, 10 * area)) {
            this.heal(a, (a.maxHp || HEROES[a.hero].hp) * 0.2 * m.power, true, p.id);
          }
        } else {
          for (const e of this.enemiesNear(p.x, p.z, 8 * area)) {
            this.damageEnemy(e, D * 0.53, 10, p, { kb: 3, magic });
            if (e.state !== EState.Dead) this.confuse(e, 4);
          }
          if (!this.safe) p.hp = Math.max(1, p.hp - 8);
        }
        removeStatus(p.st, PS.Counter);
        cast(`ondata_${roll}`, (roll === 1 ? 14 : roll === 3 ? 10 : 7) * area);
        break;
      }
      case 'danza': {
        for (const e of this.enemiesNear(p.x, p.z, R)) {
          this.confuse(e, 4);
          addStatus(e.st, ES.Marked, 7, 0);
        }
        addStatus(p.st, PS.Haste, T(4), 0.18);
        cast(id, R);
        break;
      }
    }
    this.aftermath(p, m, cx, cz, R);
  }

  private castUlt(p: PlayerState): void {
    const st = this.stats.get(p.id);
    if (st) st.ults++;
    const id = HEROES[p.hero].ult.id;
    const m = this.modsOf(p, 'r');
    const sheet = abilitySheet(id);
    const R = sheet.radius * m.area;
    const D = sheet.dmg * m.power;
    const healFrac = (sheet.heal ?? 0) * m.power;
    const magic = true;
    let cx = p.x;
    let cz = p.z;
    const cast = (r: number, x = p.x, z = p.z) =>
      this.events.push({ e: 'cast', id: p.id, what: id, x, z, yaw: p.yaw, r });
    switch (id) {
      case 'ombra': {
        addStatus(p.st, PS.Stealth, T(7), 0);
        for (const e of this.enemies) {
          if (e.target === p.id && !ENEMIES[e.type].dummy) {
            e.target = '';
            e.retarget = 0;
          }
        }
        cast(R);
        break;
      }
      case 'ballata': {
        for (const a of this.alliesNear(p.x, p.z, R, true)) {
          if (a.act === Act.Downed) this.revive(a.id, p);
          this.heal(a, (a.maxHp || HEROES[a.hero].hp) * healFrac, true, p.id);
          addStatus(a.st, PS.DmgUp, T(10), 0.3);
          addStatus(a.st, PS.Haste, T(10), 0.15);
        }
        cast(R);
        break;
      }
      case 'licantropo': {
        addStatus(p.st, PS.Wolf, T(12), 0);
        this.heal(p, (p.maxHp || HEROES[p.hero].hp) * healFrac, true, p.id);
        cast(R);
        break;
      }
      case 'sisma': {
        for (const e of this.enemiesNear(p.x, p.z, R)) this.damageEnemy(e, D, 65, p, { kb: 10, heavy: true, magic });
        cast(R);
        break;
      }
      case 'pioggia': {
        const at = this.aimPoint(p, sheet.range);
        this.addZone('rain', at.x, at.z, R, 5, p.id, (sheet.tick ?? 10) * m.power);
        cx = at.x;
        cz = at.z;
        cast(R, at.x, at.z);
        break;
      }
      case 'furia': {
        addStatus(p.st, PS.Berserk, T(10), 0);
        cast(R);
        break;
      }
      case 'chiavistello': {
        for (const a of this.players.values()) {
          if (a.act === Act.Downed) continue;
          this.heal(a, (a.maxHp || HEROES[a.hero].hp) * healFrac, true, p.id);
          removeStatus(a.st, PS.Silence);
          removeStatus(a.st, PS.Slow);
        }
        this.zones = this.zones.filter((z) => !(z.kind === 'silence' && Math.hypot(z.x - p.x, z.z - p.z) <= 18));
        for (const e of this.enemiesNear(p.x, p.z, R)) this.damageEnemy(e, D, 60, p, { kb: 8, heavy: true, magic });
        cast(R);
        break;
      }
      case 'collasso': {
        const at = this.aimPoint(p, sheet.range);
        this.addZone('blackhole', at.x, at.z, R, 4, p.id, D);
        cx = at.x;
        cz = at.z;
        cast(R, at.x, at.z);
        break;
      }
      case 'spirale': {
        for (const e of this.enemiesNear(p.x, p.z, R)) {
          this.damageEnemy(e, D, 28, p, { kb: 5, heavy: true, magic });
          if (e.state !== EState.Dead) {
            this.confuse(e, 5);
            addStatus(e.st, ES.Marked, 8, 0);
          }
        }
        for (const a of this.alliesNear(p.x, p.z, R + 1)) {
          addStatus(a.st, PS.Haste, T(a.id === p.id ? 5 : 4), a.id === p.id ? 0.2 : 0.1);
        }
        cast(R);
        break;
      }
    }
    this.aftermath(p, m, cx, cz, R);
  }

  addZone(kind: string, x: number, z: number, r: number, dur: number, owner: string, power: number): Zone {
    const zone: Zone = { id: this.nextId++, kind, x, z, r, t: 0, dur, owner, power, tick: 0.5, hit: [] };
    this.zones.push(zone);
    return zone;
  }

  // ---------------------------------------------------------------- hits on players

  /**
   * Where a hit volume should look for this hero. A hero who has just started dodging is tested
   * at the spot the dodge began, so slipping out of an attack at the last instant is rewarded
   * as a perfect dodge instead of silently missing.
   */
  private hitPos(p: PlayerState, out: Point): Point {
    out.x = p.x;
    out.z = p.z;
    if (p.act === Act.Dodge && p.t <= T(TUNING.perfectDodge)) {
      const d = HEROES[p.hero].dodge;
      const blinkDist = d.kind === 'blink' ? d.dist : d.teleport?.dist ?? d.dist;
      const dur = p.blink ? (d.kind === 'blink' ? d.dur : (d.teleport?.dur ?? d.dur)) : d.dur;
      const u = clamp(p.t / T(dur), 0, 1);
      const travelled = p.blink ? blinkDist : d.dist * (1 - (1 - u) * (1 - u));
      out.x -= p.dx * travelled;
      out.z -= p.dz * travelled;
    }
    return out;
  }

  /** Remember that this hero just dodged or raised their guard, and when. */
  private noteReaction(id: string, kind: 'dodge' | 'block'): void {
    const r = this.reacted.get(id) ?? { dodgeAt: -1, blockAt: -1 };
    r[kind === 'dodge' ? 'dodgeAt' : 'blockAt'] = this.time;
    this.reacted.set(id, r);
  }

  /** When the red or blue signal of this enemy's current attack appeared. */
  private signalOf(e: EnemyState): number {
    const known = this.signals.get(e.id);
    if (known !== undefined) return known;
    const start = this.time - e.t;
    this.signals.set(e.id, start);
    return start;
  }

  /**
   * The signal is an alert, not the attack. It covers the whole wind-up and ends the instant the
   * blow is released. A dodge pressed in that span answers it. A parry does too, but never for a
   * red attack: red is dodged, or it deals damage.
   */
  private alertWindow(e: EnemyState): { start: number; end: number } {
    return { start: this.signalOf(e), end: this.time };
  }

  /** Which defense, if any, this hero committed while the signal was up and before the blow. */
  private answerToSignal(p: PlayerState, spec: HitSpec): 'dodge' | 'parry' | null {
    const a = spec.alert;
    if (!a) return null;
    const r = this.reacted.get(p.id);
    if (!r) return null;
    const dodge = r.dodgeAt >= a.start && r.dodgeAt <= a.end;
    // Red stays unparryable. Answering its signal with the guard does not turn the blow into a parry.
    const parry = !spec.red && r.blockAt >= a.start && r.blockAt <= a.end;
    if (dodge && (!parry || r.dodgeAt >= r.blockAt)) return 'dodge';
    if (parry) return 'parry';
    return null;
  }

  private tryHitPlayer(p: PlayerState, spec: HitSpec): HitResult {
    if (p.act === Act.Downed) return 'none';
    // Answering the alert beats the blow: the attack had not started yet. Red answers only to a dodge.
    const answered = this.answerToSignal(p, spec);
    if (answered === 'dodge') {
      this.perfectDodge(p);
      this.markSuffer(p.id, spec, false);
      return 'dodged';
    }
    if (answered === 'parry') {
      this.parry(p, spec);
      return 'parried';
    }
    if (p.iframes > 0) {
      if (p.act === Act.Dodge && p.t <= T(TUNING.perfectDodge)) this.perfectDodge(p);
      this.markSuffer(p.id, spec, false);
      return 'dodged';
    }
    if (p.hero === 'albereth' && this.rng.next() < TUNING.alberethElusion) {
      this.events.push({ e: 'fx', what: 'elusion', x: p.x, z: p.z, r: 1.2 });
      this.markSuffer(p.id, spec, false);
      return 'dodged';
    }
    if (p.act === Act.Block && this.canGuard(p, spec, true)) {
      if (!spec.red && p.t <= T(TUNING.perfectParry)) {
        this.parry(p, spec);
        return 'parried';
      }
      this.block(p, spec);
      return 'blocked';
    }
    const view = this.reportsView(p.id);
    const grace = view ? TUNING.graceViewMaxMs / 1000 : this.graceFor(p.id);
    this.pending.push({ pid: p.id, spec, until: this.time + grace, at: view ? this.clock : 0 });
    return 'pending';
  }

  /** Anthon blink arrival: brief chaos burst around the landing spot. */
  private anthonTrail(p: PlayerState): void {
    for (const e of this.enemiesNear(p.x, p.z, TUNING.anthonTrailR)) {
      this.damageEnemy(e, TUNING.anthonTrailDmg, TUNING.anthonTrailPoise, p, { kb: 2, magic: true });
    }
    this.events.push({ e: 'fx', what: 'trail_chaos', x: p.x, z: p.z, r: TUNING.anthonTrailR });
  }

  private canGuard(p: PlayerState, spec: HitSpec, checkFacing: boolean): boolean {
    if (spec.red && !HEROES[p.hero].block.blocksRed) return false;
    if (!checkFacing) return true;
    const toOrigin = yawOf(spec.ox - p.x, spec.oz - p.z);
    return Math.abs(angleDiff(toOrigin, p.yaw)) <= (TUNING.blockArc / 2) * RAD;
  }

  /** A dodge that reaches the server just after the hit still counts: the player pressed in time on their screen. */
  private lateDodge(p: PlayerState): void {
    let any = false;
    this.pending = this.pending.filter((h) => {
      if (h.pid !== p.id) return true;
      any = true;
      return false;
    });
    if (any) this.perfectDodge(p);
  }

  private lateBlock(p: PlayerState): void {
    const keep: PendingHit[] = [];
    for (const h of this.pending) {
      if (h.pid !== p.id || !this.canGuard(p, h.spec, false)) {
        keep.push(h);
        continue;
      }
      if (h.spec.red) this.block(p, h.spec);
      else this.parry(p, h.spec);
    }
    this.pending = keep;
  }

  private perfectDodge(p: PlayerState): void {
    if (p.rewarded) return;
    p.rewarded = 1;
    const hero = HEROES[p.hero];
    p.stamina = Math.min(hero.stamina, p.stamina + 15);
    p.ult = Math.min(100, p.ult + TUNING.ultPerfectDodge);
    this.feedFury(p, TUNING.furyPerfectDodge);
    p.iframes = Math.max(p.iframes, T(0.2));
    addStatus(p.st, PS.Counter, T(TUNING.counterDuration), 0);
    const st = this.stats.get(p.id);
    if (st) st.dodges++;
    this.events.push({ e: 'pdodge', id: p.id, x: p.x, z: p.z });
  }

  private parry(p: PlayerState, spec: HitSpec): void {
    const hero = HEROES[p.hero];
    p.stamina = Math.min(p.maxStamina || hero.stamina, p.stamina + 18);
    p.ult = Math.min(100, p.ult + TUNING.ultPerfectParry);
    p.iframes = Math.max(p.iframes, T(0.3));
    addStatus(p.st, PS.Counter, T(TUNING.counterDuration), 0);
    const st = this.stats.get(p.id);
    if (st) st.parries++;
    this.events.push({ e: 'parry', id: p.id, x: p.x, z: p.z, enemy: spec.src });
    this.markSuffer(p.id, spec, false);
    if (p.hero === 'jusef') {
      for (const a of this.alliesNear(p.x, p.z, 12)) this.heal(a, 7, true, p.id);
    }
    const e = this.enemies.find((x) => x.id === spec.src);
    if (e && this.hittable(e) && e.state !== EState.Broken) {
      const def = ENEMIES[e.type];
      e.poise += def.elite ? 38 : 30;
      e.sinceHit = 0;
      if (e.poise >= e.maxPoise) this.breakEnemy(e);
      else if (!def.boss) {
        e.state = EState.Stagger;
        e.t = 0;
        e.n = 0.95;
      }
    }
  }

  private block(p: PlayerState, spec: HitSpec): void {
    const hero = HEROES[p.hero];
    const b = hero.block;
    const reduction = spec.red ? 0.7 : b.reduction;
    const chip = Math.round(spec.dmg * (1 - reduction));
    p.stamina -= spec.dmg * b.stamPerDmg * (spec.red ? 1.6 : 1);
    p.stamDelay = T(TUNING.staminaDelay);
    if (chip > 0) {
      p.hp = Math.max(1, p.hp - chip);
      const st = this.stats.get(p.id);
      if (st) st.taken += chip;
    }
    this.markSuffer(p.id, spec, false);
    this.events.push({ e: 'block', id: p.id, x: p.x, z: p.z });
    if (p.stamina <= 0) {
      p.stamina = 0;
      p.act = Act.Hit;
      p.t = 0;
      p.charge = TUNING.guardBreakStun;
      p.buf = 0;
      this.events.push({ e: 'gbreak', id: p.id });
    }
    this.knock(p, spec, 0.35);
  }

  /**
   * Applies knock velocity with wall slams, breakable props and pinball chains.
   * Collision is solved after the free move so slamming into stone reads as a real impact.
   */
  private slideEnemy(e: EnemyState, def: EnemyDef, dt: number): void {
    const feet = standElevation(this.layout, e.x, e.z);
    const speed = Math.hypot(e.kx, e.kz);
    e.x += e.kx * dt;
    e.z += e.kz * dt;

    // Breakables are resolved on the free position so collide() cannot push the body out first.
    if (speed > TUNING.smashMin) {
      for (const prop of this.layout.props) {
        if (prop.r <= 0) continue;
        if (prop.kind !== 'barrels' && prop.kind !== 'crates' && prop.kind !== 'keg') continue;
        if (Math.hypot(e.x - prop.x, e.z - prop.z) > prop.r + def.radius + 0.2) continue;
        prop.r = 0;
        e.kx *= 0.72;
        e.kz *= 0.72;
        e.poise = Math.min(e.maxPoise, e.poise + 14);
        this.events.push({ e: 'smash', x: prop.x, z: prop.z, kind: prop.kind });
        if (e.poise >= e.maxPoise && e.state !== EState.Broken) this.breakEnemy(e);
        break;
      }
    }

    const out = { x: e.x, z: e.z };
    collide(this.layout, e.x, e.z, def.radius, out, feet);
    const pushX = out.x - e.x;
    const pushZ = out.z - e.z;
    const pushed = Math.hypot(pushX, pushZ);
    e.x = out.x;
    e.z = out.z;

    if (speed > TUNING.wallSlamMin && pushed > 0.02) {
      // Bounce off the wall and spend some of the remaining stagger budget.
      const nx = pushX / pushed;
      const nz = pushZ / pushed;
      const along = e.kx * nx + e.kz * nz;
      e.kx -= nx * along * 1.7;
      e.kz -= nz * along * 1.7;
      e.poise = Math.min(e.maxPoise, e.poise + speed * 1.8);
      this.events.push({ e: 'slam', x: e.x, z: e.z, power: speed });
      if (e.poise >= e.maxPoise && e.state !== EState.Broken) this.breakEnemy(e);
    }

    if (speed > 3.2) {
      for (const o of this.enemies) {
        if (o === e || !this.hittable(o)) continue;
        const dx = o.x - e.x;
        const dz = o.z - e.z;
        const d = Math.hypot(dx, dz);
        const min = def.radius + ENEMIES[o.type].radius;
        if (d >= min || d < 1e-3) continue;
        const nx = dx / d;
        const nz = dz / d;
        const transfer = speed * TUNING.chainKb;
        o.kx += nx * transfer;
        o.kz += nz * transfer;
        e.kx *= 0.62;
        e.kz *= 0.62;
        e.x = o.x - nx * min;
        e.z = o.z - nz * min;
        this.events.push({ e: 'fx', what: 'clash', x: (e.x + o.x) * 0.5, z: (e.z + o.z) * 0.5, r: 1.6 });
        break;
      }
    }

    e.kx *= TUNING.knockDecayEnemy;
    e.kz *= TUNING.knockDecayEnemy;
    if (Math.abs(e.kx) + Math.abs(e.kz) < 0.1) {
      e.kx = 0;
      e.kz = 0;
    }
  }

  private knock(p: PlayerState, spec: HitSpec, scale: number): void {
    const dx = p.x - spec.ox;
    const dz = p.z - spec.oz;
    const d = Math.hypot(dx, dz) || 1;
    const mass = HEROES[p.hero].mass;
    const impulse = (spec.kb * TUNING.knockMul * scale) / Math.max(0.55, mass);
    p.kx = (dx / d) * impulse;
    p.kz = (dz / d) * impulse;
  }

  private applyHit(p: PlayerState, spec: HitSpec): void {
    let ax = spec.ox;
    let az = spec.oz;
    const src = spec.src ? this.enemies.find((e) => e.id === spec.src) : undefined;
    if (src) {
      ax = src.x;
      az = src.z;
    }
    let dmg = spec.dmg * TUNING.threatMul * highGroundMul(this.layout, ax, az, p.x, p.z);
    // Natural Armor only turns steel: spells, poison and fire go straight through.
    if (spec.physical) dmg *= 1 - naturalArmor(p.hero);
    const guard = getStatus(p.st, PS.Guard);
    if (guard) dmg *= 1 - guard.p;
    if (hasStatus(p.st, PS.Bubble)) dmg *= 0.5;
    if (this.synergy.includes('ward')) dmg *= 0.9;
    if (p.hero === 'fabyorn') {
      const max = p.maxHp || HEROES.fabyorn.hp;
      if (max > 0 && p.hp / max <= TUNING.fabyornLowHp) dmg *= TUNING.fabyornLowHpTakenMul;
    }
    if (spec.physical && hasStatus(p.st, PS.Reflect)) {
      if (src && this.hittable(src)) this.damageEnemy(src, Math.max(1, dmg * REFLECT_FRACTION), 6, p, { raw: true });
      dmg *= 1 - REFLECT_GUARD;
    }
    const amount = Math.max(1, Math.round(dmg));
    p.hp -= amount;
    if (this.safe) p.hp = Math.max(1, p.hp);
    p.stamDelay = T(TUNING.staminaDelay);
    const st = this.stats.get(p.id);
    if (st) st.taken += amount;
    this.events.push({ e: 'phit', id: p.id, dmg: amount, x: p.x, z: p.z, red: spec.red });
    this.markSuffer(p.id, spec, true);
    if (p.hp <= 0) {
      this.down(p);
      return;
    }
    if (spec.slow) addStatus(p.st, PS.Slow, T(spec.slow), 0.4);
    p.iframes = Math.max(p.iframes, T(TUNING.hitInvuln));
    // A channel is defenceless: any blow breaks it, even for heroes that never flinch.
    if (isArmored(p, spec.red) && p.act !== Act.Channel && !spec.hook) {
      this.knock(p, spec, 0.25);
    } else {
      p.act = Act.Hit;
      p.t = 0;
      p.charge = 0;
      p.combo = 0;
      p.buf = 0;
      this.knock(p, spec, 1);
    }
    if (spec.hook) {
      p.x = spec.hook.x;
      p.z = spec.hook.z;
      p.kx = 0;
      p.kz = 0;
      this.events.push({ e: 'hook', id: p.id, x: p.x, z: p.z });
    }
  }

  /** Damage that does not stagger: poison clouds, toxic water. Always elemental. */
  private hurt(p: PlayerState, amount: number): void {
    if (p.act === Act.Downed || amount <= 0) return;
    let dmg = amount;
    if (hasStatus(p.st, PS.Bubble)) dmg *= 0.5;
    if (this.synergy.includes('ward')) dmg *= 0.9;
    const whole = Math.max(1, Math.round(dmg));
    p.hp -= whole;
    if (this.safe) p.hp = Math.max(1, p.hp);
    const st = this.stats.get(p.id);
    if (st) st.taken += whole;
    this.events.push({ e: 'phit', id: p.id, dmg: whole, x: p.x, z: p.z, red: false });
    if (p.act === Act.Channel) {
      p.act = Act.Hit;
      p.t = 0;
      p.charge = 0;
    }
    if (p.hp <= 0) this.down(p);
  }

  private down(p: PlayerState): void {
    p.hp = 0;
    p.act = Act.Downed;
    p.t = 0;
    p.st.length = 0;
    p.buf = 0;
    p.kx = 0;
    p.kz = 0;
    p.iframes = 0;
    const st = this.stats.get(p.id);
    if (st) st.downs++;
    this.events.push({ e: 'down', id: p.id });
  }

  /**
   * Lands the hits whose forgiveness has run out: the wait expired, or the player's own commands
   * show they had already watched the strike land. `only` limits it to one player.
   */
  private resolvePending(only?: string): void {
    if (this.pending.length === 0) return;
    const keep: PendingHit[] = [];
    const list = this.pending;
    // applyHit may queue new hits (reflections, chains): collect them in a fresh list.
    this.pending = [];
    for (const h of list) {
      const watched = h.at > 0 && (this.seen.get(h.pid) ?? 0) > h.at + TUNING.viewLeniencyMs;
      if ((only !== undefined && h.pid !== only) || (h.until > this.time && !watched)) {
        keep.push(h);
        continue;
      }
      const p = this.players.get(h.pid);
      if (!p || p.act === Act.Downed) continue;
      if (p.iframes > 0) continue;
      if (h.spec.still && !h.spec.still(p)) continue;
      this.applyHit(p, h.spec);
    }
    this.pending = keep.concat(this.pending);
  }

  // ---------------------------------------------------------------- enemies

  spawnEnemy(type: EnemyTypeId, x: number, z: number): EnemyState {
    const def = ENEMIES[type];
    // No damage sponges: an enemy has the same vitals for one hero or for nine.
    const hp = Math.round(def.hp * (def.dummy ? 1 : TUNING.hpMul));
    const c = this.layout.center;
    const e: EnemyState = {
      id: this.nextId++,
      type,
      x,
      z,
      yaw: yawOf(c.x - x, c.z - z),
      kx: 0,
      kz: 0,
      hp,
      maxHp: hp,
      poise: 0,
      maxPoise: def.poise,
      state: def.dummy ? EState.Idle : EState.Spawn,
      t: 0,
      atk: 0,
      target: '',
      ax: x,
      az: z,
      st: [],
      cool: this.rng.range(0.6, 2),
      sinceHit: 99,
      side: this.rng.chance(0.5) ? 1 : -1,
      retarget: 0,
      lastHitBy: '',
      struck: 0,
      phase: 0,
      n: 0,
      flinches: 0,
      resolve: 0,
      ward: 0,
      zerg: 2,
    };
    this.enemies.push(e);
    this.events.push({ e: 'spawn', id: e.id });
    return e;
  }

  /** The first elite or boss of each kind that joins the fight explains how to beat it. */
  private announce(e: EnemyState): void {
    const def = ENEMIES[e.type];
    if (!(def.elite || def.boss || def.bar) || this.seenPersona.has(e.type)) return;
    this.seenPersona.add(e.type);
    const tip = personaOf(e.type).strategy;
    if (tip) this.events.push({ e: 'hint', text: tip });
  }

  private flowTo(p: PlayerState): Int16Array {
    let f = this.flows.get(p.id);
    if (!f) {
      f = { field: buildFlow(this.layout, p.x, p.z), at: this.time };
      this.flows.set(p.id, f);
    } else if (this.time - f.at > 0.4) {
      buildFlow(this.layout, p.x, p.z, f.field);
      f.at = this.time;
    }
    return f.field;
  }

  private asPrey(p: PlayerState): PreyView {
    return {
      id: p.id,
      hero: p.hero,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      hp: p.hp,
      maxHp: p.maxHp || HEROES[p.hero].hp,
      act: p.act,
      iframes: p.iframes,
    };
  }

  private asHunter(e: EnemyState): HunterView {
    return {
      id: e.id,
      type: e.type,
      x: e.x,
      z: e.z,
      yaw: e.yaw,
      target: e.target,
      lastHitBy: e.lastHitBy,
      atk: e.atk,
      cool: e.cool,
      phase: e.phase,
    };
  }

  private alivePrey(): PreyView[] {
    const out: PreyView[] = [];
    for (const p of this.players.values()) {
      if (p.act === Act.Downed || hasStatus(p.st, PS.Stealth)) continue;
      out.push(this.asPrey(p));
    }
    return out;
  }

  /** Jev's latest answer, shaped for the persona. Null fields leave that choice to the mind. */
  private mindHint(e: EnemyState): MindHint | undefined {
    const advice = this.jev?.peek(e.id, this.time);
    if (!advice) return undefined;
    return { attackId: advice.attackId, wait: advice.wait, targetId: advice.targetId, steer: advice.steer };
  }

  private threatOf(e: EnemyState, id: string): number {
    return this.threat.get(e.id)?.get(id) ?? 0;
  }

  private pickTarget(e: EnemyState): PlayerState | undefined {
    const current = this.players.get(e.target);
    const valid = (p: PlayerState | undefined): p is PlayerState =>
      !!p && p.act !== Act.Downed && !hasStatus(p.st, PS.Stealth);
    if (hasStatus(e.st, ES.Taunted) && valid(current)) return current;
    const hint = this.mindHint(e);
    const order = this.roomOrder();
    if (!hint?.targetId && !order?.focusId && valid(current) && e.retarget > 0) return current;
    const persona = personaOf(e.type);
    e.retarget = retargetWindow(persona.mind) + this.rng.next() * 0.4;
    const party = this.alivePrey();
    const pack: HunterView[] = [];
    const crowd = new Map<string, number>();
    let awake = 1;
    for (const o of this.enemies) {
      if (o.id === e.id || o.state === EState.Dead) continue;
      pack.push(this.asHunter(o));
      if (!o.target || o.state === EState.Idle) continue;
      awake++;
      crowd.set(o.target, (crowd.get(o.target) ?? 0) + 1);
    }
    // Aggro fragmentation: the pack splits over the company instead of mobbing one hero.
    const share = fairShare(awake, party.length);
    const hunter = this.asHunter(e);
    let best: PlayerState | undefined;
    let bestScore = Infinity;
    for (const p of this.players.values()) {
      if (!valid(p)) continue;
      const social = { threat: this.threatOf(e, p.id), crowd: crowd.get(p.id) ?? 0, share };
      const score = preyScore(persona, hunter, this.asPrey(p), pack, party, hint, order ?? undefined, social);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    e.target = best ? best.id : '';
    return best;
  }

  /** Enemies currently committed to attacking this player. */
  private attackersOn(id: string, ranged: boolean): number {
    let n = 0;
    for (const o of this.enemies) {
      if (o.target !== id || o.state !== EState.Windup) continue;
      if (ENEMIES[o.type].ranged === ranged) n++;
    }
    return n;
  }

  private chooseAttack(e: EnemyState, def: EnemyDef, d: number, target: PlayerState): number {
    const persona = personaOf(e.type);
    const prey = this.asPrey(target);
    const party = this.alivePrey();
    const idx = pickAttackIndex(
      persona.mind,
      def.attacks,
      e.phase,
      d,
      {
        dist: d,
        blocking: target.act === Act.Block,
        dodging: target.act === Act.Dodge || target.iframes > 0,
        attacking: target.act === Act.Attack || target.act === Act.Heavy || target.act === Act.Charge,
        clustered: clusterCount(prey, party),
        behind: isBehind(e, prey),
        lastKind: this.lastSwing.get(e.id) ?? '',
        suffer: def.elite || def.boss || def.bar || this.roomOrder()?.punish ? this.sufferFor(target.id) : undefined,
      },
      e.atk,
      this.rng.next(),
      this.mindHint(e),
    );
    // A silenced foe is left with plain steel: no specials, no shots.
    const atk = idx >= 0 ? def.attacks[idx] : undefined;
    if (atk && (atk.special || atk.proj) && hasStatus(e.st, ES.Silenced)) return -1;
    return idx;
  }

  private beginAttack(e: EnemyState, def: EnemyDef, idx: number, target: PlayerState): void {
    const atk = def.attacks[idx]!;
    e.state = EState.Windup;
    e.t = 0;
    e.atk = idx;
    e.struck = 0;
    e.n = atk.special === 'rings' ? 1 + e.phase : 1 + (atk.extraHits ?? 0);
    if (atk.special === 'teleport') {
      const bx = target.x - Math.sin(target.yaw) * 2.4;
      const bz = target.z - Math.cos(target.yaw) * 2.4;
      const at = nearestFloor(this.layout, bx, bz);
      collide(this.layout, at.x, at.z, def.radius, tmp);
      this.events.push({ e: 'fx', what: 'vanish', x: e.x, z: e.z, r: 1 });
      e.x = tmp.x;
      e.z = tmp.z;
      this.events.push({ e: 'fx', what: 'appear', x: e.x, z: e.z, r: 1 });
    }
    e.yaw = yawOf(target.x - e.x, target.z - e.z);
    this.lastSwing.set(e.id, atk.kind);
    this.signals.set(e.id, this.time);
    this.setAim(e, def, atk, target);
  }

  /** How far a lunging swing may still carry its owner toward the target. */
  private lungeRoom(e: EnemyState, def: EnemyDef, target: PlayerState | undefined, want: number): number {
    if (!target) return want;
    const gap = Math.hypot(target.x - e.x, target.z - e.z) - def.radius - TUNING.playerRadius - 0.3;
    return Math.max(0, Math.min(want, gap));
  }

  /**
   * Where the attack will land. A slam aims at a spot on the ground; a swing aims at the place
   * its owner will be standing when it lands, so the warning on the floor already includes the
   * lunge instead of jumping forward with it at the last instant.
   */
  private setAim(e: EnemyState, def: EnemyDef, atk: EnemyAttackDef, target: PlayerState | undefined): void {
    if (!atk.aoe) {
      const left = atk.lunge * clamp((atk.windup - e.t) / TUNING.enemyCommit, 0, 1);
      const room = left > 0 ? this.lungeRoom(e, def, target, left) : 0;
      e.ax = e.x + Math.sin(e.yaw) * room;
      e.az = e.z + Math.cos(e.yaw) * room;
      return;
    }
    if (!target) return;
    const dx = target.x - e.x;
    const dz = target.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const reach = Math.min(d, atk.aoeRange ?? d);
    e.ax = e.x + (dx / d) * reach;
    e.az = e.z + (dz / d) * reach;
  }

  /** Random points around a foe, or the map's spawn doors when it has them. */
  private summonPoint(e: EnemyState): Point {
    if (this.layout.def.rows.some((row) => row.includes('E'))) {
      const s = this.rng.pick(this.layout.enemySpawns);
      return nearestFloor(this.layout, s.x + this.rng.range(-1, 1), s.z + this.rng.range(-1, 1));
    }
    const a = this.rng.range(0, Math.PI * 2);
    const d = ENEMIES[e.type].radius + this.rng.range(3.5, 6);
    return nearestFloor(this.layout, e.x + Math.sin(a) * d, e.z + Math.cos(a) * d);
  }

  private summon(e: EnemyState, def: EnemyDef, count: number): void {
    const kinds = def.summons;
    if (!kinds || kinds.length === 0) return;
    // Density, not sponges: a hard cap keeps the arena readable.
    const alive = this.enemies.filter((o) => o.state !== EState.Dead && this.summoned.has(o.id)).length;
    const room = Math.max(0, 6 + this.players.size - alive);
    for (let i = 0; i < Math.min(count, room); i++) {
      const at = this.summonPoint(e);
      const minion = this.spawnEnemy(kinds[i % kinds.length]!, at.x, at.z);
      this.summoned.add(minion.id);
    }
  }

  /** Where a harpooned hero ends up: the nearest elevation-0 ground beside the harpooner. */
  private hookSpot(e: EnemyState, def: EnemyDef): Point {
    const at = nearestAtElevation(this.layout, e.x, e.z, 0, def.radius + 1.2);
    if (at && Math.hypot(at.x - e.x, at.z - e.z) < 14) return at;
    return nearestFloor(this.layout, e.x + Math.sin(e.yaw) * (def.radius + 1.6), e.z + Math.cos(e.yaw) * (def.radius + 1.6));
  }

  private strike(e: EnemyState, def: EnemyDef, atk: EnemyAttackDef): void {
    const red = atk.kind === 'red';
    if (atk.special === 'rings') {
      const ring = this.addZone('ring', e.x, e.z, 0, RING_MAX / RING_SPEED, '', atk.dmg);
      ring.alert = this.alertWindow(e);
      this.events.push({ e: 'ecast', id: e.id, what: 'drum', x: e.x, z: e.z, r: 0 });
      return;
    }
    if (atk.special === 'silence') {
      const alive = this.alivePlayers();
      for (let i = 0; i < 3 && alive.length > 0; i++) {
        const p = alive.splice(this.rng.int(alive.length), 1)[0]!;
        this.addZone('silence', p.x, p.z, 6, 10, '', 0);
      }
      this.events.push({ e: 'ecast', id: e.id, what: 'silence', x: e.x, z: e.z, r: 6 });
      return;
    }
    if (atk.special === 'spores') {
      // Persistent toxic clouds: they stay where the heroes were standing.
      const alive = this.alivePlayers();
      const clouds = Math.min(alive.length, 2 + e.phase + Math.floor(this.players.size / 4));
      for (let i = 0; i < clouds && alive.length > 0; i++) {
        const p = alive.splice(this.rng.int(alive.length), 1)[0]!;
        this.addZone('toxic', p.x, p.z, 4, 9, '', 7);
      }
      this.events.push({ e: 'ecast', id: e.id, what: 'spores', x: e.x, z: e.z, r: 4 });
      return;
    }
    if (atk.special === 'summon') {
      this.summon(e, def, 2 + Math.floor(this.players.size / 3));
      this.events.push({ e: 'ecast', id: e.id, what: 'summon', x: e.x, z: e.z, r: 4 });
      return;
    }
    if (atk.proj) {
      const alert = this.alertWindow(e);
      const count = atk.proj.count ?? 1;
      for (let i = 0; i < count; i++) {
        const a = e.yaw + (i - (count - 1) / 2) * 0.22;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        this.projectiles.push({
          id: this.nextId++,
          kind: atk.proj.kind,
          x: e.x + dx * (def.radius + 0.4),
          z: e.z + dz * (def.radius + 0.4),
          dx,
          dz,
          speed: atk.proj.speed,
          r: atk.proj.r,
          dmg: atk.dmg,
          poise: 0,
          owner: '',
          src: e.id,
          ttl: atk.proj.range / atk.proj.speed,
          pierce: 0,
          aoe: 0,
          red,
          effect: atk.special === 'harpoon' ? 'harpoon' : '',
          hit: [],
          eye: this.eyeOf(e, def),
          alertStart: alert.start,
          alertEnd: alert.end,
        });
      }
      return;
    }
    const ox = e.x;
    const oz = e.z;
    const alert = this.alertWindow(e);
    const pad = TUNING.enemyHitPad;
    const physical = !atk.magic;
    const stops = (x: number, z: number): boolean => !def.towering && meleeHeightBlocked(this.layout, e.x, e.z, x, z);
    if (atk.aoe) {
      const cx = e.ax;
      const cz = e.az;
      const r = atk.aoe;
      this.events.push({ e: 'ecast', id: e.id, what: 'slam', x: cx, z: cz, r });
      for (const p of this.players.values()) {
        const at = this.hitPos(p, tmp);
        if (stops(at.x, at.z)) continue;
        if (Math.hypot(at.x - cx, at.z - cz) > r + pad) continue;
        this.tryHitPlayer(p, {
          dmg: atk.dmg,
          red,
          kb: atk.kb,
          ox: cx,
          oz: cz,
          src: e.id,
          family: familyOf(atk),
          slow: atk.slow,
          physical,
          // Same radius as the strike — walking out of the slam must cancel the pending hit.
          still: (q) => Math.hypot(q.x - cx, q.z - cz) <= r + pad,
          alert,
        });
      }
      return;
    }
    const half = (atk.arc / 2) * RAD;
    const yaw = e.yaw;
    const inMelee = (x: number, z: number): boolean => {
      const dx = x - ox;
      const dz = z - oz;
      const d = Math.hypot(dx, dz);
      if (d > atk.reach + pad) return false;
      if (atk.arc < 360 && d > def.radius + 0.55 && Math.abs(angleDiff(yawOf(dx, dz), yaw)) > half) return false;
      return true;
    };
    for (const p of this.players.values()) {
      const at = this.hitPos(p, tmp);
      if (stops(at.x, at.z)) continue;
      if (!inMelee(at.x, at.z)) continue;
      this.tryHitPlayer(p, {
        dmg: atk.dmg,
        red,
        kb: atk.kb,
        ox,
        oz,
        src: e.id,
        family: familyOf(atk),
        slow: atk.slow,
        physical,
        // Re-check the exact swing volume after lag forgiveness.
        still: (q) => inMelee(q.x, q.z),
        alert,
      });
    }
  }

  /** Eye level for line of sight: a towering foe looks over every terrace. */
  private eyeOf(e: EnemyState, def: EnemyDef): number {
    return def.towering ? 2 : standElevation(this.layout, e.x, e.z);
  }

  private moveEnemy(e: EnemyState, def: EnemyDef, dx: number, dz: number, speed: number, dt: number): void {
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const feet = standElevation(this.layout, e.x, e.z);
    const nx = e.x + (dx / d) * speed * dt;
    const nz = e.z + (dz / d) * speed * dt;
    collide(this.layout, nx, nz, def.radius, tmp, feet);
    e.x = tmp.x;
    e.z = tmp.z;
  }

  /** Idle garrison: walk a short beat, then turn when the next terrace is illegal or the beat ends. */
  private patrol(e: EnemyState, def: EnemyDef, dt: number): void {
    const fx = Math.sin(e.yaw);
    const fz = Math.cos(e.yaw);
    const aheadX = e.x + fx * (def.radius + 0.35);
    const aheadZ = e.z + fz * (def.radius + 0.35);
    const feet = standElevation(this.layout, e.x, e.z);
    const blocked = !canStep(feet, standElevation(this.layout, aheadX, aheadZ));
    e.cool -= dt;
    if (blocked || e.cool <= 0) {
      e.yaw = wrapAngle(e.yaw + e.side * (Math.PI / 2));
      e.cool = 1.8;
      return;
    }
    this.moveEnemy(e, def, fx, fz, Math.max(0.8, def.speed * 0.35), dt);
  }

  /** First hero inside the facing cone with a clear line of sight, or none. */
  private spotHero(e: EnemyState): PlayerState | undefined {
    const eye = this.eyeOf(e, ENEMIES[e.type]);
    let best: PlayerState | undefined;
    let bestD: number = TUNING.garrisonVision;
    for (const p of this.players.values()) {
      if (p.act === Act.Downed || hasStatus(p.st, PS.Stealth)) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestD) continue;
      if (Math.abs(angleDiff(yawOf(dx, dz), e.yaw)) > TUNING.garrisonCone) continue;
      if (!losClear(this.layout, e.x, e.z, p.x, p.z, eye)) continue;
      best = p;
      bestD = dist;
    }
    return best;
  }

  private aggro(e: EnemyState, seen: PlayerState): void {
    this.announce(e);
    e.target = seen.id;
    e.state = EState.Chase;
    e.t = 0;
    e.retarget = 0.45;
  }

  /** The spotter and every idle ally close enough to hear the shout join the chase. */
  private wakeGarrison(spotter: EnemyState, seen: PlayerState): void {
    this.aggro(spotter, seen);
    for (const other of this.enemies) {
      if (other.id === spotter.id || other.state !== EState.Idle || !this.garrison.has(other.id)) continue;
      if (Math.hypot(other.x - spotter.x, other.z - spotter.z) > TUNING.garrisonAlert) continue;
      this.aggro(other, seen);
    }
  }

  private actLabel(act: number): string {
    switch (act) {
      case Act.Attack:
        return 'attack';
      case Act.Heavy:
        return 'heavy';
      case Act.Charge:
        return 'charge';
      case Act.Dodge:
        return 'dodge';
      case Act.Block:
        return 'block';
      case Act.Hit:
        return 'hitstun';
      case Act.Ability:
        return 'ability';
      case Act.Ult:
        return 'ultimate';
      case Act.Execute:
        return 'execute';
      case Act.Revive:
        return 'revive';
      case Act.Channel:
        return 'channel';
      default:
        return 'idle';
    }
  }

  private markSuffer(id: string, spec: HitSpec, landed: boolean): void {
    if (!spec.src || !spec.family) return;
    const list = this.suffer.get(id) ?? [];
    list.push({ t: this.time, family: spec.family, landed });
    const fresh = list.filter((mark) => this.time - mark.t <= 16).slice(-12);
    this.suffer.set(id, fresh);
  }

  private sufferFor(id: string): SufferRead | undefined {
    const personal = sufferRead((this.suffer.get(id) ?? []).filter((mark) => this.time - mark.t <= 6));
    if (personal.family || personal.resisted) return personal;
    const punish = this.roomOrder()?.punish;
    if (punish && punish !== 'mix') return { family: punish, resisted: '' };
    return undefined;
  }

  private roomOrder(): RoomOrder | null {
    return this.jev?.peekRoom?.(this.time) ?? null;
  }

  /** One picture of the fight. Jev answers for the room; grunts spend nothing on their own. */
  private noteCaptain(): void {
    if (!this.jev?.noteRoom || this.safe) return;
    const party = this.alivePrey().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (party.length === 0) return;
    const living = this.enemies.filter((e) => e.state !== EState.Dead && !ENEMIES[e.type].dummy);
    if (living.length === 0) return;
    const heroes = party.slice(0, 9).map((prey, i) => {
      const read = sufferRead((this.suffer.get(prey.id) ?? []).filter((mark) => this.time - mark.t <= 6));
      return {
        alias: `h${i}`,
        id: prey.id,
        hero: prey.hero,
        archetype: HEROES[prey.hero].archetype,
        hpFrac: prey.maxHp > 0 ? prey.hp / prey.maxHp : 1,
        act: this.actLabel(prey.act),
        isolated: isolationOf(prey, party) > 5,
        suffers: sufferSentence(prey.hero, read),
        read,
      };
    });
    const elites = living
      .filter((e) => jevEligible(ENEMIES[e.type]))
      .slice(0, 3)
      .map((e) => {
        const target = this.players.get(e.target);
        const dist = target ? Math.hypot(target.x - e.x, target.z - e.z) : 4;
        return {
          enemyId: e.id,
          type: e.type,
          name: ENEMIES[e.type].name,
          attacks: legalAttackSnaps(ENEMIES[e.type].attacks, e.phase, dist),
        };
      });
    const brief: RoomBrief = { heroes, elites };
    this.jev.noteRoom(brief);
  }

  /**
   * Anti-zerg: a boss that finds the company bunched up answers with a radial shockwave.
   * The more heroes it catches, the harder each of them is hit.
   */
  private antiZerg(e: EnemyState, def: EnemyDef, dt: number): void {
    e.zerg -= dt;
    if (e.zerg > 0) return;
    e.zerg = 0.5;
    const alive = this.alivePlayers();
    if (alive.length < TUNING.zergCount) return;
    const blast = (x: number, z: number, r: number, n: number, windup: number): void => {
      this.addZone('shock', x, z, r, windup, '', zergDamage(TUNING.zergBase, n));
      this.events.push({ e: 'ecast', id: e.id, what: 'shock', x, z, r });
      e.zerg = TUNING.zergCooldown;
      if (!this.zergWarned) {
        this.zergWarned = true;
        this.events.push({ e: 'hint', text: "Troppi eroi ammassati: il boss risponde con un'onda d'urto. Sparpagliatevi." });
      }
    };
    // Around the boss itself.
    const reach = TUNING.zergRadius + def.radius;
    let near = 0;
    for (const p of alive) if (Math.hypot(p.x - e.x, p.z - e.z) <= reach) near++;
    if (near >= TUNING.zergCount) {
      blast(e.x, e.z, TUNING.zergBlast + def.radius, near, TUNING.zergWindup);
      return;
    }
    // Or a knot of heroes anywhere it can see: the same platform is never safe for a crowd.
    let best: PlayerState[] = [];
    for (const p of alive) {
      const knot = alive.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) <= TUNING.zergClusterRadius);
      if (knot.length > best.length) best = knot;
    }
    if (best.length < TUNING.zergCount) return;
    let cx = 0;
    let cz = 0;
    for (const p of best) {
      cx += p.x;
      cz += p.z;
    }
    cx /= best.length;
    cz /= best.length;
    if (Math.hypot(cx - e.x, cz - e.z) > 60) return;
    blast(cx, cz, TUNING.zergClusterRadius + 1.5, best.length, TUNING.zergWindup + 0.35);
  }

  /** A hero camping on high ground in reach of a harpoon, if any. */
  private camper(e: EnemyState, def: EnemyDef, atk: EnemyAttackDef): PlayerState | undefined {
    const eye = this.eyeOf(e, def);
    let best: PlayerState | undefined;
    let bestElev = 0;
    for (const p of this.players.values()) {
      if (p.act === Act.Downed || hasStatus(p.st, PS.Stealth) || p.iframes > 0) continue;
      const elev = standElevation(this.layout, p.x, p.z);
      if (elev <= bestElev) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d > atk.startRange || d < (atk.minRange ?? 0)) continue;
      // The hook flies over the rim: only walls stop it.
      if (!losClear(this.layout, e.x, e.z, p.x, p.z, Math.max(eye, elev))) continue;
      best = p;
      bestElev = elev;
    }
    return best;
  }

  private emitTaunt(who: string, text: string, id: number, heroId = ''): void {
    if (!text || text === this.lastTauntText) return;
    this.lastTauntText = text;
    if (heroId) this.lastTauntHero = heroId;
    this.lastTauntAt = this.time;
    this.events.push({ e: 'taunt', who, text, id });
  }

  /** Who the next joke is about: whoever is actually eating hits, not a turn of the party. */
  private tauntVictim(): PlayerState | undefined {
    const alive = [...this.players.values()].filter((p) => p.act !== Act.Downed && !hasStatus(p.st, PS.Stealth));
    const heat = (p: PlayerState) => {
      const marks = (this.suffer.get(p.id) ?? []).filter((m) => this.time - m.t <= 16 && m.landed);
      return marks.length;
    };
    return alive
      .filter((p) => heat(p) > 0)
      .sort((a, b) => heat(b) - heat(a) || (a.id < b.id ? -1 : 1))[0];
  }

  /** A read for the joke, looser than the combat rule: one landed family is already a bit. */
  private readForTaunt(id: string): SufferRead {
    const marks = (this.suffer.get(id) ?? []).filter((m) => this.time - m.t <= 16);
    const strict = sufferRead(marks);
    if (strict.family || strict.resisted) return strict;
    const landed = marks.filter((m) => m.landed);
    const last = landed[landed.length - 1];
    return last ? { family: last.family, resisted: '' } : strict;
  }

  /** One banner when the read, or Jev's order, actually changes. */
  private maybeTaunt(): void {
    if (this.waitingQuip) {
      const ready = this.quips?.take(this.waitingQuip.key);
      if (ready && ready !== this.lastTauntText) {
        this.emitTaunt(this.waitingQuip.who, ready, this.waitingQuip.id, this.waitingQuip.heroId);
        this.waitingQuip = null;
        return;
      }
      if (ready) {
        this.emitTaunt(this.waitingQuip.who, this.waitingQuip.text, this.waitingQuip.id, this.waitingQuip.heroId);
        this.waitingQuip = null;
        return;
      }
      if (!this.quips || this.time - this.waitingQuip.since >= 12.5) {
        this.emitTaunt(this.waitingQuip.who, this.waitingQuip.text, this.waitingQuip.id, this.waitingQuip.heroId);
        this.waitingQuip = null;
      }
      return;
    }
    if (this.safe || this.players.size < 3 || this.time - this.lastTauntAt < 24) return;
    const order = this.roomOrder();
    const prey = this.tauntVictim();
    if (!prey) return;
    const read = this.readForTaunt(prey.id);
    const mate = [...this.players.values()]
      .filter((p) => p.id !== prey.id && p.act !== Act.Downed)
      .sort((a, b) => this.readForTaunt(b.id).family.length - this.readForTaunt(a.id).family.length)[0];
    const mateRead = mate ? this.readForTaunt(mate.id) : undefined;
    const witness = !read.family && mate && mateRead?.family ? { hero: HEROES[mate.hero].short, family: mateRead.family } : undefined;
    if (!order && !read.family && !read.resisted && !witness) return;
    const key = `${prey.id}|${read.family}|${read.resisted}|${witness?.hero ?? ''}|${order?.punish ?? ''}|${order?.shape ?? ''}|${order?.tone ?? ''}`;
    if (key === this.lastTauntKey) return;
    const elite = this.enemies.find((e) => e.state !== EState.Dead && jevEligible(ENEMIES[e.type]));
    const speaker = elite ?? this.enemies.find((e) => e.state !== EState.Dead && !ENEMIES[e.type].dummy);
    if (!speaker) return;
    const line = tauntLine({
      who: ENEMIES[speaker.type].name,
      hero: HEROES[prey.hero].short,
      read,
      punish: order?.punish ?? null,
      shape: order?.shape ?? null,
      tone: order?.tone ?? 'mock',
      n: this.tauntN,
      avoid: this.lastTauntText,
      witness,
    });
    if (line.text === this.lastTauntText) return;
    this.tauntN += 1;
    this.lastTauntKey = key;
    if (!this.quips) {
      this.emitTaunt(line.who, line.text, speaker.id, prey.id);
      return;
    }
    const party = this.alivePrey();
    const facts: QuipFacts = {
      key,
      who: line.who,
      hero: HEROES[prey.hero].short,
      tone: order?.tone ?? 'mock',
      suffers: witness
        ? `${HEROES[prey.hero].short} non sta prendendo colpi: è ${witness.hero} che prende ${familyWordIt(witness.family)} in faccia, e ${HEROES[prey.hero].short} guarda`
        : sufferSentenceIt(HEROES[prey.hero].short, read),
      punish: order?.punish && order.punish !== 'mix' ? order.punish : read.family || witness?.family || '',
      shape: order?.shape ?? '',
      job: HEROES[prey.hero].role,
      detail: [
        `in questo momento ${ACT_IT[this.actLabel(prey.act)] ?? 'si muove'}`,
        `vita al ${Math.max(0, Math.round((prey.hp / Math.max(1, prey.maxHp)) * 100))}%`,
        isolationOf(prey, party) > 5 ? 'è isolato dal gruppo' : 'è in mezzo al gruppo',
      ].join(', '),
      avoid: this.lastTauntText,
    };
    this.quips.ask(facts);
    this.waitingQuip = { key, since: this.time, who: line.who, text: line.text, id: speaker.id, heroId: prey.id };
  }

  private stepEnemy(e: EnemyState, dt: number): void {
    const def = ENEMIES[e.type];
    let frozen = false;
    let confused = false;
    let slow = 1;
    for (let i = e.st.length - 1; i >= 0; i--) {
      const s = e.st[i]!;
      const before = s.t;
      s.t -= dt;
      if (s.k === ES.Bleed && e.state !== EState.Dead && Math.floor(before * 2) !== Math.floor(s.t * 2)) {
        // Laceration ticks twice a second and ignores every defence.
        const owner = this.players.get(e.lastHitBy) ?? null;
        e.hp -= Math.max(1, Math.round(s.p * 0.5));
        this.events.push({ e: 'hit', id: e.id, dmg: Math.max(1, Math.round(s.p * 0.5)), by: '', x: e.x, z: e.z, crit: 0, kill: e.hp <= 0 });
        if (def.dummy) e.hp = Math.max(1, e.hp);
        if (e.hp <= 0) {
          this.kill(e, owner);
          return;
        }
      }
      if (s.t <= 0) {
        e.st.splice(i, 1);
        continue;
      }
      if (s.k === ES.Frozen) frozen = true;
      else if (s.k === ES.Confused) confused = true;
      else if (s.k === ES.Slow) slow *= 1 - s.p;
    }
    e.sinceHit += dt;
    if (e.resolve > 0) e.resolve -= dt;
    if (e.ward > 0) e.ward -= dt;
    if (e.sinceHit > 1.5) e.flinches = 0;
    if (e.sinceHit > TUNING.poiseDecayDelay && e.state !== EState.Broken) {
      e.poise = Math.max(0, e.poise - TUNING.poiseDecay * dt);
    }
    if (def.dummy && e.sinceHit > 2) e.hp = Math.min(e.maxHp, e.hp + 60 * dt);
    e.cool = Math.max(0, e.cool - dt);
    e.retarget -= dt;
    const table = this.threat.get(e.id);
    if (table) for (const [id, v] of table) table.set(id, v * (1 - 0.22 * dt));

    if (e.kx !== 0 || e.kz !== 0) {
      this.slideEnemy(e, def, dt);
    }

    if (e.state === EState.Dead) {
      e.t += dt;
      return;
    }
    if (e.state === EState.Spawn) {
      e.t += dt;
      if (e.t >= SPAWN_TIME) {
        e.state = EState.Chase;
        e.t = 0;
        this.announce(e);
      }
      return;
    }
    if (e.state === EState.Broken) {
      e.t += dt;
      if (e.t >= def.brokenTime) {
        e.state = EState.Chase;
        e.t = 0;
        e.poise = 0;
        e.cool = Math.max(e.cool, 0.8);
      }
      return;
    }
    if (e.state === EState.Stagger) {
      e.t += dt;
      if (e.t >= e.n) {
        e.state = EState.Chase;
        e.t = 0;
        e.cool = Math.max(e.cool, 0.3);
      }
      return;
    }
    if (e.state === EState.Special) {
      e.t += dt;
      if (e.struck === 0 && e.t >= 0.7) {
        e.struck = 1;
        this.roar(e, def);
      }
      if (e.t >= 1.9) {
        e.state = EState.Chase;
        e.t = 0;
        e.cool = 0.6;
      }
      return;
    }
    if (frozen) return;

    const asleep = this.garrison.has(e.id) && e.state === EState.Idle && !e.target;
    // Stone crabs dig in wherever the ground dips to -1: unseen until they surface to strike.
    if (def.burrow && e.state !== EState.Windup && e.state !== EState.Recover) {
      const low = standElevation(this.layout, e.x, e.z) <= -1;
      const target = this.players.get(e.target);
      const close = !!target && Math.hypot(target.x - e.x, target.z - e.z) < def.radius + 4.2;
      if (low && !close && e.sinceHit > 1.2) {
        addStatus(e.st, ES.Burrow, 0.35, 0);
      } else if (hasStatus(e.st, ES.Burrow) && close) {
        removeStatus(e.st, ES.Burrow);
        this.events.push({ e: 'fx', what: 'emerge', x: e.x, z: e.z, r: def.radius + 1 });
      }
    }
    const burrowed = hasStatus(e.st, ES.Burrow);

    if ((def.boss || def.bar) && !asleep) {
      const frac = e.hp / e.maxHp;
      const want = def.boss ? (frac <= 0.33 ? 2 : frac <= 0.66 ? 1 : 0) : frac <= 0.5 ? 1 : 0;
      if (want > e.phase && e.state !== EState.Windup) {
        e.phase = want;
        this.events.push({ e: 'phase', n: want });
        if (def.boss) {
          e.state = EState.Special;
          e.t = 0;
          e.struck = 0;
          return;
        }
      }
    }
    if (isBossRank(def) && !asleep && !this.safe) this.antiZerg(e, def, dt);

    if (e.state === EState.Windup) {
      this.stepWindup(e, def, dt, slow);
      return;
    }
    if (e.state === EState.Recover) {
      e.t += dt;
      if (e.t >= def.attacks[e.atk]!.recover) {
        e.state = EState.Chase;
        e.t = 0;
      }
      return;
    }

    e.t += dt;
    if (confused) {
      if (this.rng.chance(0.08)) e.yaw += this.rng.range(-1.5, 1.5);
      if (def.speed > 0) this.moveEnemy(e, def, Math.sin(e.yaw), Math.cos(e.yaw), def.speed * 0.35 * slow, dt);
      e.state = EState.Idle;
      return;
    }

    if (asleep) {
      if (!burrowed) this.patrol(e, def, dt);
      const seen = this.spotHero(e);
      if (!seen) return;
      this.wakeGarrison(e, seen);
      return;
    }

    const target = this.pickTarget(e);
    if (!target) {
      e.state = EState.Idle;
      return;
    }
    const dx = target.x - e.x;
    const dz = target.z - e.z;
    const dist = Math.hypot(dx, dz);
    const gap = dist - def.radius - TUNING.playerRadius;
    const eye = this.eyeOf(e, def);
    const los = losClear(this.layout, e.x, e.z, target.x, target.z, eye);
    const toward = tmp;
    if (los) {
      toward.x = dx / (dist || 1);
      toward.z = dz / (dist || 1);
    } else if (!flowDirection(this.layout, this.flowTo(target), e.x, e.z, toward)) {
      toward.x = dx / (dist || 1);
      toward.z = dz / (dist || 1);
    }
    const tx = toward.x;
    const tz = toward.z;
    let speed = def.speed * slow * (burrowed ? 1.25 : 1);
    const faceYaw = yawOf(dx, dz);

    if (def.dummy) {
      e.yaw = approachAngle(e.yaw, faceYaw, 6 * dt);
      if (e.cool <= 0 && gap < 3.4) {
        const idx = this.chooseAttack(e, def, dist, target);
        if (idx >= 0) this.beginAttack(e, def, idx, target);
      }
      return;
    }

    const silenced = hasStatus(e.st, ES.Silenced);
    // The harpoon goes for whoever is camping on high ground, not for whoever is closest.
    if (e.cool <= 0 && !silenced && !burrowed) {
      const hi = def.attacks.findIndex((a) => a.special === 'harpoon' && (a.phase ?? 0) <= e.phase);
      if (hi >= 0) {
        const camper = this.camper(e, def, def.attacks[hi]!);
        if (camper) {
          e.target = camper.id;
          e.retarget = 1.5;
          this.beginAttack(e, def, hi, camper);
          return;
        }
      }
    }

    const mind = personaOf(e.type).mind;
    const prey = this.asPrey(target);
    const slots = partyAttackSlots(!!def.ranged, this.players.size);
    const desperate = mind === 'hunter' && prey.maxHp > 0 && prey.hp / prey.maxHp < 0.35;
    const free = def.elite || def.boss || desperate || this.attackersOn(target.id, def.ranged) < slots;
    if (e.cool <= 0 && free && los && !burrowed && canCommitAttack(prey)) {
      const idx = this.chooseAttack(e, def, dist, target);
      if (idx >= 0) {
        this.beginAttack(e, def, idx, target);
        return;
      }
    }

    // Phalanx: a Corsair does not break the line. He waits for the shields beside him.
    if (def.phalanx && gap > 3) {
      for (const o of this.enemies) {
        if (o === e || o.type !== e.type || o.state === EState.Dead || o.target !== e.target) continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) > 9) continue;
        if (Math.hypot(target.x - o.x, target.z - o.z) > dist + 1.5) {
          speed *= 0.55;
          break;
        }
      }
    }

    const wantAttack = e.cool <= 0.4 && free;
    const charge = chargeWindow(def.attacks, e.phase);
    const mode = burrowed
      ? 'chase'
      : steerMode(
          mind,
          {
            dist,
            gap,
            preferred: def.preferred || 4.2,
            cool: e.cool,
            los,
            wantAttack,
            chargeMin: charge.min,
            chargeMax: charge.max,
          },
          this.mindHint(e),
          this.roomOrder() ?? undefined,
        );
    if (mode === 'flank') {
      e.state = EState.Circle;
      const at = flankPoint(prey);
      const fx = at.x - e.x;
      const fz = at.z - e.z;
      if (Math.hypot(fx, fz) > 0.55) this.moveEnemy(e, def, fx, fz, speed * 1.05, dt);
    } else if (mode === 'kite' || mode === 'backstep') {
      e.state = EState.Circle;
      this.moveEnemy(e, def, -tx, -tz, speed * (mode === 'backstep' ? 0.95 : 0.85), dt);
    } else if (mode === 'circle') {
      e.state = EState.Circle;
      const ring = def.ranged ? def.preferred || 12 : 4.2 + (e.id % 3) * 0.9;
      if (gap > ring + 0.8) this.moveEnemy(e, def, tx, tz, speed, dt);
      else if (gap < ring - 0.8) this.moveEnemy(e, def, -tx, -tz, speed * 0.6, dt);
      else {
        this.moveEnemy(e, def, -tz * e.side, tx * e.side, speed * 0.45, dt);
        if (this.rng.chance(0.015)) e.side = -e.side;
      }
    } else if (mode === 'hold') {
      e.state = EState.Idle;
      this.moveEnemy(e, def, -tz * e.side, tx * e.side, speed * 0.12, dt);
    } else {
      e.state = EState.Chase;
      const near = Math.min(...def.attacks.map((a) => ((a.phase ?? 0) <= e.phase && !a.minRange ? a.startRange : 99)));
      if (!los || dist > near - 0.3) this.moveEnemy(e, def, tx, tz, speed, dt);
    }
    e.yaw = approachAngle(e.yaw, los ? faceYaw : yawOf(tx, tz), 9 * dt);
  }

  private stepWindup(e: EnemyState, def: EnemyDef, dt: number, slow: number): void {
    const atk = def.attacks[e.atk]!;
    const prevT = e.t;
    e.t += dt * (slow < 1 ? 0.75 : 1);
    const target = this.players.get(e.target);
    const lungeTime = TUNING.enemyCommit;
    const lungeStart = atk.windup - lungeTime;
    if (target && target.act !== Act.Downed && e.t < lungeStart) {
      e.yaw = approachAngle(e.yaw, yawOf(target.x - e.x, target.z - e.z), 7 * dt);
      if (atk.aoe && e.t < atk.windup * 0.55) this.setAim(e, def, atk, target);
    }
    if (atk.lunge > 0 && e.t >= lungeStart && prevT < atk.windup) {
      const step = (atk.lunge / lungeTime) * dt;
      if (atk.aoe) {
        const dx = e.ax - e.x;
        const dz = e.az - e.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) this.moveEnemy(e, def, dx, dz, Math.min(step, d) / dt, dt);
      } else {
        const allowed = this.lungeRoom(e, def, target, step);
        const ox = e.x;
        const oz = e.z;
        e.x += Math.sin(e.yaw) * allowed;
        e.z += Math.cos(e.yaw) * allowed;
        collide(this.layout, e.x, e.z, def.radius, tmp, standElevation(this.layout, ox, oz));
        e.x = tmp.x;
        e.z = tmp.z;
      }
    }
    if (!atk.aoe) this.setAim(e, def, atk, target);
    const gapT = atk.hitGap ?? 0.7;
    while (e.struck < e.n && e.t >= atk.windup + e.struck * gapT) {
      this.strike(e, def, atk);
      e.struck++;
      // A perfect parry staggers or breaks the attacker mid-swing.
      if (e.state !== EState.Windup) {
        this.signals.delete(e.id);
        return;
      }
    }
    if (e.struck >= e.n) {
      e.state = EState.Recover;
      this.signals.delete(e.id);
      e.t = 0;
      // A boss facing a crowd keeps the pressure up: he has more heroes to answer.
      const crowd = def.boss ? 1 / (1 + 0.12 * (Math.max(1, this.players.size) - 1)) : 1;
      e.cool = atk.cd * this.rng.range(0.62, 1.02) * crowd;
    }
  }

  /** Phase change of a City or Region boss: shove everyone back, call the brood, raise the water. */
  private roar(e: EnemyState, def: EnemyDef): void {
    this.events.push({ e: 'ecast', id: e.id, what: 'roar', x: e.x, z: e.z, r: 11 });
    for (const p of this.players.values()) {
      if (p.act === Act.Downed) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 11 + def.radius) continue;
      p.kx = (dx / d) * 30;
      p.kz = (dz / d) * 30;
    }
    this.summon(e, def, 3 + Math.floor(this.players.size / 2));
    const line = def.taunts?.[e.phase - 1];
    if (line) this.events.push({ e: 'say', who: def.name, text: line });
    if (def.floods) {
      // The water climbs one terrace per phase: first the channels, then the plain.
      this.flood = e.phase >= 2 ? 0 : -1;
      this.events.push({ e: 'flood', level: this.flood });
    }
  }

  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (a.state === EState.Dead) continue;
      const feet = standElevation(this.layout, a.x, a.z);
      const da = ENEMIES[a.type];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (b.state === EState.Dead) continue;
        const db = ENEMIES[b.type];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = da.radius + db.radius + 0.15;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / d;
        const wa = da.boss || da.dummy ? 0 : db.boss || db.dummy ? 1 : 0.5;
        const wb = da.boss || da.dummy ? (db.boss || db.dummy ? 0 : 1) : db.boss || db.dummy ? 0 : 0.5;
        a.x -= dx * push * wa;
        a.z -= dz * push * wa;
        b.x += dx * push * wb;
        b.z += dz * push * wb;
      }
      if (!da.boss && !da.dummy) {
        for (const p of this.players.values()) {
          if (p.act === Act.Downed) continue;
          const dx = a.x - p.x;
          const dz = a.z - p.z;
          const min = da.radius + TUNING.playerRadius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          a.x = p.x + (dx / d) * min;
          a.z = p.z + (dz / d) * min;
        }
      }
      collide(this.layout, a.x, a.z, da.radius, tmp, feet);
      a.x = tmp.x;
      a.z = tmp.z;
    }
  }

  // ---------------------------------------------------------------- projectiles & zones

  private stepProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      const step = pr.speed * dt;
      const sx = pr.x;
      const sz = pr.z;
      const ex = sx + pr.dx * step;
      const ez = sz + pr.dz * step;
      pr.ttl -= dt;
      let dead = pr.ttl <= 0;
      let hitAt = Infinity;
      let hitEnemy: EnemyState | undefined;
      let hitPlayer: PlayerState | undefined;

      const along = (x: number, z: number, r: number): number => {
        // Distance along the segment at which the circle is first touched, or Infinity.
        const px = x - sx;
        const pz = z - sz;
        const t = clamp(px * pr.dx + pz * pr.dz, 0, step);
        const cx = sx + pr.dx * t - x;
        const cz = sz + pr.dz * t - z;
        return cx * cx + cz * cz <= r * r ? t : Infinity;
      };

      if (pr.owner) {
        for (const e of this.enemies) {
          if (!this.hittable(e) || pr.hit.includes(e.id)) continue;
          const t = along(e.x, e.z, ENEMIES[e.type].radius + pr.r + 0.25);
          if (t < hitAt) {
            hitAt = t;
            hitEnemy = e;
          }
        }
      } else {
        for (const p of this.players.values()) {
          if (p.act === Act.Downed || pr.hit.includes(this.pidIndex(p.id))) continue;
          const t = along(p.x, p.z, TUNING.playerRadius + pr.r);
          if (t < hitAt) {
            hitAt = t;
            hitPlayer = p;
          }
        }
      }

      if (hitEnemy) {
        const owner = this.players.get(pr.owner) ?? null;
        pr.x = sx + pr.dx * hitAt;
        pr.z = sz + pr.dz * hitAt;
        const magic = pr.kind === 'reflected' || (!!owner && castsMagic(owner.hero));
        this.damageEnemy(hitEnemy, pr.dmg, pr.poise, owner, { kb: 2, heavy: pr.effect === 'heavy', magic, basic: pr.kind !== 'reflected' });
        if (owner) removeStatus(owner.st, PS.Counter);
        pr.hit.push(hitEnemy.id);
        if (pr.aoe > 0) this.explode(pr, owner, hitEnemy.id);
        if (pr.pierce > 0) pr.pierce--;
        else dead = true;
      } else if (hitPlayer) {
        pr.x = sx + pr.dx * hitAt;
        pr.z = sz + pr.dz * hitAt;
        const src = this.enemies.find((e) => e.id === pr.src);
        const hx = pr.x;
        const hz = pr.z;
        const touch = TUNING.playerRadius + pr.r + TUNING.enemyHitPad;
        const res = this.tryHitPlayer(hitPlayer, {
          dmg: pr.dmg,
          red: pr.red,
          kb: 3,
          ox: sx,
          oz: sz,
          src: pr.src,
          family: 'shot',
          hook: pr.effect === 'harpoon' && src && this.hittable(src) ? this.hookSpot(src, ENEMIES[src.type]) : undefined,
          // A hero who had already stepped out of its path on their own screen is not hit.
          still: (q) => Math.hypot(q.x - hx, q.z - hz) <= touch,
          alert: pr.alertEnd !== undefined ? { start: pr.alertStart ?? 0, end: pr.alertEnd } : undefined,
        });
        if (res === 'parried') {
          // A perfect parry sends the projectile back where it came from.
          pr.owner = hitPlayer.id;
          pr.dx = -pr.dx;
          pr.dz = -pr.dz;
          if (src && this.hittable(src)) {
            const d = Math.hypot(src.x - pr.x, src.z - pr.z) || 1;
            pr.dx = (src.x - pr.x) / d;
            pr.dz = (src.z - pr.z) / d;
          }
          pr.speed *= 1.6;
          pr.dmg *= 2.5;
          pr.poise = 25;
          pr.ttl = 2;
          pr.kind = 'reflected';
          pr.effect = '';
          pr.hit = [];
          pr.eye = 2;
        } else {
          pr.hit.push(this.pidIndex(hitPlayer.id));
          if (res !== 'dodged') dead = true;
        }
      } else {
        pr.x = ex;
        pr.z = ez;
        // A harpoon is thrown upward at the rims: only walls stop it.
        const eye = pr.effect === 'harpoon' ? 2 : pr.eye;
        if (sightBlocked(this.layout, ex, ez, eye)) {
          dead = true;
          if (pr.aoe > 0 && pr.owner) this.explode(pr, this.players.get(pr.owner) ?? null, 0);
        }
      }
      if (dead) {
        if (pr.ttl <= 0 && pr.aoe > 0 && pr.owner) this.explode(pr, this.players.get(pr.owner) ?? null, 0);
        this.events.push({ e: 'fx', what: `pop_${pr.kind}`, x: pr.x, z: pr.z, r: pr.aoe || pr.r });
      } else {
        keep.push(pr);
      }
    }
    this.projectiles = keep;
  }

  private pidIndex(id: string): number {
    let i = 0;
    for (const k of this.players.keys()) {
      if (k === id) return -1 - i;
      i++;
    }
    return -999;
  }

  private explode(pr: Projectile, owner: PlayerState | null, skip: number): void {
    for (const e of this.enemiesNear(pr.x, pr.z, pr.aoe)) {
      if (e.id === skip) continue;
      this.damageEnemy(e, pr.dmg * 0.7, pr.poise * 0.7, owner, { kb: 3, magic: true });
    }
    pr.aoe = 0;
  }

  private stepZones(dt: number): void {
    this.gassed.clear();
    const keep: Zone[] = [];
    for (const z of this.zones) {
      z.t += dt;
      const owner = z.owner ? (this.players.get(z.owner) ?? null) : null;
      const done = z.t >= z.dur;
      const ticked = (): boolean => {
        z.tick -= dt;
        if (z.tick > 0) return false;
        z.tick += 0.5;
        return true;
      };
      switch (z.kind) {
        case 'bubble': {
          for (const p of this.alliesNear(z.x, z.z, z.r)) addStatus(p.st, PS.Bubble, T(0.25), 0);
          for (const e of this.enemiesNear(z.x, z.z, z.r)) addStatus(e.st, ES.Slow, 0.25, 0.4);
          break;
        }
        case 'silence': {
          for (const p of this.alliesNear(z.x, z.z, z.r)) {
            if (!hasStatus(p.st, PS.Bubble)) addStatus(p.st, PS.Silence, T(0.25), 0);
          }
          break;
        }
        case 'rain': {
          if (ticked()) {
            for (const e of this.enemiesNear(z.x, z.z, z.r)) {
              addStatus(e.st, ES.Marked, 4, 0);
              this.damageEnemy(e, z.power, 5, owner, { magic: true });
            }
          }
          break;
        }
        case 'ember': {
          // Burning puddle left by a Dominio node.
          if (ticked()) {
            for (const e of this.enemiesNear(z.x, z.z, z.r)) this.damageEnemy(e, z.power * 0.5, 2, owner, { magic: true });
          }
          break;
        }
        case 'toxic': {
          // Fungal cloud: it does not stagger, it just eats whoever stays inside.
          // Overlapping clouds do not stack: one lungful per tick is enough.
          if (ticked()) {
            for (const p of this.alliesNear(z.x, z.z, z.r)) {
              if (this.gassed.has(p.id)) continue;
              this.gassed.add(p.id);
              this.hurt(p, z.power * 0.5);
            }
          }
          break;
        }
        case 'shrine': {
          // Healing Shrine: a circle of light at the bottom of the basin.
          if (ticked()) {
            for (const p of this.alliesNear(z.x, z.z, z.r)) {
              this.heal(p, (p.maxHp || HEROES[p.hero].hp) * z.power * 0.5, true, z.owner);
            }
          }
          break;
        }
        case 'shock': {
          // Anti-zerg shockwave: 360 degrees, unblockable, throws everyone apart.
          if (done) {
            this.events.push({ e: 'fx', what: 'shock', x: z.x, z: z.z, r: z.r });
            const zx = z.x;
            const zz = z.z;
            const zr = z.r;
            for (const p of this.players.values()) {
              if (p.act === Act.Downed) continue;
              const at = this.hitPos(p, tmp);
              if (Math.hypot(at.x - zx, at.z - zz) > zr + TUNING.enemyHitPad) continue;
              this.tryHitPlayer(p, {
                dmg: z.power,
                red: true,
                kb: TUNING.zergKnock,
                ox: zx,
                oz: zz,
                src: 0,
                still: (q) => Math.hypot(q.x - zx, q.z - zz) <= zr + TUNING.enemyHitPad,
              });
            }
          }
          break;
        }
        case 'blackhole':
        case 'pull': {
          const strength = z.kind === 'blackhole' ? 7 : 11;
          for (const e of this.enemiesNear(z.x, z.z, z.r * 1.25)) {
            const def = ENEMIES[e.type];
            if (def.boss || def.dummy || def.speed <= 0) continue;
            const dx = z.x - e.x;
            const dz = z.z - e.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.6) {
              const feet = standElevation(this.layout, e.x, e.z);
              const s = (Math.min(strength * dt, d - 0.5) * (def.elite ? 0.4 : 1)) / d;
              collide(this.layout, e.x + dx * s, e.z + dz * s, def.radius, tmp, feet);
              e.x = tmp.x;
              e.z = tmp.z;
            }
          }
          if (z.kind === 'blackhole' && ticked()) {
            for (const e of this.enemiesNear(z.x, z.z, z.r)) this.damageEnemy(e, z.power * 0.16, 6, owner, { magic: true });
          }
          if (done) {
            for (const e of this.enemiesNear(z.x, z.z, z.r)) {
              this.damageEnemy(e, z.power, z.power, owner, { kb: 6, heavy: true, magic: true });
            }
            if (owner) removeStatus(owner.st, PS.Counter);
            this.events.push({ e: 'fx', what: z.kind === 'blackhole' ? 'collapse' : 'implode', x: z.x, z: z.z, r: z.r });
          }
          break;
        }
        case 'ring': {
          z.r = z.t * RING_SPEED;
          for (const p of this.players.values()) {
            if (p.act === Act.Downed || z.hit.includes(p.id)) continue;
            const at = this.hitPos(p, tmp);
            const d = Math.hypot(at.x - z.x, at.z - z.z);
            if (Math.abs(d - z.r) > 0.95 && Math.abs(Math.hypot(p.x - z.x, p.z - z.z) - z.r) > 0.95) continue;
            z.hit.push(p.id);
            this.tryHitPlayer(p, { dmg: z.power, red: true, kb: 6, ox: z.x, oz: z.z, src: 0, alert: z.alert });
          }
          break;
        }
        case 'burst': {
          if (done) {
            this.events.push({ e: 'fx', what: 'burst', x: z.x, z: z.z, r: z.r });
            for (const p of this.alliesNear(z.x, z.z, z.r + TUNING.playerRadius * 0.5)) {
              const zx = z.x;
              const zz = z.z;
              const zr = z.r;
              this.tryHitPlayer(p, {
                dmg: z.power,
                red: true,
                kb: 6,
                ox: zx,
                oz: zz,
                src: 0,
                still: (q) => Math.hypot(q.x - zx, q.z - zz) <= zr + 0.9,
              });
            }
          }
          break;
        }
      }
      if (!done) keep.push(z);
    }
    this.zones = keep;
  }

  // ---------------------------------------------------------------- environment

  /** Living foes that are not training dummies. */
  enemiesLeft(): number {
    let n = 0;
    for (const e of this.enemies) if (e.state !== EState.Dead && !ENEMIES[e.type].dummy) n++;
    return n;
  }

  /** Toxic water: whoever stands at or below the flood line is poisoned and bogged down. Enemies are at home in it. */
  private stepFlood(): void {
    if (this.flood <= FLOOD_DRY) return;
    for (const p of this.players.values()) {
      if (p.act === Act.Downed) continue;
      if (standElevation(this.layout, p.x, p.z) > this.flood) continue;
      this.hurt(p, TUNING.floodDps * 0.5);
      addStatus(p.st, PS.Slow, T(0.7), TUNING.floodSlow);
    }
  }

  // ---------------------------------------------------------------- main step

  /** Advances enemies, projectiles, zones and loot. Player steps are driven by their commands. */
  step(dt: number): void {
    this.time += dt;
    for (const e of this.enemies) this.stepEnemy(e, dt);
    this.separate();
    this.stepProjectiles(dt);
    this.stepZones(dt);
    this.resolvePending();
    this.stepDrops(dt);
    this.stepMomentum(dt);
    this.stepSynergy();
    this.stepAuras();
    this.slowTick -= dt;
    if (this.slowTick <= 0) {
      this.slowTick += 0.5;
      this.stepShadows();
      this.stepFlood();
    }
    this.noteCaptain();
    this.jev?.pump(this.time);
    this.maybeTaunt();
    if (this.enemies.some((e) => e.state === EState.Dead && e.t > CORPSE_TIME)) {
      this.enemies = this.enemies.filter((e) => !(e.state === EState.Dead && e.t > CORPSE_TIME));
    }
  }

  private stepAuras(): void {
    for (const p of this.players.values()) {
      if (p.act === Act.Downed || p.hero !== 'albereth') continue;
      // Albereth satyr pace: mild haste aura for nearby allies.
      for (const a of this.alliesNear(p.x, p.z, TUNING.alberethAuraRange)) {
        if (a.id === p.id) continue;
        addStatus(a.st, PS.Haste, T(0.4), TUNING.alberethAuraHaste);
      }
    }
  }

  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
