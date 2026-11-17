/**
 * Authoritative world simulation: players, enemy AI, projectiles, zones, abilities and waves.
 * It is transport-agnostic: the server runs it, and the offline mode runs the very same code in the browser.
 */
import { INTERP_DELAY_MS, TICK_HZ, TUNING } from './constants';
import {
  ASI_LEVELS,
  computeHeroStats,
  levelFromDndXp,
  levelUpHpGain,
  rollLevelUpCards,
  type AbilityId,
  type ComputedHeroStats,
  type MegabonkTomeId,
} from './dndMegabonkRules';
import { EffectQueue, clearPoisonLike } from './effectQueue';
import { ENEMIES, type EnemyAttackDef, type EnemyDef } from './enemies';
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
import { getItem, rollDice } from './itemsCatalog';
import {
  awardPartyXp,
  consumeBeltSlot,
  emptyInventory,
  equipFromBag,
  assignBelt,
  partyLuckMul,
  salvageItem,
  spawnKillLoot,
  stepLootPhysics,
  tryClaimDrop,
  type GroundDrop,
  type HeroInventory,
} from './lootSystem';
import { scaledHeroVitals, levelFromXp } from './progress';
import {
  enemyHpMul,
  enemyPoiseMul,
  enemyScaleKind,
  partyAttackSlots,
  partySize,
  partyThreatMul,
  waveEnemyCount,
} from './partyScale';
import {
  buildFlow,
  canStep,
  collide,
  flowDirection,
  highGroundMul,
  losClear,
  meleeHeightBlocked,
  nearestFloor,
  sightBlocked,
  standElevation,
  type Layout,
  type Point,
} from './layout';
import { angleDiff, approachAngle, clamp, Rng, wrapAngle, yawOf } from './math';
import type { WaveDef } from './missions';
import { BESTIARY_BY_ID, damageMultiplier } from './bestiaryCatalog';
import { spawnBossRelicChest } from './bossLootSystem';
import type { BiomeId } from './proceduralBiomes';
import { getZone } from './proceduralBiomes';
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
  type StepCtx,
} from './player';
import {
  Act,
  ES,
  EState,
  PS,
  type EnemyState,
  type EnemyTypeId,
  type GameEvent,
  type HeroId,
  type InputCmd,
  type PlayerState,
  type Projectile,
  type Zone,
} from './types';

const T = (s: number): number => s * TICK_HZ;
const RAD = Math.PI / 180;

/** Ranged and magic heroes ignore the two-terrace melee cutoff. Their shots still stop on walls and higher ground. */
function ignoresMeleeHeight(hero: HeroId): boolean {
  return hero === 'rycard' || hero === 'gabryel' || hero === 'anthon';
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

interface HitSpec {
  dmg: number;
  red: boolean;
  kb: number;
  /** Origin of the hit: used for facing checks and knockback direction. */
  ox: number;
  oz: number;
  /** Enemy that dealt it (0 = none). */
  src: number;
  /** Player that dealt it (PvP), if any. */
  by?: string;
  slow?: number;
  /** Re-checked when the lag grace expires: the hit misses if this returns false. */
  still?: (p: PlayerState) => boolean;
  /** Attack family, captured when the swing starts so a late hit still teaches the right lesson. */
  family?: AttackFamily;
}

interface PendingHit {
  pid: string;
  spec: HitSpec;
  until: number;
}

type HitResult = 'none' | 'dodged' | 'parried' | 'blocked' | 'hit' | 'pending';

export type WaveState = 'idle' | 'intro' | 'spawning' | 'fighting' | 'between' | 'done';

export interface WorldOpts {
  layout: Layout;
  seed: number;
  /** Safe area: nobody can be downed (the hub). */
  safe?: boolean;
  waves?: WaveDef[];
  /** Seconds before the first wave. */
  introDelay?: number;
  /** Heroes can damage each other (last-standing arenas). */
  pvp?: boolean;
  /** Downed heroes stay down — no revive / Party heal. */
  noRevive?: boolean;
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
  readonly pvp: boolean;
  readonly noRevive: boolean;
  readonly jev?: JevAdvisor;
  readonly quips?: QuipWriter;
  time = 0;
  readonly players = new Map<string, PlayerState>();
  enemies: EnemyState[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  /** Feedback events produced since the last drain. */
  events: GameEvent[] = [];
  readonly stats = new Map<string, PlayerStats>();
  /** Round-trip time per player in ms, reported by the transport (drives lag forgiveness). */
  readonly rtt = new Map<string, number>();
  /** Per-hero inventory / PE / tomes (room authority). */
  readonly inventories = new Map<string, HeroInventory>();
  /** Ground loot with Megabonk magnet physics. */
  loot: GroundDrop[] = [];
  /**
   * Boss relics waiting for the host to put them in the named hero's bag.
   * A ground chest was vanishing with the room before anyone could walk over it.
   */
  relicGrants: { hero: HeroId; itemId: string; banner: string }[] = [];
  /** EffectQueue per player (consumable buffs). */
  readonly effectQueues = new Map<string, EffectQueue>();
  /** Skillful play window: +15% PE on gem pickup (parry / counter / execute). */
  private readonly skillBonusUntil = new Map<string, number>();
  /** Cached live D&D×Megabonk stats. */
  private readonly liveStats = new Map<string, ComputedHeroStats>();
  /** Vexation mastery: next hit crit bonus. */
  private readonly vexation = new Map<string, boolean>();
  /** Fiaccare: next attack damage mul on enemy. */
  private readonly fiaccare = new Map<number, number>();
  /** Next kill() should tag loot as executed (richer gems). */
  private pendingExecuteLoot = false;
  /** Fractional HP regen accumulator (whole points only). */
  private readonly regenAcc = new Map<string, number>();

  waves: WaveDef[];
  waveIdx = -1;
  waveState: WaveState = 'idle';
  private waveTimer = 0;
  private spawnQueue: { type: EnemyTypeId; at: number }[] = [];

  private pending: PendingHit[] = [];
  private nextId = 1;
  private readonly flows = new Map<string, { field: Int16Array; at: number }>();
  private lite: EnemyLite[] = [];
  private allies: AllyLite[] = [];
  /** First elite/boss of each type announces its counter-strategy. */
  private readonly seenPersona = new Set<EnemyTypeId>();
  /** Pre-placed dungeon foes. They patrol until a hero enters the vision cone. */
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
    this.pvp = !!opts.pvp;
    this.noRevive = !!opts.noRevive;
    this.jev = opts.jev;
    this.quips = opts.quips;
    this.waves = opts.waves ?? [];
    this.ctx = { layout: this.layout, enemies: this.lite, allies: this.allies };
    if (this.waves.length > 0) {
      this.waveState = 'intro';
      this.waveTimer = opts.introDelay ?? 3;
    }
    for (const d of this.layout.dummySpawns) this.spawnEnemy('manichino', d.x, d.z);
    for (const g of this.layout.placed) {
      const e = this.spawnEnemy(g.type as EnemyTypeId, g.x, g.z);
      e.state = EState.Idle;
      e.yaw = g.yaw;
      e.t = 0;
      e.cool = this.rng.range(0.4, 1.8);
      this.garrison.add(e.id);
    }
    // The dungeon is already inhabited: no wave queue, the room clears when the garrison falls.
    if (this.layout.placed.length > 0 && this.waves.length === 0) {
      this.waveState = 'fighting';
      this.waveIdx = 0;
    }
  }

  // ---------------------------------------------------------------- players

  addPlayer(
    id: string,
    hero: HeroId,
    slot: number,
    level = 1,
    opts?: { starterGear?: boolean; inventory?: HeroInventory },
  ): PlayerState {
    const spawns = this.layout.playerSpawns;
    const s = spawns[slot % spawns.length]!;
    const vitals = scaledHeroVitals(HEROES[hero], level);
    const p = newPlayer(id, hero, s.x, s.z, yawOf(this.layout.center.x - s.x, this.layout.center.z - s.z), vitals);
    this.players.set(id, p);
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
    const carried = opts?.inventory?.hero === hero ? opts.inventory : undefined;
    if (carried) {
      this.inventories.set(id, carried);
    } else if (!this.inventories.has(id) || this.inventories.get(id)!.hero !== hero) {
      const inv = emptyInventory(hero, { starter: !!opts?.starterGear });
      inv.pe = 0;
      this.inventories.set(id, inv);
    }
    if (!this.effectQueues.has(id)) this.effectQueues.set(id, new EffectQueue());
    this.refreshLiveStats(id);
    const live = this.liveStats.get(id);
    if (live) {
      p.maxHp = Math.max(p.maxHp, live.maxHp);
      p.hp = Math.min(p.maxHp, Math.max(p.hp, live.maxHp));
      p.maxStamina = Math.max(p.maxStamina, live.maxStamina);
      p.stamina = Math.min(p.maxStamina, p.stamina);
    }
    return p;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.pending = this.pending.filter((h) => h.pid !== id);
    this.inventories.delete(id);
    this.effectQueues.delete(id);
    this.liveStats.delete(id);
    this.skillBonusUntil.delete(id);
    this.vexation.delete(id);
  }

  /** Swap in a restored sheet and recompute the hero's live stats. */
  installInventory(id: string, inv: HeroInventory): boolean {
    const p = this.players.get(id);
    if (!p || inv.hero !== p.hero) return false;
    this.inventories.set(id, inv);
    this.refreshLiveStats(id);
    return true;
  }

  /** Sync PE book from client progress into the live inventory. */
  syncPe(id: string, pe: number): void {
    const inv = this.inventories.get(id);
    if (!inv) return;
    inv.pe = Math.max(inv.pe, Math.floor(pe));
    this.refreshLiveStats(id);
  }

  getInventory(id: string): HeroInventory | undefined {
    return this.inventories.get(id);
  }

  private refreshLiveStats(id: string): ComputedHeroStats | null {
    const p = this.players.get(id);
    const inv = this.inventories.get(id);
    if (!p || !inv) return null;
    const hero = HEROES[p.hero];
    const level = Math.max(levelFromXp(inv.pe), levelFromDndXp(inv.pe));
    const queue = this.effectQueues.get(id);
    const buffs = queue?.toActiveBuffs() ?? [];
    const stats = computeHeroStats(
      p.hero,
      level,
      {
        mainHand: inv.mainHand,
        offHand: inv.offHand,
        armor: inv.armor,
        relic: inv.relic,
        belt: inv.belt,
      },
      buffs,
      inv.tomes,
      { baseHp: hero.hp, baseStamina: hero.stamina, asiSpends: inv.asiSpends },
    );
    this.liveStats.set(id, stats);
    // Soft-apply vitals without clipping current HP below current.
    // Keep p.dmgMul as the pure level bonus — light/heavy Megabonk muls apply in melee.
    const prevMax = p.maxHp || hero.hp;
    const levelHp = Math.round(hero.hp * (1 + 0.028 * (level - 1)));
    p.maxHp = Math.max(stats.maxHp, levelHp);
    if (p.maxHp > prevMax) p.hp += p.maxHp - prevMax;
    p.maxStamina = Math.max(p.maxStamina, stats.maxStamina);
    p.dmgMul = 1 + 0.018 * (level - 1);
    return stats;
  }

  liveOf(id: string): ComputedHeroStats | null {
    return this.liveStats.get(id) ?? this.refreshLiveStats(id);
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

  private refreshLite(): void {
    this.lite.length = 0;
    for (const e of this.enemies) {
      const def = ENEMIES[e.type];
      const alive = e.state !== EState.Dead;
      this.lite.push({ id: e.id, x: e.x, z: e.z, r: def.radius, alive, broken: e.state === EState.Broken });
    }
    this.allies.length = 0;
    for (const p of this.players.values()) {
      this.allies.push({
        id: p.id,
        x: p.x,
        z: p.z,
        // In last-standing arenas nobody can be revived: hide the downed flag from the interact loop.
        downed: !this.noRevive && p.act === Act.Downed,
      });
    }
  }

  /** Applies one input command (one 60 Hz step) for a player and resolves what it caused. */
  applyCommand(id: string, cmd: InputCmd): void {
    const p = this.players.get(id);
    if (!p) return;
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
        case 'dodge':
          this.lateDodge(p);
          if (p.hero === 'anthon' && p.blink) this.anthonTrail(p);
          break;
        case 'block':
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

  private playerMelee(p: PlayerState, def: AttackDef, heavy: boolean): void {
    const { mult, full } = this.chargeOf(p, heavy);
    const live = this.liveOf(p.id);
    const areaMul = live?.areaMul ?? 1;
    const kbMul = live?.knockbackMul ?? 1;
    const postureMul = live?.postureMul ?? 1;
    const dmgMul = heavy ? live?.heavyDmgMul ?? 1 : live?.lightDmgMul ?? 1;
    const mastery = live?.mastery;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let any = false;
    const hitRival = (q: PlayerState, cx: number, cz: number): boolean => {
      const res = this.tryHitPlayer(q, {
        dmg: def.dmg * mult * dmgMul,
        red: heavy,
        kb: def.kb * (heavy ? 1.15 : 1) * kbMul,
        ox: cx,
        oz: cz,
        src: 0,
        by: p.id,
      });
      return res !== 'none' && res !== 'dodged';
    };
    const strike = (e: EnemyState, dmg: number, poise: number, kb: number): boolean =>
      this.damageEnemy(e, dmg, poise, p, {
        kb,
        heavy,
        effect: full ? def.charged : undefined,
        mastery: mastery ?? undefined,
      });

    if (def.aoe) {
      const ahead = def.aoeAhead ?? 0;
      const cx = p.x + fx * ahead;
      const cz = p.z + fz * ahead;
      const radius = def.aoe * (full && def.charged === 'slam' ? 1.35 : 1) * areaMul;
      for (const e of this.enemies) {
        if (!this.hittable(e)) continue;
        if (!ignoresMeleeHeight(p.hero) && meleeHeightBlocked(this.layout, p.x, p.z, e.x, e.z)) continue;
        const d = Math.hypot(e.x - cx, e.z - cz) - ENEMIES[e.type].radius;
        if (d > radius + TUNING.lagPad) continue;
        any = strike(e, def.dmg * mult * dmgMul, def.poise * mult * postureMul, def.kb * kbMul) || any;
      }
      if (this.pvp) {
        for (const q of this.players.values()) {
          if (q.id === p.id || q.act === Act.Downed) continue;
          if (!ignoresMeleeHeight(p.hero) && meleeHeightBlocked(this.layout, p.x, p.z, q.x, q.z)) continue;
          const d = Math.hypot(q.x - cx, q.z - cz) - TUNING.playerRadius;
          if (d > radius + TUNING.lagPad) continue;
          any = hitRival(q, cx, cz) || any;
        }
      }
      this.events.push({ e: 'fx', what: 'slam', x: cx, z: cz, r: radius });
    } else {
      const half = (def.arc / 2 + 12) * areaMul * RAD;
      const range = def.range * Math.min(1.25, 0.85 + areaMul * 0.15);
      const hitIds: number[] = [];
      for (const e of this.enemies) {
        if (!this.hittable(e)) continue;
        if (!ignoresMeleeHeight(p.hero) && meleeHeightBlocked(this.layout, p.x, p.z, e.x, e.z)) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz) - ENEMIES[e.type].radius;
        if (d > range + TUNING.lagPad) continue;
        if (def.arc < 360 && d > 0.8 && Math.abs(angleDiff(yawOf(dx, dz), p.yaw)) > half) continue;
        const landed = strike(e, def.dmg * mult * dmgMul, def.poise * mult * postureMul, def.kb * kbMul);
        any = landed || any;
        if (landed) hitIds.push(e.id);
      }
      // Mastery: Doppio Fendente — cleave a second adjacent target
      if (mastery === 'doppioFendente' && hitIds.length > 0) {
        const primary = this.enemies.find((e) => e.id === hitIds[0]);
        if (primary) {
          for (const e of this.enemies) {
            if (e.id === primary.id || !this.hittable(e)) continue;
            if (!ignoresMeleeHeight(p.hero) && meleeHeightBlocked(this.layout, p.x, p.z, e.x, e.z)) continue;
            if (Math.hypot(e.x - primary.x, e.z - primary.z) > 2.4) continue;
            strike(e, def.dmg * mult * dmgMul * 0.55, def.poise * mult * postureMul * 0.5, def.kb * kbMul * 0.7);
            break;
          }
        }
      }
      // Mastery: Graffio — extra light nick
      if (mastery === 'graffio' && !heavy && any) {
        const e = this.enemies.find(
          (x) => hitIds.includes(x.id) && this.hittable(x) && (ignoresMeleeHeight(p.hero) || !meleeHeightBlocked(this.layout, p.x, p.z, x.x, x.z)),
        );
        if (e) strike(e, Math.max(3, def.dmg * 0.35 * dmgMul), def.poise * 0.25 * postureMul, 1);
      }
      if (this.pvp) {
        for (const q of this.players.values()) {
          if (q.id === p.id || q.act === Act.Downed) continue;
          if (!ignoresMeleeHeight(p.hero) && meleeHeightBlocked(this.layout, p.x, p.z, q.x, q.z)) continue;
          const dx = q.x - p.x;
          const dz = q.z - p.z;
          const d = Math.hypot(dx, dz) - TUNING.playerRadius;
          if (d > range + TUNING.lagPad) continue;
          if (def.arc < 360 && d > 0.8 && Math.abs(angleDiff(yawOf(dx, dz), p.yaw)) > half) continue;
          any = hitRival(q, p.x, p.z) || any;
        }
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
    return e.state !== EState.Dead && e.state !== EState.Special;
  }

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
      raw?: boolean;
      crit?: number;
      mastery?: string;
    } = {},
  ): boolean {
    if (!this.hittable(e)) return false;
    const def = ENEMIES[e.type];
    let mul = 1;
    let crit = opts.crit ?? 0;
    let poiseMul = 1;
    let kbMul = 1;
    const mastery = opts.mastery;
    if (p && !opts.raw) {
      const up = getStatus(p.st, PS.DmgUp);
      if (up) mul *= 1 + up.p;
      if (hasStatus(p.st, PS.Wolf)) mul *= 1.5;
      if (hasStatus(p.st, PS.Berserk)) mul *= 1.35;
      if (hasStatus(p.st, PS.Counter)) {
        mul *= TUNING.counterDamage;
        poise *= TUNING.counterPoise;
        crit = 2;
        this.skillBonusUntil.set(p.id, this.time + 6);
      }
      if (hasStatus(p.st, PS.Stealth)) {
        mul *= 2;
        crit = 1;
      } else if (p.hero === 'albereth') {
        const toPlayer = yawOf(p.x - e.x, p.z - e.z);
        if (Math.abs(angleDiff(toPlayer, e.yaw)) > TUNING.backstabArc * RAD) {
          mul *= TUNING.alberethBackstabMul;
          crit = 1;
        }
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
      if (this.vexation.get(p.id)) {
        mul *= 1.15;
        crit = Math.max(crit, 1);
        this.vexation.set(p.id, false);
      }
      if (mastery === 'vessazione') this.vexation.set(p.id, true);
      if (mastery === 'rovesciamento' && opts.heavy) poiseMul *= 1.35;
      if (mastery === 'spinta') kbMul *= 1.55;
      const live = this.liveOf(p.id);
      if (live) {
        kbMul *= live.knockbackMul;
        poiseMul *= live.postureMul;
      }
      mul *= this.kazaBondMul(p);
    }
    if (!opts.raw) {
      if (hasStatus(e.st, ES.Marked)) mul *= TUNING.markedDamageMul;
      if (hasStatus(e.st, ES.Frozen)) mul *= TUNING.frozenDamageMul;
      if (hasStatus(e.st, ES.Confused)) mul *= TUNING.confusedDamageMul;
      if (e.state === EState.Broken) mul *= TUNING.brokenDamageMul;
    }
    if (p) mul *= p.dmgMul || 1;
    // SRD vuln/res/imm from fixed bestiary (legacy enemies without entries stay ×1).
    if (!opts.raw) {
      const entry = BESTIARY_BY_ID[e.type];
      const inv = p ? this.inventories.get(p.id) : undefined;
      const weapon = inv?.mainHand ? getItem(inv.mainHand.itemId) : undefined;
      const dmgType = weapon?.weapon?.damageType ?? 'contundente';
      let fromFront = false;
      let backstab = crit >= 1 && p?.hero === 'albereth';
      if (p) {
        const toPlayer = yawOf(p.x - e.x, p.z - e.z);
        fromFront = Math.abs(angleDiff(toPlayer, e.yaw)) <= 90 * RAD;
        if (p.hero === 'albereth' && Math.abs(angleDiff(toPlayer, e.yaw)) > TUNING.backstabArc * RAD) backstab = true;
      }
      const srd = damageMultiplier(entry, dmgType, { fromFront, backstab });
      if (srd === 0) {
        this.events.push({
          e: 'hit',
          id: e.id,
          dmg: 0,
          by: p ? p.id : '',
          x: e.x,
          z: e.z,
          crit: 0,
          kill: false,
          heavy: !!opts.heavy,
          kb: 0,
        });
        return false;
      }
      mul *= srd;
    }
    if (p) mul *= highGroundMul(this.layout, p.x, p.z, e.x, e.z);
    const amount = Math.max(1, Math.round(dmg * mul));
    e.hp -= amount;
    e.sinceHit = 0;
    if (def.dummy) e.hp = Math.max(1, e.hp);
    if (p) {
      e.lastHitBy = p.id;
      const st = this.stats.get(p.id);
      if (st) st.dmg += amount;
      p.ult = Math.min(100, p.ult + amount * TUNING.ultPerDamage * (p.hero === 'vyncent' ? 1.4 : 1));
      if (p.hero === 'vyncent') {
        const steal = hasStatus(p.st, PS.Wolf) ? 0.12 : TUNING.vyncentLifesteal;
        this.heal(p, amount * steal, false, p.id);
      }
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
      kb: (opts.kb ?? 0) * kbMul,
    });
    if (kill) {
      this.kill(e, p);
      return true;
    }

    const statusMul = p ? this.liveOf(p.id)?.statusDurationMul ?? 1 : 1;
    if (opts.effect === 'freeze') this.freeze(e, 2.5 * statusMul);
    else if (opts.effect === 'confuse') this.confuse(e, 2.5 * statusMul);
    if (mastery === 'lentezza') addStatus(e.st, ES.Slow, 3 * statusMul, 0.3);
    if (mastery === 'fiaccare') this.fiaccare.set(e.id, 0.8);

    if (opts.heavy && hasStatus(e.st, ES.Frozen) && opts.effect !== 'freeze') removeStatus(e.st, ES.Frozen);

    const poiseDmg = poise * poiseMul;
    if (e.state !== EState.Broken) {
      e.poise += poiseDmg;
      if (poiseDmg > 0) {
        this.events.push({ e: 'poise', id: e.id, dmg: Math.round(poiseDmg), x: e.x, z: e.z });
      }
      if (e.poise >= e.maxPoise) {
        this.breakEnemy(e);
      } else if (!def.steady && !hasStatus(e.st, ES.Frozen)) {
        const atk = def.attacks[e.atk];
        const armored = (e.state === EState.Windup && atk?.kind === 'red') || e.resolve > 0;
        if (!armored) {
          e.state = EState.Stagger;
          e.t = 0;
          e.n = opts.heavy || mastery === 'rovesciamento' ? 0.55 : 0.36;
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
      const k = opts.kb * kbMul * resist * TUNING.knockMul * (0.75 + mass * 0.35);
      e.kx += (dx / d) * k;
      e.kz += (dz / d) * k;
    }
    return true;
  }

  private freeze(e: EnemyState, secs: number): void {
    const def = ENEMIES[e.type];
    if (def.boss) addStatus(e.st, ES.Slow, secs, 0.5);
    else addStatus(e.st, ES.Frozen, def.elite ? secs * 0.5 : secs, 0);
  }

  private confuse(e: EnemyState, secs: number): void {
    const def = ENEMIES[e.type];
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
    this.fiaccare.delete(e.id);
    if (p) {
      const st = this.stats.get(p.id);
      if (st) st.kills++;
    }
    if (def.burst) this.addZone('burst', e.x, e.z, 3, 0.9, '', def.burst);
    // Megabonk loot: gems / coins / gear — no pause menus
    if (!this.safe && !def.dummy) {
      const luck = partyLuckMul(this.inventories.values());
      const drops = spawnKillLoot(e.type, e.x, e.z, luck, () => this.rng.next(), {
        executed: this.pendingExecuteLoot,
      });
      for (const d of drops) {
        this.loot.push(d);
        this.events.push({
          e: 'loot',
          dropId: d.dropId,
          kind: d.kind,
          x: d.x,
          z: d.z,
          amount: d.amount,
          itemId: d.itemId,
          rarity: d.rarity,
          gem: d.gem,
        });
      }
      // Boss relic: rolled for one hero and handed to the host, which puts it in that bag.
      if (def.boss) {
        const biome = (getZone(this.layout)?.biome ?? BESTIARY_BY_ID[e.type]?.biome ?? 'coastal') as BiomeId;
        const relic = spawnBossRelicChest(biome, e.x, e.z, this.rng);
        this.relicGrants.push({ hero: relic.hero, itemId: relic.itemId, banner: relic.banner });
        this.events.push({ e: 'say', who: 'Carlos', text: relic.banner });
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
    this.skillBonusUntil.set(p.id, this.time + 8);
    this.pendingExecuteLoot = true;
    this.damageEnemy(e, amount, 0, p, { raw: true, crit: 3 });
    this.pendingExecuteLoot = false;
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

  /** Healing potions are milk-based. Dalìth keeps half the cure and cramps. */
  private applyPotionHeal(p: PlayerState, amount: number, itemId: string): void {
    const lactose = p.hero === 'dalith' && itemId.startsWith('potion_');
    const kept = lactose ? Math.max(1, Math.round(amount * 0.5)) : amount;
    this.heal(p, kept, true, p.id);
    if (!lactose) return;
    addStatus(p.st, PS.Cramp, T(2.5), 0.35);
    this.events.push({ e: 'say', who: 'Dalìth', text: 'Latte nella pozione. Quel veleno non dimentica.' });
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
    if (this.noRevive) return;
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

  private castAbility(p: PlayerState): void {
    const st = this.stats.get(p.id);
    if (st) st.casts++;
    const id = HEROES[p.hero].ability.id;
    const cast = (what: string, r: number, x = p.x, z = p.z) =>
      this.events.push({ e: 'cast', id: p.id, what, x, z, yaw: p.yaw, r });
    switch (id) {
      case 'ocarina': {
        for (const e of this.enemiesNear(p.x, p.z, 8)) this.confuse(e, 5);
        cast(id, 8);
        break;
      }
      case 'canto': {
        for (const a of this.alliesNear(p.x, p.z, 12)) {
          addStatus(a.st, PS.Regen, T(4), HEROES[a.hero].hp * 0.09);
          removeStatus(a.st, PS.Slow);
        }
        cast(id, 12);
        break;
      }
      case 'balzo': {
        for (const e of this.enemiesNear(p.x, p.z, 3.6)) this.damageEnemy(e, 22, 26, p, { kb: 5, heavy: true });
        removeStatus(p.st, PS.Counter);
        cast(id, 3.6);
        break;
      }
      case 'provocazione': {
        for (const e of this.enemiesNear(p.x, p.z, 10)) {
          if (ENEMIES[e.type].dummy) continue;
          e.target = p.id;
          addStatus(e.st, ES.Taunted, 5, 0);
        }
        addStatus(p.st, PS.Guard, T(5), 0.45);
        cast(id, 10);
        break;
      }
      case 'marchio': {
        const e = this.enemies.find((x) => x.id === p.tgt && this.hittable(x));
        if (e) {
          for (const o of this.enemiesNear(e.x, e.z, 4)) addStatus(o.st, ES.Marked, 9, 0);
          this.damageEnemy(e, 14, 10, p, { kb: 1 });
          cast(id, 4, e.x, e.z);
        } else {
          const at = this.aimPoint(p, 12);
          for (const o of this.enemiesNear(at.x, at.z, 4)) addStatus(o.st, ES.Marked, 9, 0);
          cast(id, 4, at.x, at.z);
        }
        break;
      }
      case 'gelo': {
        const half = 45 * RAD;
        for (const e of this.enemiesNear(p.x, p.z, 8.5)) {
          const a = Math.abs(angleDiff(yawOf(e.x - p.x, e.z - p.z), p.yaw));
          if (a > half && Math.hypot(e.x - p.x, e.z - p.z) > 1.5) continue;
          if (this.damageEnemy(e, 18, 20, p, { kb: 2 }) && e.state !== EState.Dead) this.freeze(e, 3);
        }
        removeStatus(p.st, PS.Counter);
        cast(id, 8.5);
        break;
      }
      case 'bolla': {
        this.addZone('bubble', p.x, p.z, 7.2, 9, p.id, 0);
        cast(id, 7.2);
        break;
      }
      case 'ondata': {
        const roll = this.rng.int(5);
        if (roll === 0) {
          for (const e of this.enemiesNear(p.x, p.z, 6)) this.damageEnemy(e, 30, 30, p, { kb: 6, heavy: true });
        } else if (roll === 1) {
          const near = this.enemiesNear(p.x, p.z, 14)
            .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
            .slice(0, 5);
          for (const e of near) {
            this.events.push({ e: 'fx', what: 'bolt', x: e.x, z: e.z, r: 1 });
            this.damageEnemy(e, 20, 22, p, { kb: 1, heavy: true });
          }
        } else if (roll === 2) {
          for (const e of this.enemiesNear(p.x, p.z, 7)) this.freeze(e, 2.5);
        } else if (roll === 3) {
          for (const a of this.alliesNear(p.x, p.z, 10)) this.heal(a, (a.maxHp || HEROES[a.hero].hp) * 0.2, true, p.id);
        } else {
          for (const e of this.enemiesNear(p.x, p.z, 8)) {
            this.damageEnemy(e, 16, 10, p, { kb: 3 });
            if (e.state !== EState.Dead) this.confuse(e, 4);
          }
          if (!this.safe) p.hp = Math.max(1, p.hp - 8);
        }
        removeStatus(p.st, PS.Counter);
        cast(`ondata_${roll}`, roll === 1 ? 14 : roll === 3 ? 10 : 7);
        break;
      }
      case 'danza': {
        for (const e of this.enemiesNear(p.x, p.z, 7.5)) {
          this.confuse(e, 4);
          addStatus(e.st, ES.Marked, 7, 0);
        }
        addStatus(p.st, PS.Haste, T(4), 0.18);
        cast(id, 7.5);
        break;
      }
    }
  }

  private castUlt(p: PlayerState): void {
    const st = this.stats.get(p.id);
    if (st) st.ults++;
    const id = HEROES[p.hero].ult.id;
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
        cast(3);
        break;
      }
      case 'ballata': {
        for (const a of this.alliesNear(p.x, p.z, 14, true)) {
          if (this.pvp && a.id !== p.id) continue;
          if (a.act === Act.Downed) this.revive(a.id, p);
          this.heal(a, (a.maxHp || HEROES[a.hero].hp) * 0.25, true, p.id);
          addStatus(a.st, PS.DmgUp, T(10), 0.3);
          addStatus(a.st, PS.Haste, T(10), 0.15);
        }
        cast(14);
        break;
      }
      case 'licantropo': {
        addStatus(p.st, PS.Wolf, T(12), 0);
        this.heal(p, (p.maxHp || HEROES[p.hero].hp) * 0.15, true, p.id);
        cast(4);
        break;
      }
      case 'sisma': {
        for (const e of this.enemiesNear(p.x, p.z, 9)) this.damageEnemy(e, 48, 65, p, { kb: 10, heavy: true });
        if (this.pvp) {
          for (const q of this.players.values()) {
            if (q.id === p.id || q.act === Act.Downed) continue;
            if (Math.hypot(q.x - p.x, q.z - p.z) > 9) continue;
            this.tryHitPlayer(q, { dmg: 48, red: true, kb: 10, ox: p.x, oz: p.z, src: 0, by: p.id });
          }
        }
        cast(9);
        break;
      }
      case 'pioggia': {
        const at = this.aimPoint(p, 10);
        this.addZone('rain', at.x, at.z, 7, 5, p.id, 10);
        cast(7, at.x, at.z);
        break;
      }
      case 'furia': {
        addStatus(p.st, PS.Berserk, T(10), 0);
        cast(4);
        break;
      }
      case 'chiavistello': {
        for (const a of this.players.values()) {
          if (a.act === Act.Downed) continue;
          if (this.pvp && a.id !== p.id) continue;
          this.heal(a, (a.maxHp || HEROES[a.hero].hp) * 0.48, true, p.id);
          removeStatus(a.st, PS.Silence);
          removeStatus(a.st, PS.Slow);
        }
        this.zones = this.zones.filter((z) => !(z.kind === 'silence' && Math.hypot(z.x - p.x, z.z - p.z) <= 18));
        for (const e of this.enemiesNear(p.x, p.z, 13)) this.damageEnemy(e, 45, 60, p, { kb: 8, heavy: true });
        if (this.pvp) {
          for (const q of this.players.values()) {
            if (q.id === p.id || q.act === Act.Downed) continue;
            if (Math.hypot(q.x - p.x, q.z - p.z) > 13) continue;
            this.tryHitPlayer(q, { dmg: 45, red: true, kb: 8, ox: p.x, oz: p.z, src: 0, by: p.id });
          }
        }
        cast(13);
        break;
      }
      case 'collasso': {
        const at = this.aimPoint(p, 9);
        this.addZone('blackhole', at.x, at.z, 8, 4, p.id, 50);
        cast(8, at.x, at.z);
        break;
      }
      case 'spirale': {
        for (const e of this.enemiesNear(p.x, p.z, 8)) {
          this.damageEnemy(e, 32, 28, p, { kb: 5, heavy: true });
          if (e.state !== EState.Dead) {
            this.confuse(e, 5);
            addStatus(e.st, ES.Marked, 8, 0);
          }
        }
        for (const a of this.alliesNear(p.x, p.z, 9)) {
          addStatus(a.st, PS.Haste, T(a.id === p.id ? 5 : 4), a.id === p.id ? 0.2 : 0.1);
        }
        cast(8);
        break;
      }
    }
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

  private tryHitPlayer(p: PlayerState, spec: HitSpec): HitResult {
    if (p.act === Act.Downed) return 'none';
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
      const parryWindow = TUNING.perfectParry + (this.liveOf(p.id)?.perfectParryBonus ?? 0);
      if (!spec.red && p.t <= T(parryWindow)) {
        this.parry(p, spec);
        return 'parried';
      }
      this.block(p, spec);
      return 'blocked';
    }
    this.pending.push({ pid: p.id, spec, until: this.time + this.graceFor(p.id) });
    return 'pending';
  }

  /** Anthon blink arrival: brief chaos burst around the landing spot. */
  private anthonTrail(p: PlayerState): void {
    for (const e of this.enemiesNear(p.x, p.z, TUNING.anthonTrailR)) {
      this.damageEnemy(e, TUNING.anthonTrailDmg, TUNING.anthonTrailPoise, p, { kb: 2 });
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
    this.skillBonusUntil.set(p.id, this.time + 6);
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
    if (spec.src) {
      const src = this.enemies.find((e) => e.id === spec.src);
      if (src) {
        ax = src.x;
        az = src.z;
      }
    } else if (spec.by) {
      const atk = this.players.get(spec.by);
      if (atk) {
        ax = atk.x;
        az = atk.z;
      }
    }
    let dmg = spec.dmg * partyThreatMul(this.players.size) * highGroundMul(this.layout, ax, az, p.x, p.z);
    const live = this.liveOf(p.id);
    if (live) dmg *= live.physDamageTakenMul;
    const weaken = this.fiaccare.get(spec.src);
    if (weaken != null) {
      dmg *= weaken;
      this.fiaccare.delete(spec.src);
    }
    const guard = getStatus(p.st, PS.Guard);
    if (guard) dmg *= 1 - guard.p;
    if (hasStatus(p.st, PS.Bubble)) dmg *= 0.5;
    if (p.hero === 'fabyorn') {
      const max = p.maxHp || HEROES.fabyorn.hp;
      if (max > 0 && p.hp / max <= TUNING.fabyornLowHp) dmg *= TUNING.fabyornLowHpTakenMul;
    }
    const amount = Math.max(1, Math.round(dmg));
    p.hp -= amount;
    if (this.safe) p.hp = Math.max(1, p.hp);
    p.stamDelay = T(TUNING.staminaDelay);
    p.ult = Math.min(100, p.ult + amount * TUNING.ultPerDamageTaken * (p.hero === 'vyncent' ? 1.5 : 1));
    const st = this.stats.get(p.id);
    if (st) st.taken += amount;
    if (spec.by) {
      const atk = this.stats.get(spec.by);
      if (atk) atk.dmg += amount;
    }
    this.events.push({ e: 'phit', id: p.id, dmg: amount, x: p.x, z: p.z, red: spec.red });
    this.markSuffer(p.id, spec, true);
    if (p.hp <= 0) {
      if (spec.by) {
        const atk = this.stats.get(spec.by);
        if (atk) atk.kills++;
      }
      this.down(p);
      return;
    }
    if (spec.slow) addStatus(p.st, PS.Slow, T(spec.slow), 0.4);
    p.iframes = Math.max(p.iframes, T(TUNING.hitInvuln));
    if (isArmored(p, spec.red)) {
      this.knock(p, spec, 0.25);
    } else {
      p.act = Act.Hit;
      p.t = 0;
      p.charge = 0;
      p.combo = 0;
      p.buf = 0;
      this.knock(p, spec, 1);
    }
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

  private resolvePending(): void {
    if (this.pending.length === 0) return;
    const keep: PendingHit[] = [];
    for (const h of this.pending) {
      if (h.until > this.time) {
        keep.push(h);
        continue;
      }
      const p = this.players.get(h.pid);
      if (!p || p.act === Act.Downed) continue;
      if (p.iframes > 0) continue;
      if (h.spec.still && !h.spec.still(p)) continue;
      this.applyHit(p, h.spec);
    }
    this.pending = keep;
  }

  // ---------------------------------------------------------------- enemies

  spawnEnemy(type: EnemyTypeId, x: number, z: number): EnemyState {
    const def = ENEMIES[type];
    const n = partySize(this.players.size);
    const kind = enemyScaleKind(def);
    const scale = enemyHpMul(n, kind);
    // More heroes fill a stagger bar faster: the big ones get a longer bar to compensate.
    const maxPoise = Math.round(def.poise * enemyPoiseMul(n, !!def.elite && !def.dummy));
    const hp = Math.round(def.hp * scale);
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
      maxPoise,
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
    };
    this.enemies.push(e);
    this.events.push({ e: 'spawn', id: e.id });
    if ((def.elite || def.boss || def.bar) && !this.seenPersona.has(type)) {
      this.seenPersona.add(type);
      const tip = personaOf(type).strategy;
      if (tip) this.events.push({ e: 'hint', text: tip });
    }
    return e;
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
    for (const o of this.enemies) {
      if (o.id === e.id || o.state === EState.Dead) continue;
      pack.push(this.asHunter(o));
    }
    const hunter = this.asHunter(e);
    let best: PlayerState | undefined;
    let bestScore = Infinity;
    for (const p of this.players.values()) {
      if (!valid(p)) continue;
      const score = preyScore(persona, hunter, this.asPrey(p), pack, party, hint, order ?? undefined);
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
    return pickAttackIndex(
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
    this.setAim(e, atk, target);
  }

  private setAim(e: EnemyState, atk: EnemyAttackDef, target: PlayerState): void {
    if (!atk.aoe) {
      e.ax = target.x;
      e.az = target.z;
      return;
    }
    const dx = target.x - e.x;
    const dz = target.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const reach = Math.min(d, atk.aoeRange ?? d);
    e.ax = e.x + (dx / d) * reach;
    e.az = e.z + (dz / d) * reach;
  }

  private strike(e: EnemyState, def: EnemyDef, atk: EnemyAttackDef): void {
    const red = atk.kind === 'red';
    if (atk.special === 'rings') {
      this.addZone('ring', e.x, e.z, 0, RING_MAX / RING_SPEED, '', atk.dmg);
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
    if (atk.special === 'summon') {
      const count = 2 + Math.floor(this.players.size / 3);
      for (let i = 0; i < count; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const at = nearestFloor(this.layout, e.x + Math.sin(a) * 4, e.z + Math.cos(a) * 4);
        this.spawnEnemy('ombra', at.x, at.z);
      }
      this.events.push({ e: 'ecast', id: e.id, what: 'summon', x: e.x, z: e.z, r: 4 });
      return;
    }
    if (atk.proj) {
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
          effect: '',
          hit: [],
          eye: standElevation(this.layout, e.x, e.z),
        });
      }
      return;
    }
    const ox = e.x;
    const oz = e.z;
    const pad = TUNING.enemyHitPad;
    if (atk.aoe) {
      const cx = e.ax;
      const cz = e.az;
      const r = atk.aoe;
      this.events.push({ e: 'ecast', id: e.id, what: 'slam', x: cx, z: cz, r });
      for (const p of this.players.values()) {
        const at = this.hitPos(p, tmp);
        if (meleeHeightBlocked(this.layout, e.x, e.z, at.x, at.z)) continue;
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
          // Same radius as the strike — walking out of the slam must cancel the pending hit.
          still: (q) => Math.hypot(q.x - cx, q.z - cz) <= r + pad,
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
      if (meleeHeightBlocked(this.layout, e.x, e.z, at.x, at.z)) continue;
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
        // Re-check the exact swing volume after lag forgiveness (was reach+1.1 — phantom hits).
        still: (q) => inMelee(q.x, q.z),
      });
    }
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
    const eye = standElevation(this.layout, e.x, e.z);
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

  private emitTaunt(who: string, text: string, id: number, heroId = ''): void {
    if (!text || text === this.lastTauntText) return;
    this.lastTauntText = text;
    if (heroId) this.lastTauntHero = heroId;
    this.lastTauntAt = this.time;
    this.events.push({ e: 'taunt', who, text, id });
  }

  /** Who the next joke is about: whoever is actually eating hits, then someone else in the party. */
  private tauntVictim(): PlayerState | undefined {
    const alive = [...this.players.values()].filter((p) => p.act !== Act.Downed && !hasStatus(p.st, PS.Stealth));
    if (alive.length === 0) return undefined;
    const aimed = new Set(this.enemies.filter((e) => e.state !== EState.Dead && e.target).map((e) => e.target));
    const heat = (p: PlayerState) => {
      const marks = (this.suffer.get(p.id) ?? []).filter((m) => this.time - m.t <= 16);
      return marks.filter((m) => m.landed).length * 4 + marks.length + (aimed.has(p.id) ? 2 : 0);
    };
    const ranked = alive.slice().sort((a, b) => heat(b) - heat(a) || (a.id < b.id ? -1 : 1));
    const other = ranked.find((p) => p.id !== this.lastTauntHero);
    if (this.lastTauntHero && other) return other;
    return ranked.find((p) => heat(p) > 0);
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
      if (!this.quips || this.time - this.waitingQuip.since >= 2.8) {
        this.emitTaunt(this.waitingQuip.who, this.waitingQuip.text, this.waitingQuip.id, this.waitingQuip.heroId);
        this.waitingQuip = null;
      }
      return;
    }
    if (this.safe || this.time - this.lastTauntAt < 8) return;
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
      s.t -= dt;
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
    if (e.sinceHit > 1.5) e.flinches = 0;
    if (e.sinceHit > TUNING.poiseDecayDelay && e.state !== EState.Broken) {
      e.poise = Math.max(0, e.poise - TUNING.poiseDecay * dt);
    }
    if (def.dummy && e.sinceHit > 2) e.hp = Math.min(e.maxHp, e.hp + 60 * dt);
    e.cool = Math.max(0, e.cool - dt);
    e.retarget -= dt;

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

    if (def.boss || def.bar) {
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

    if (this.garrison.has(e.id) && e.state === EState.Idle) {
      this.patrol(e, def, dt);
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
    const eye = standElevation(this.layout, e.x, e.z);
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
    const speed = def.speed * slow;
    const faceYaw = yawOf(dx, dz);

    if (def.dummy) {
      e.yaw = approachAngle(e.yaw, faceYaw, 6 * dt);
      if (e.cool <= 0 && gap < 3.4) {
        const idx = this.chooseAttack(e, def, dist, target);
        if (idx >= 0) this.beginAttack(e, def, idx, target);
      }
      return;
    }

    const mind = personaOf(e.type).mind;
    const prey = this.asPrey(target);
    const slots = partyAttackSlots(!!def.ranged, this.players.size);
    const desperate = mind === 'hunter' && prey.maxHp > 0 && prey.hp / prey.maxHp < 0.35;
    const free = def.elite || def.boss || desperate || this.attackersOn(target.id, def.ranged) < slots;
    if (e.cool <= 0 && free && los && canCommitAttack(prey)) {
      const idx = this.chooseAttack(e, def, dist, target);
      if (idx >= 0) {
        this.beginAttack(e, def, idx, target);
        return;
      }
    }

    const wantAttack = e.cool <= 0.4 && free;
    const charge = chargeWindow(def.attacks, e.phase);
    const mode = steerMode(
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
    const lungeTime = 0.28;
    const lungeStart = atk.windup - lungeTime;
    if (target && target.act !== Act.Downed && e.t < lungeStart) {
      e.yaw = approachAngle(e.yaw, yawOf(target.x - e.x, target.z - e.z), 7 * dt);
      if (atk.aoe && e.t < atk.windup * 0.55) this.setAim(e, atk, target);
    }
    if (atk.lunge > 0 && e.t >= lungeStart && prevT < atk.windup) {
      const step = (atk.lunge / lungeTime) * dt;
      if (atk.aoe) {
        const dx = e.ax - e.x;
        const dz = e.az - e.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) this.moveEnemy(e, def, dx, dz, Math.min(step, d) / dt, dt);
      } else {
        let allowed = step;
        if (target) {
          const gap = Math.hypot(target.x - e.x, target.z - e.z) - def.radius - TUNING.playerRadius - 0.3;
          allowed = Math.max(0, Math.min(step, gap));
        }
        const ox = e.x;
        const oz = e.z;
        e.x += Math.sin(e.yaw) * allowed;
        e.z += Math.cos(e.yaw) * allowed;
        collide(this.layout, e.x, e.z, def.radius, tmp, standElevation(this.layout, ox, oz));
        e.x = tmp.x;
        e.z = tmp.z;
      }
    }
    const gapT = atk.hitGap ?? 0.7;
    while (e.struck < e.n && e.t >= atk.windup + e.struck * gapT) {
      this.strike(e, def, atk);
      e.struck++;
      // A perfect parry staggers or breaks the attacker mid-swing.
      if (e.state !== EState.Windup) return;
    }
    if (e.struck >= e.n) {
      e.state = EState.Recover;
      e.t = 0;
      // A boss facing a crowd keeps the pressure up: he has more heroes to answer.
      const crowd = def.boss ? 1 / (1 + 0.12 * (Math.max(1, this.players.size) - 1)) : 1;
      e.cool = atk.cd * this.rng.range(0.62, 1.02) * crowd;
    }
  }

  private roar(e: EnemyState, def: EnemyDef): void {
    this.events.push({ e: 'ecast', id: e.id, what: 'roar', x: e.x, z: e.z, r: 11 });
    for (const p of this.players.values()) {
      if (p.act === Act.Downed) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 11) continue;
      p.kx = (dx / d) * 30;
      p.kz = (dz / d) * 30;
    }
    const count = 3 + Math.floor(this.players.size / 2);
    for (let i = 0; i < count; i++) {
      const s = this.rng.pick(this.layout.enemySpawns);
      this.spawnEnemy(i % 3 === 2 ? 'accolito' : 'cultista', s.x + this.rng.range(-1, 1), s.z + this.rng.range(-1, 1));
    }
    this.events.push({
      e: 'say',
      who: def.name,
      text: e.phase === 1 ? 'IL SILENZIO È LEGGE. E VOI SIETE RUMORE.' : 'TACETE. TACETE. TACETE!',
    });
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
            hitPlayer = undefined;
          }
        }
        if (this.pvp) {
          for (const q of this.players.values()) {
            if (q.id === pr.owner || q.act === Act.Downed || pr.hit.includes(this.pidIndex(q.id))) continue;
            const t = along(q.x, q.z, TUNING.playerRadius + pr.r);
            if (t < hitAt) {
              hitAt = t;
              hitPlayer = q;
              hitEnemy = undefined;
            }
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
        this.damageEnemy(hitEnemy, pr.dmg, pr.poise, owner, { kb: 2, heavy: pr.effect === 'heavy' });
        if (owner) removeStatus(owner.st, PS.Counter);
        pr.hit.push(hitEnemy.id);
        if (pr.aoe > 0) this.explode(pr, owner, hitEnemy.id);
        if (pr.pierce > 0) pr.pierce--;
        else dead = true;
      } else if (hitPlayer) {
        pr.x = sx + pr.dx * hitAt;
        pr.z = sz + pr.dz * hitAt;
        const res = this.tryHitPlayer(hitPlayer, {
          dmg: pr.dmg,
          red: pr.red || pr.effect === 'heavy',
          kb: 3,
          ox: sx,
          oz: sz,
          src: pr.src,
          family: pr.owner ? undefined : 'shot',
          by: pr.owner || undefined,
        });
        if (res === 'parried') {
          // A perfect parry sends the projectile back where it came from.
          pr.owner = hitPlayer.id;
          pr.dx = -pr.dx;
          pr.dz = -pr.dz;
          const src = this.enemies.find((e) => e.id === pr.src);
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
          pr.hit = [];
        } else if (res === 'dodged') {
          pr.hit.push(this.pidIndex(hitPlayer.id));
        } else {
          pr.hit.push(this.pidIndex(hitPlayer.id));
          if (pr.aoe > 0 && pr.owner) this.explode(pr, this.players.get(pr.owner) ?? null, 0);
          if (pr.pierce > 0) pr.pierce--;
          else dead = true;
        }
      } else {
        pr.x = ex;
        pr.z = ez;
        if (sightBlocked(this.layout, ex, ez, pr.eye)) {
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
      this.damageEnemy(e, pr.dmg * 0.7, pr.poise * 0.7, owner, { kb: 3 });
    }
    if (this.pvp && owner) {
      for (const q of this.players.values()) {
        if (q.id === owner.id || q.act === Act.Downed) continue;
        if (Math.hypot(q.x - pr.x, q.z - pr.z) > pr.aoe + TUNING.playerRadius) continue;
        this.tryHitPlayer(q, {
          dmg: pr.dmg * 0.7,
          red: true,
          kb: 3,
          ox: pr.x,
          oz: pr.z,
          src: 0,
          by: owner.id,
        });
      }
    }
    pr.aoe = 0;
  }

  private stepZones(dt: number): void {
    const keep: Zone[] = [];
    for (const z of this.zones) {
      z.t += dt;
      const owner = z.owner ? (this.players.get(z.owner) ?? null) : null;
      const done = z.t >= z.dur;
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
          z.tick -= dt;
          if (z.tick <= 0) {
            z.tick += 0.5;
            for (const e of this.enemiesNear(z.x, z.z, z.r)) {
              addStatus(e.st, ES.Marked, 4, 0);
              this.damageEnemy(e, z.power, 5, owner, {});
            }
            if (this.pvp && owner) {
              for (const q of this.players.values()) {
                if (q.id === owner.id || q.act === Act.Downed) continue;
                if (Math.hypot(q.x - z.x, q.z - z.z) > z.r) continue;
                this.tryHitPlayer(q, { dmg: z.power, red: false, kb: 1, ox: z.x, oz: z.z, src: 0, by: owner.id });
              }
            }
          }
          break;
        }
        case 'blackhole':
        case 'pull': {
          const strength = z.kind === 'blackhole' ? 7 : 11;
          for (const e of this.enemiesNear(z.x, z.z, z.r * 1.25)) {
            const def = ENEMIES[e.type];
            if (def.boss || def.dummy) continue;
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
          if (this.pvp && owner) {
            for (const q of this.players.values()) {
              if (q.id === owner.id || q.act === Act.Downed) continue;
              const dx = z.x - q.x;
              const dz = z.z - q.z;
              const d = Math.hypot(dx, dz);
              if (d > z.r * 1.25 || d <= 0.6) continue;
              const feet = standElevation(this.layout, q.x, q.z);
              const s = Math.min(strength * dt * 0.85, d - 0.5) / d;
              collide(this.layout, q.x + dx * s, q.z + dz * s, TUNING.playerRadius, tmp, feet);
              q.x = tmp.x;
              q.z = tmp.z;
            }
          }
          if (z.kind === 'blackhole') {
            z.tick -= dt;
            if (z.tick <= 0) {
              z.tick += 0.5;
              for (const e of this.enemiesNear(z.x, z.z, z.r)) this.damageEnemy(e, 8, 6, owner, {});
              if (this.pvp && owner) {
                for (const q of this.players.values()) {
                  if (q.id === owner.id || q.act === Act.Downed) continue;
                  if (Math.hypot(q.x - z.x, q.z - z.z) > z.r) continue;
                  this.tryHitPlayer(q, { dmg: 8, red: false, kb: 2, ox: z.x, oz: z.z, src: 0, by: owner.id });
                }
              }
            }
          }
          if (done) {
            for (const e of this.enemiesNear(z.x, z.z, z.r)) {
              this.damageEnemy(e, z.power, z.power, owner, { kb: 6, heavy: true });
            }
            if (this.pvp && owner) {
              for (const q of this.players.values()) {
                if (q.id === owner.id || q.act === Act.Downed) continue;
                if (Math.hypot(q.x - z.x, q.z - z.z) > z.r) continue;
                this.tryHitPlayer(q, { dmg: z.power, red: true, kb: 6, ox: z.x, oz: z.z, src: 0, by: owner.id });
              }
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
            this.tryHitPlayer(p, { dmg: z.power, red: true, kb: 6, ox: z.x, oz: z.z, src: 0 });
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

  // ---------------------------------------------------------------- waves

  private livingEnemies(): number {
    let n = 0;
    for (const e of this.enemies) if (e.state !== EState.Dead && !ENEMIES[e.type].dummy) n++;
    return n;
  }

  enemiesLeft(): number {
    return this.livingEnemies() + this.spawnQueue.length;
  }

  private startWave(idx: number): void {
    this.waveIdx = idx;
    const wave = this.waves[idx]!;
    const n = partySize(this.players.size);
    this.spawnQueue = [];
    let at = this.time + 0.4;
    let total = 0;
    for (const [type, base] of wave.spawns) {
      const def = ENEMIES[type];
      const kind = enemyScaleKind(def);
      const count = waveEnemyCount(base, n, kind === 'dummy' ? 'grunt' : kind);
      total += count;
      for (let i = 0; i < count; i++) {
        this.spawnQueue.push({ type, at });
        at += def.bar ? 0 : 0.45;
      }
    }
    this.waveState = 'spawning';
    this.events.push({ e: 'wave', n: idx + 1, of: this.waves.length });
    if (n > 1) {
      this.events.push({
        e: 'hint',
        text: `Compagnia di ${n}: ${total} nemici in campo · minaccia +${Math.round((partyThreatMul(n) / TUNING.threatMul - 1) * 100)}%.`,
      });
    }
    if (wave.hint) this.events.push({ e: 'hint', text: wave.hint });
    for (const line of wave.say ?? []) this.events.push({ e: 'say', who: line.who, text: line.text });
  }

  private spawnPoint(type: EnemyTypeId): Point {
    const def = ENEMIES[type];
    if (def.bar && this.layout.bossSpawn) return this.layout.bossSpawn;
    const spawns = this.layout.enemySpawns;
    // Prefer spawn points away from the players so nobody is ambushed point-blank.
    let pool = spawns.filter((s) => {
      for (const p of this.players.values()) if (Math.hypot(p.x - s.x, p.z - s.z) < 9) return false;
      return true;
    });
    if (pool.length === 0) pool = spawns;
    const s = this.rng.pick(pool);
    const at = { x: s.x + this.rng.range(-1.3, 1.3), z: s.z + this.rng.range(-1.3, 1.3) };
    collide(this.layout, at.x, at.z, def.radius, at);
    return at;
  }

  private stepWaves(dt: number): void {
    switch (this.waveState) {
      case 'intro':
      case 'between':
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.startWave(this.waveIdx + 1);
        break;
      case 'spawning':
        while (this.spawnQueue.length > 0 && this.spawnQueue[0]!.at <= this.time) {
          const s = this.spawnQueue.shift()!;
          const at = this.spawnPoint(s.type);
          this.spawnEnemy(s.type, at.x, at.z);
        }
        if (this.spawnQueue.length === 0) this.waveState = 'fighting';
        break;
      case 'fighting':
        if (this.livingEnemies() === 0) {
          if (this.waveIdx + 1 < this.waves.length) {
            this.waveState = 'between';
            this.waveTimer = 2.5;
          } else {
            this.waveState = 'done';
            this.events.push({ e: 'clear' });
          }
        }
        break;
    }
  }

  // ---------------------------------------------------------------- main step

  /** Advances enemies, projectiles, zones and waves. Player steps are driven by their commands. */
  step(dt: number): void {
    this.time += dt;
    for (const e of this.enemies) this.stepEnemy(e, dt);
    this.separate();
    this.stepProjectiles(dt);
    this.stepZones(dt);
    this.resolvePending();
    this.stepWaves(dt);
    this.stepLoot(dt);
    this.stepHeroRegen(dt);
    this.noteCaptain();
    this.jev?.pump(this.time);
    this.maybeTaunt();
    if (this.enemies.some((e) => e.state === EState.Dead && e.t > CORPSE_TIME)) {
      this.enemies = this.enemies.filter((e) => !(e.state === EState.Dead && e.t > CORPSE_TIME));
    }
  }

  private stepHeroRegen(dt: number): void {
    for (const p of this.players.values()) {
      if (p.act === Act.Downed) continue;
      // Albereth satyr pace: mild haste aura for nearby allies.
      if (p.hero === 'albereth') {
        for (const a of this.alliesNear(p.x, p.z, TUNING.alberethAuraRange)) {
          if (a.id === p.id) continue;
          addStatus(a.st, PS.Haste, T(0.4), TUNING.alberethAuraHaste);
        }
      }
      const live = this.liveOf(p.id);
      const q = this.effectQueues.get(p.id);
      if (q) {
        q.step(dt);
        if (live) q.syncPlayerStatuses(p, live.statusDurationMul);
      }
      // COS vigour: rest regen in the hub / safe rooms (combat uses potions & pickups).
      if (!this.safe || !live || live.hpRegenPerSec <= 0) continue;
      if (p.act !== Act.Idle) continue;
      if (p.hp >= p.maxHp) {
        this.regenAcc.set(p.id, 0);
        continue;
      }
      const acc = (this.regenAcc.get(p.id) ?? 0) + live.hpRegenPerSec * dt;
      if (acc >= 1) {
        const whole = Math.floor(acc);
        this.regenAcc.set(p.id, acc - whole);
        this.heal(p, whole, false);
      } else {
        this.regenAcc.set(p.id, acc);
      }
    }
  }

  private stepLoot(dt: number): void {
    if (this.loot.length === 0) return;
    const heroes = [...this.players.values()]
      .filter((p) => p.act !== Act.Downed)
      .map((p) => ({
        id: p.id,
        x: p.x,
        z: p.z,
        pickupRadius: this.liveOf(p.id)?.pickupRadius ?? 2.4,
      }));
    this.loot = stepLootPhysics(this.loot, heroes, dt);

    // Atomic claims when within 0.55 m
    for (const d of this.loot) {
      if (d.claimedBy) continue;
      let best: { id: string; dist: number } | null = null;
      for (const h of heroes) {
        const dist = Math.hypot(h.x - d.x, h.z - d.z);
        if (dist <= 0.55 && (!best || dist < best.dist)) best = { id: h.id, dist };
      }
      if (!best) continue;
      const inv = this.inventories.get(best.id);
      if (!inv) continue;
      const skill = (this.skillBonusUntil.get(best.id) ?? 0) > this.time;
      const result = tryClaimDrop(d, best.id, inv, { skillBonus: skill });
      if (!result.ok) continue;

      if (result.sharedXp != null) {
        const prevLevels = new Map<string, number>();
        for (const [id, inv2] of this.inventories) prevLevels.set(id, levelFromDndXp(inv2.pe));
        awardPartyXp(this.inventories, {
          shared: result.sharedXp,
          bonus: result.bonusXp ?? 0,
          pickerId: best.id,
        });
        for (const [id, inv2] of this.inventories) {
          this.refreshLiveStats(id);
          const prev = prevLevels.get(id) ?? 1;
          const next = levelFromDndXp(inv2.pe);
          if (next > prev) this.onLevelUp(id, prev, next);
        }
      }

      if (result.magnet) this.magnetAllGems(best.id);
      if (result.item && result.instantHeal) {
        const def = getItem(result.item.itemId);
        const healOp = def?.effects?.find((o) => o.op === 'heal_dice');
        if (healOp?.param) {
        const p = this.players.get(best.id);
        if (p) this.applyPotionHeal(p, rollDice(healOp.param, () => this.rng.next()), result.item.itemId);
        }
      }
      if (result.fillUlt) {
        const p = this.players.get(best.id);
        if (p) p.ult = Math.min(100, p.ult + result.fillUlt);
        for (const e of this.enemiesNear(
          this.players.get(best.id)?.x ?? 0,
          this.players.get(best.id)?.z ?? 0,
          5,
        )) {
          e.poise = Math.min(e.maxPoise, e.poise + e.maxPoise * 0.3);
          if (e.poise >= e.maxPoise) this.breakEnemy(e);
        }
      }
      // Arena judgment / blood handled via item effects enqueue for consumables later
      if (result.item && getItem(result.item.itemId)?.kind === 'arena') {
        const def = getItem(result.item.itemId)!;
        const q = this.effectQueues.get(best.id);
        const p = this.players.get(best.id);
        if (q && p && def.effects) {
          q.enqueueOpcodes(def.id, def.effects, {
            heal: (amt) => this.heal(p, amt, true, best.id),
            magnetAll: () => this.magnetAllGems(best.id),
            fillUlt: (pct) => {
              p.ult = Math.min(100, p.ult + pct);
            },
            fillPoiseNear: (frac) => {
              for (const e of this.enemiesNear(p.x, p.z, 5)) {
                e.poise = Math.min(e.maxPoise, e.poise + e.maxPoise * frac);
                if (e.poise >= e.maxPoise) this.breakEnemy(e);
              }
            },
            rng: () => this.rng.next(),
          });
        }
      }

      this.events.push({
        e: 'pickup',
        id: best.id,
        dropId: d.dropId,
        kind: d.kind,
        amount: d.amount + (result.bonusXp ?? 0),
        itemId: result.item?.itemId ?? d.itemId,
        toast: result.toast,
      });
    }
    this.loot = this.loot.filter((d) => !d.claimedBy);
  }

  private magnetAllGems(pickerId: string): void {
    const inv = this.inventories.get(pickerId);
    if (!inv) return;
    let shared = 0;
    for (const d of this.loot) {
      if (d.kind !== 'gem' || d.claimedBy) continue;
      d.claimedBy = pickerId;
      shared += d.amount;
    }
    if (shared <= 0) return;
    const skill = (this.skillBonusUntil.get(pickerId) ?? 0) > this.time;
    const bonus = skill ? Math.round(shared * 0.15) : 0;
    const prevLevels = new Map<string, number>();
    for (const [id, inv2] of this.inventories) prevLevels.set(id, levelFromDndXp(inv2.pe));
    awardPartyXp(this.inventories, { shared, bonus, pickerId });
    for (const [id, inv2] of this.inventories) {
      this.refreshLiveStats(id);
      const prev = prevLevels.get(id) ?? 1;
      const next = levelFromDndXp(inv2.pe);
      if (next > prev) this.onLevelUp(id, prev, next);
    }
    this.events.push({
      e: 'pickup',
      id: pickerId,
      dropId: 'magnet',
      kind: 'gem',
      amount: shared + bonus,
      toast: `Magnete! +${shared + bonus} PE`,
    });
  }

  private onLevelUp(id: string, from: number, to: number): void {
    const p = this.players.get(id);
    const inv = this.inventories.get(id);
    if (!p || !inv) return;
    const hero = HEROES[p.hero];
    for (let L = from + 1; L <= to; L++) {
      const live = this.refreshLiveStats(id);
      const gain = levelUpHpGain(p.hero, live?.mods.COS ?? 0, hero.hp);
      p.maxHp += gain;
      p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.45));
      if (ASI_LEVELS.includes(L as (typeof ASI_LEVELS)[number])) inv.asiPoints += 2;
      inv.pendingCards = rollLevelUpCards(() => this.rng.next(), L);
      this.events.push({ e: 'levelup', id, level: L, cards: inv.pendingCards });
      // Bonk! shockwave — shove nearby enemies so you don't die mid level-up
      this.events.push({ e: 'bonk', x: p.x, z: p.z, r: 4.5 });
      for (const e of this.enemiesNear(p.x, p.z, 4.5)) {
        if (!this.hittable(e)) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        e.kx += (dx / d) * 10;
        e.kz += (dz / d) * 10;
        e.poise += 12;
      }
    }
  }

  useBelt(id: string, slot: number): boolean {
    const p = this.players.get(id);
    const inv = this.inventories.get(id);
    const q = this.effectQueues.get(id);
    if (!p || !inv || !q || p.act === Act.Downed) return false;
    const used = consumeBeltSlot(inv, slot);
    if (!used) return false;
    const def = getItem(used.itemId);
    if (!def?.effects) return false;
    const live = this.liveOf(id);
    q.enqueueOpcodes(def.id, def.effects, {
      heal: (amt) => this.applyPotionHeal(p, amt, used.itemId),
      damageAoe: (dice, _type, radius) => {
        const dmg = rollDice(dice, () => this.rng.next());
        for (const e of this.enemiesNear(p.x, p.z, radius)) {
          this.damageEnemy(e, dmg, dmg * 0.6, p, { kb: 3, heavy: true });
        }
        this.events.push({ e: 'fx', what: 'slam', x: p.x, z: p.z, r: radius });
      },
      magnetAll: () => this.magnetAllGems(id),
      fillUlt: (pct) => {
        p.ult = Math.min(100, p.ult + pct);
      },
      curePoison: () => clearPoisonLike(p.st),
      rng: () => this.rng.next(),
    });
    q.syncPlayerStatuses(p, live?.statusDurationMul ?? 1);
    this.refreshLiveStats(id);
    return true;
  }

  pickLevelCard(id: string, index: number): boolean {
    const inv = this.inventories.get(id);
    if (!inv || !inv.pendingCards.length) return false;
    const card = inv.pendingCards[index] as MegabonkTomeId | undefined;
    if (!card) return false;
    inv.tomes.push(card);
    inv.pendingCards = [];
    this.refreshLiveStats(id);
    return true;
  }

  spendAsi(id: string, ability: AbilityId): boolean {
    const inv = this.inventories.get(id);
    if (!inv || inv.asiPoints <= 0) return false;
    inv.asiSpends[ability] = (inv.asiSpends[ability] ?? 0) + 1;
    inv.asiPoints -= 1;
    this.refreshLiveStats(id);
    return true;
  }

  invAction(id: string, op: 'equip' | 'salvage' | 'belt', uid: string, slot?: number): boolean {
    const inv = this.inventories.get(id);
    if (!inv) return false;
    let ok = false;
    if (op === 'equip') ok = equipFromBag(inv, uid);
    else if (op === 'salvage') ok = salvageItem(inv, uid) > 0;
    else if (op === 'belt') ok = assignBelt(inv, uid, slot ?? 0);
    if (ok) this.refreshLiveStats(id);
    return ok;
  }

  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
