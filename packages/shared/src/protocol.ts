import { ENEMY_IDS } from './enemies';
import type { PlayerStats } from './world';
import { ES, type EnemyState, type EnemyTypeId, type GameEvent, type HeroId, type InputCmd, type PlayerState, type Projectile, type Zone } from './types';

export type Phase = 'hub' | 'mission' | 'victory' | 'defeat';

export interface LobbyPlayer {
  id: string;
  name: string;
  hero: HeroId | '';
  /** Level of the currently selected hero (1 if none). */
  level: number;
  /** Total XP on the selected hero. */
  xp: number;
}

export interface LobbyState {
  code: string;
  host: string;
  phase: Phase;
  mission: string;
  stage: number;
  players: LobbyPlayer[];
  stats: Record<string, PlayerStats>;
  /** XP gained this run per player (set on victory/defeat). */
  xpGain: Record<string, number>;
}

export interface WorldInfo {
  /** Increments every time the world is rebuilt. */
  wid: number;
  kind: 'hub' | 'mission';
  layoutId: string;
  mission: string;
  stage: number;
  stages: number;
  title: string;
  /** The map changed shape around the players instead of moving them. */
  mutation: boolean;
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

export interface WaveInfo {
  n: number;
  of: number;
  left: number;
  state: string;
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
  ev: GameEvent[];
  wave: WaveInfo;
}

export type ClientMsg =
  | { t: 'i'; c: number[] }
  | { t: 'hero'; hero: string }
  | { t: 'mission'; id: string }
  | { t: 'start' }
  | { t: 'retry' }
  | { t: 'hub' }
  | { t: 'ping'; at: number }
  | { t: 'rtt'; ms: number }
  /** Sync local hero XP book (heroId → total xp). */
  | { t: 'progress'; xp: Record<string, number> };

export type ServerMsg =
  | { t: 'welcome'; id: string }
  | { t: 'lobby'; s: LobbyState }
  | { t: 'world'; w: WorldInfo }
  | { t: 'snap'; s: Snapshot }
  | { t: 'pong'; at: number }
  | { t: 'error'; text: string }
  | {
      t: 'xp';
      id: string;
      hero: HeroId;
      gained: number;
      xp: number;
      level: number;
      prevLevel: number;
    };

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
