import type { BountyVerdict } from './bounties';
import type { CityId, Stage } from './campaign';
import type { Loadout } from './cosmetics';
import type { Purse } from './economy';
import { ENEMY_IDS } from './enemies';
import type { Profile } from './profile';
import type { PlayerStats } from './world';
import { ES, type EnemyState, type EnemyTypeId, type GameEvent, type HeroId, type InputCmd, type PingKind, type PlayerState, type Projectile, type Zone } from './types';

/**
 * select: the 3D Hero Selection screen, until the whole lobby confirms.
 * hub: La Taverna di Carl.
 * run: an Environment, a City Boss arena or the Region Boss.
 */
export type Phase = 'select' | 'hub' | 'run';

export interface LobbyPlayer {
  id: string;
  name: string;
  hero: HeroId | '';
  /** Pressed "Conferma Pronto" on the Hero Selection screen. */
  ready: boolean;
  /** Stable index 0..8: the colour of this player on the radar and on pointers. */
  slot: number;
  look: Loadout;
  /** Title text bought from Saraya ('' = none). */
  title: string;
}

export type VoteChoice = 'extract' | 'continue';

/** The Choice Terminal at the Extraction Portal. Both outcomes need unanimity. */
export interface VoteState {
  /** Who opened the portal. */
  by: string;
  votes: Record<string, VoteChoice | ''>;
  /** Label of the stage "Go on" leads to. */
  next: string;
  /** Fervor bonus (0..1) the next stage would carry. */
  nextFervor: number;
}

export interface RunState {
  stage: Stage;
  label: string;
  name: string;
  /** Consecutive stages entered without saving. */
  streak: number;
  /** Fervor loot bonus of the current stage (0..1). */
  fervor: number;
  /** Company drop-rate bonus (0..0.3). */
  company: number;
  bounty: string;
  bountyState: BountyVerdict;
}

export type ReportKind = 'extract' | 'wipe' | 'city' | 'region';

/** Shown in the hub after an expedition ends. */
export interface RunReport {
  /** Increments with every report, so a client shows each one once. */
  n: number;
  kind: ReportKind;
  label: string;
  /** What each player put in the bank. */
  banked: Record<string, Purse>;
  /** What the Death Tax burned for each player. */
  taxed: Record<string, Purse>;
  /** Contract paid at extraction ('' = none). */
  bounty: string;
  bountyPaid: number;
  stats: Record<string, PlayerStats>;
}

/** What the Map Table offers, from the Host's profile. */
export interface TableState {
  checkpoint: Partial<Record<CityId, number>>;
  cleared: CityId[];
  regionBoss: boolean;
  regionCleared: boolean;
  bounties: boolean;
  bounty: string;
}

export interface LobbyState {
  code: string;
  host: string;
  /** True when anyone may walk in without a private code. */
  public: boolean;
  phase: Phase;
  players: LobbyPlayer[];
  table: TableState;
  run: RunState | null;
  vote: VoteState | null;
  report: RunReport | null;
}

export interface WorldInfo {
  /** Increments every time the world is rebuilt. */
  wid: number;
  kind: 'hub' | 'run';
  layoutId: string;
  title: string;
  /** "Badiscar · Ambiente 2 di 3" */
  label: string;
  blurb: string;
}

export interface EnemySnap {
  id: number;
  type: EnemyTypeId;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  /** Stagger bar 0..1. */
  poise: number;
  state: number;
  t: number;
  atk: number;
  ax: number;
  az: number;
  /** Bitmask of ES statuses (1 << kind). */
  st: number;
  phase: number;
}

export interface ProjSnap {
  id: number;
  kind: string;
  x: number;
  z: number;
  dx: number;
  dz: number;
  speed: number;
  owner: string;
}

export interface ZoneSnap {
  id: number;
  kind: string;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
}

export interface Snapshot {
  w: number;
  /** Server clock in ms. */
  t: number;
  /** Last input sequence processed per player. */
  ack: Record<string, number>;
  p: PlayerState[];
  e: number[][];
  pr: ProjSnap[];
  z: ZoneSnap[];
  /** Public events. Instanced loot travels in the private `mine` message. */
  ev: GameEvent[];
  /** State of every point of interest, in layout order (0 locked, 1 ready, 2 used). */
  poi: number[];
  /** Highest flooded elevation. */
  flood: number;
  /** Synergy buffs active on the party. */
  syn: string[];
  /** Living foes. */
  left: number;
  /** Seconds since this map started. */
  time: number;
  /** Blood Gates in layout order: [open 0|1, guards slain, guards needed, elites slain, elites needed]. */
  gates?: number[][];
}

export type ClientMsg =
  /** `v`: server clock (ms) the client was showing when it produced these commands. */
  | { t: 'i'; c: number[]; v?: number }
  /** Hero Selection: highlight a hero ('' releases it). */
  | { t: 'hero'; hero: string }
  /** Hero Selection: "Conferma Pronto" (or take it back). */
  | { t: 'ready'; on: boolean }
  /** Hub: go back to the Hero Selection screen. */
  | { t: 'reselect' }
  /** Map Table (Host only): start a City run or dare the Region Boss. */
  | { t: 'run'; city: string }
  /** Choice Terminal. */
  | { t: 'vote'; choice: string }
  /** Ping system: mark a spot in the world and on the radar. */
  | { t: 'mark'; kind: PingKind; x: number; z: number }
  /** Iej. */
  | { t: 'tree'; op: 'buy' | 'respec' | 'blueprint'; slot: string; path?: string }
  /** Saraya. */
  | { t: 'cosm'; op: 'buy' | 'equip'; id: string; slot?: string }
  /** Eleonora (Host only). An empty id tears the contract up. */
  | { t: 'bounty'; id: string }
  /** Name the server-side profile to load. */
  | { t: 'profile'; id: string }
  | { t: 'ping'; at: number }
  | { t: 'rtt'; ms: number };

export type ServerMsg =
  | { t: 'welcome'; id: string }
  | { t: 'lobby'; s: LobbyState }
  | { t: 'world'; w: WorldInfo }
  | { t: 'snap'; s: Snapshot }
  /** Private: instanced loot events and the unbanked satchel of this player. */
  | { t: 'mine'; ev: GameEvent[]; sat: Purse }
  /** Private: the permanent profile of this player. */
  | { t: 'profile'; p: Profile }
  | { t: 'pong'; at: number }
  | { t: 'error'; text: string };

const CMD_FIELDS = 6;

export function packCmds(cmds: InputCmd[]): number[] {
  const out: number[] = [];
  for (const c of cmds) {
    out.push(c.seq, Math.round(c.mx * 1000), Math.round(c.mz * 1000), c.buttons, Math.round(c.aim * 1000), c.lock);
  }
  return out;
}

export function unpackCmds(data: unknown): InputCmd[] {
  const out: InputCmd[] = [];
  if (!Array.isArray(data)) return out;
  for (let i = 0; i + CMD_FIELDS <= data.length; i += CMD_FIELDS) {
    const seq = Number(data[i]);
    const mx = Number(data[i + 1]) / 1000;
    const mz = Number(data[i + 2]) / 1000;
    const buttons = Number(data[i + 3]) | 0;
    const aim = Number(data[i + 4]) / 1000;
    const lock = Number(data[i + 5]) | 0;
    if (![seq, mx, mz, aim].every(Number.isFinite)) continue;
    const len = Math.hypot(mx, mz);
    const k = len > 1 ? 1 / len : 1;
    out.push({ seq, mx: mx * k, mz: mz * k, buttons: buttons & 127, aim, lock });
  }
  return out;
}

/** Quantises what the client predicted with so both sides step on identical inputs. */
export function quantizeCmd(c: InputCmd): InputCmd {
  return unpackCmds(packCmds([c]))[0]!;
}

export function packEnemy(e: EnemyState): number[] {
  let st = 0;
  for (const s of e.st) st |= 1 << s.k;
  return [
    e.id,
    ENEMY_IDS.indexOf(e.type),
    Math.round(e.x * 100),
    Math.round(e.z * 100),
    Math.round(e.yaw * 1000),
    Math.max(0, Math.round(e.hp)),
    e.maxHp,
    Math.round(Math.min(1, e.poise / e.maxPoise) * 100),
    e.state,
    Math.round(e.t * 100),
    e.atk,
    Math.round(e.ax * 100),
    Math.round(e.az * 100),
    st,
    e.phase,
  ];
}

export function unpackEnemy(a: number[]): EnemySnap {
  return {
    id: a[0]!,
    type: ENEMY_IDS[a[1]!]!,
    x: a[2]! / 100,
    z: a[3]! / 100,
    yaw: a[4]! / 1000,
    hp: a[5]!,
    maxHp: a[6]!,
    poise: a[7]! / 100,
    state: a[8]!,
    t: a[9]! / 100,
    atk: a[10]!,
    ax: a[11]! / 100,
    az: a[12]! / 100,
    st: a[13]!,
    phase: a[14]!,
  };
}

export function enemyHas(st: number, kind: number): boolean {
  return (st & (1 << kind)) !== 0;
}

export const ENEMY_STATUS = ES;

export function packProjectile(p: Projectile): ProjSnap {
  return {
    id: p.id,
    kind: p.kind,
    x: Math.round(p.x * 100) / 100,
    z: Math.round(p.z * 100) / 100,
    dx: Math.round(p.dx * 1000) / 1000,
    dz: Math.round(p.dz * 1000) / 1000,
    speed: p.speed,
    owner: p.owner,
  };
}

export function packZone(z: Zone): ZoneSnap {
  return {
    id: z.id,
    kind: z.kind,
    x: Math.round(z.x * 100) / 100,
    z: Math.round(z.z * 100) / 100,
    r: Math.round(z.r * 100) / 100,
    t: Math.round(z.t * 100) / 100,
    dur: z.dur,
  };
}
