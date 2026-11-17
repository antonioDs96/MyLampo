/**
 * Masseus, on the fixed bastion.
 * Three health bands, the soft-enrage band under 10% (phase 4), and two interphases.
 * Phase gates clamp the crossing hit so a single swing cannot skip the winches or the tide.
 * Pillars have no hit points: the phase-2 charge is the only thing that breaks them.
 */

import { Rng } from '../math';
import { antiZergDamage, chargeTelegraphSeconds, drownedCorsairCount, netTargetCount, scaledHp } from '../core/DifficultyScaler';
import { MASSEUS_ATTACKS, MASSEUS_BASE_HP, MaterialType, POIType, type POIDef, type Vector2D } from '../levels/LevelDataTypes';
import { applyMasseusTide, poiCells, type BuiltLevel } from '../levels/LevelLoader';
import type { CombatPlayer } from '../ai/EnemyAIController';
import { CELL_SIZE } from '../navigation/NavMeshService';

export enum MasseusPhase {
  Phase1 = 'FASE_1',
  InterA = 'INTERFASE_A',
  Phase2 = 'FASE_2',
  InterB = 'INTERFASE_B',
  Phase3 = 'FASE_3',
  /** Soft enrage under 10% HP: phase-3 kit plus the salted lightning. */
  Phase4 = 'FASE_4',
  Dead = 'MORTE',
}

export interface DrownedCorsair {
  id: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  cooldown: number;
}

export interface Winch {
  id: string;
  x: number;
  z: number;
  progress: number;
  done: boolean;
}

export interface GroundPool {
  x: number;
  z: number;
  left: number;
  radius: number;
}

export interface LightningMark {
  x: number;
  z: number;
  left: number;
}

export type BossEvent =
  | { kind: 'phase'; phase: MasseusPhase }
  | { kind: 'hit'; targetId: string; attack: string; damage: number }
  | { kind: 'pillar'; id: string; stun: number; damage: number }
  | { kind: 'tide' }
  | { kind: 'death'; portal: POIDef; gems: { playerId: string; item: 'gemma_eclissi' }[] };

/** World centre of the walkable square (cells 4..27 span 16 m..112 m). */
export const MASSEUS_CENTER = { x: 64, z: 64 };

const PILLAR_STUN = 3.5;
const PILLAR_CHIP = 0.05;
const CHARGE_SPEED = 18;
const CHARGE_HIT_RADIUS = 2.2;
const WINCH_CHANNEL = 3;
const WINCH_REACH = 3;
const TAR_SLOW = 0.25;
const ADD_SPEED = 4;
const ADD_DAMAGE = 12;

export class MasseusBossController {
  readonly phaseHistory: MasseusPhase[] = [];
  readonly adds: DrownedCorsair[] = [];
  readonly winches: Winch[] = [];
  readonly pools: GroundPool[] = [];
  readonly strikes: LightningMark[] = [];
  phase: MasseusPhase = MasseusPhase.Phase1;
  x = MASSEUS_CENTER.x;
  z = MASSEUS_CENTER.z;
  facingDeg = 180;
  hp: number;
  readonly maxHp: number;
  stun = 0;
  immune = false;
  ropes = 0;
  portal: POIDef | null = null;
  gems: { playerId: string; item: 'gemma_eclissi' }[] = [];
  private readonly clocks: Record<string, number> = { alabarda: 1.5, reti: 5, pece: 8, vortice: 4, fulmine: 2 };
  private windup: { id: string; left: number } | null = null;
  private chargeCd = 8;
  private chargeTell = 0;
  private charging = false;
  private chargeDir: Vector2D = { x: 0, z: 1 };
  private chargeAim: Vector2D = { x: 0, z: 0 };
  private readonly chargeHit = new Set<string>();
  private addsSpawned = false;
  private tideApplied = false;

  constructor(
    private readonly level: BuiltLevel,
    private readonly players: CombatPlayer[],
    private readonly rng: Rng,
    lobbySize = players.length,
  ) {
    this.maxHp = scaledHp(MASSEUS_BASE_HP, lobbySize);
    this.hp = this.maxHp;
    this.lobby = Math.max(1, lobbySize);
    for (const entry of level.pois) {
      if (entry.buffId !== 'argano_ovest' && entry.buffId !== 'argano_est') continue;
      const center = level.grid.cellCenter(entry.gridX, entry.gridZ);
      this.winches.push({ id: entry.id, x: center.x, z: center.z, progress: 0, done: false });
    }
    this.note(MasseusPhase.Phase1);
  }

  private readonly lobby: number;

  get pillars(): POIDef[] {
    return this.level.pois.filter((entry) => entry.type === POIType.PILASTRO_BASTIONE);
  }

  update(dt: number): BossEvent[] {
    const events: BossEvent[] = [];
    this.stun = Math.max(0, this.stun - dt);
    this.tickPools(dt);
    this.tickAdds(dt, events);
    this.tickStrikes(dt, events);
    if (this.phase === MasseusPhase.Dead) return events;
    if (this.phase === MasseusPhase.InterA) {
      this.stepToward(MASSEUS_CENTER.x, MASSEUS_CENTER.z, 8, dt);
      this.tickWinches(dt, events);
      return events;
    }
    if (this.stun > 0) return events;
    if (this.phase === MasseusPhase.Phase1) this.tickPhase1(dt, events);
    if (this.phase === MasseusPhase.Phase2) this.tickPhase2(dt, events);
    if (this.phase === MasseusPhase.Phase3 || this.phase === MasseusPhase.Phase4) this.tickPhase3(dt, events);
    return events;
  }

  damageBoss(amount: number): number {
    if (this.phase === MasseusPhase.Dead || this.immune || amount <= 0) return 0;
    this.hp -= amount;
    if (this.phase === MasseusPhase.Phase1 && this.hp <= this.maxHp * 0.75) {
      this.hp = this.maxHp * 0.75;
      this.enterInterA();
      return amount;
    }
    if (this.phase === MasseusPhase.Phase2 && this.hp <= this.maxHp * 0.45) {
      this.hp = this.maxHp * 0.45;
      this.enterInterB();
      return amount;
    }
    if ((this.phase === MasseusPhase.Phase3 || this.phase === MasseusPhase.Phase4) && this.hp <= this.maxHp * 0.1 && this.hp > 0) {
      if (this.phase !== MasseusPhase.Phase4) this.setPhase(MasseusPhase.Phase4);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    return amount;
  }

  private tickPhase1(dt: number, events: BossEvent[]): void {
    this.faceNearest();
    if (this.windup) {
      this.windup.left -= dt;
      if (this.windup.left <= 0) {
        const id = this.windup.id;
        this.windup = null;
        if (id === 'alabarda') this.swing(events);
        if (id === 'reti') this.nets(events);
      }
      return;
    }
    for (const id of ['alabarda', 'reti'] as const) {
      this.clocks[id] = (this.clocks[id] ?? 0) - dt;
      if ((this.clocks[id] ?? 0) > 0) continue;
      const attack = MASSEUS_ATTACKS[id]!;
      this.clocks[id] = attack.cooldown;
      this.windup = { id, left: attack.windup };
      return;
    }
  }

  private tickPhase2(dt: number, events: BossEvent[]): void {
    this.tickTar(dt);
    if (this.charging) {
      this.advanceCharge(dt, events);
      return;
    }
    if (this.chargeTell > 0) {
      this.chargeTell -= dt;
      if (this.chargeTell <= 0) this.charging = true;
      return;
    }
    this.chargeCd -= dt;
    if (this.chargeCd > 0) return;
    const target = this.rng.pick(this.players.filter((player) => player.alive));
    if (!target) return;
    this.chargeAim = { x: target.x, z: target.z };
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz) || 1;
    this.chargeDir = { x: dx / dist, z: dz / dist };
    this.facingDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
    this.chargeTell = chargeTelegraphSeconds(this.lobby);
    this.chargeCd = MASSEUS_ATTACKS.carica!.cooldown;
    this.chargeHit.clear();
  }

  private tickPhase3(dt: number, events: BossEvent[]): void {
    if (this.windup) {
      this.windup.left -= dt;
      if (this.windup.left <= 0) {
        const id = this.windup.id;
        this.windup = null;
        if (id === 'vortice') this.vortex(events);
      }
      return;
    }
    this.clocks.vortice = (this.clocks.vortice ?? 0) - dt;
    if ((this.clocks.vortice ?? 0) <= 0) {
      this.clocks.vortice = MASSEUS_ATTACKS.vortice!.cooldown;
      this.windup = { id: 'vortice', left: MASSEUS_ATTACKS.vortice!.windup };
    }
    if (this.phase !== MasseusPhase.Phase4) return;
    this.clocks.fulmine = (this.clocks.fulmine ?? 0) - dt;
    if ((this.clocks.fulmine ?? 0) > 0) return;
    this.clocks.fulmine = MASSEUS_ATTACKS.fulmine!.cooldown;
    const target = this.living[0];
    if (!target) return;
    this.strikes.push({ x: target.x, z: target.z, left: MASSEUS_ATTACKS.fulmine!.windup });
  }

  private advanceCharge(dt: number, events: BossEvent[]): void {
    let left = CHARGE_SPEED * dt;
    while (left > 0 && this.charging) {
      const bit = Math.min(0.35, left);
      const nx = this.x + this.chargeDir.x * bit;
      const nz = this.z + this.chargeDir.z * bit;
      if (this.chargeBlocked(nx, nz)) {
        this.charging = false;
        break;
      }
      this.x = nx;
      this.z = nz;
      if (this.smashPillar(events)) {
        this.charging = false;
        break;
      }
      this.trample(events);
      const passed = (this.x - this.chargeAim.x) * this.chargeDir.x + (this.z - this.chargeAim.z) * this.chargeDir.z;
      if (passed > 1.5) this.charging = false;
      left -= bit;
    }
  }

  private chargeBlocked(x: number, z: number): boolean {
    const cell = this.level.grid.worldToCell(x, z);
    const tile = this.level.grid.tile(cell.cx, cell.cz);
    if (!tile) return true;
    return tile.elevation === -2;
  }

  private smashPillar(events: BossEvent[]): boolean {
    for (const pillar of this.pillars) {
      if (pillar.isDestroyed) continue;
      const hit = poiCells(pillar).some((cell) => {
        const center = this.level.grid.cellCenter(cell.x, cell.z);
        return Math.hypot(center.x - this.x, center.z - this.z) <= CELL_SIZE * 0.85;
      });
      if (!hit) continue;
      pillar.isDestroyed = true;
      for (const cell of poiCells(pillar)) {
        const tile = this.level.grid.tile(cell.x, cell.z);
        if (!tile) continue;
        tile.elevation = 0;
        tile.material = MaterialType.BASTIONE_PIETRA;
        tile.walkable = true;
        tile.blocksLoS = false;
        tile.speedMod = 1;
        tile.sealed = false;
      }
      const chip = this.maxHp * PILLAR_CHIP;
      this.stun = PILLAR_STUN;
      this.hp -= chip;
      events.push({ kind: 'pillar', id: pillar.id, stun: PILLAR_STUN, damage: chip });
      if (this.hp <= this.maxHp * 0.45 && this.phase === MasseusPhase.Phase2) {
        this.hp = this.maxHp * 0.45;
        this.enterInterB();
      }
      return true;
    }
    return false;
  }

  private trample(events: BossEvent[]): void {
    for (const player of this.living) {
      if (this.chargeHit.has(player.id)) continue;
      if (Math.hypot(player.x - this.x, player.z - this.z) > CHARGE_HIT_RADIUS) continue;
      this.chargeHit.add(player.id);
      this.hurt(player, 'carica', MASSEUS_ATTACKS.carica!.damage, events);
    }
  }

  private swing(events: BossEvent[]): void {
    const attack = MASSEUS_ATTACKS.alabarda!;
    for (const player of this.living) {
      if (Math.hypot(player.x - this.x, player.z - this.z) > attack.range) continue;
      const bearing = (Math.atan2(player.x - this.x, player.z - this.z) * 180) / Math.PI;
      const delta = ((((bearing - this.facingDeg) % 360) + 540) % 360) - 180;
      if (Math.abs(delta) > (attack.arcDeg ?? 180) / 2) continue;
      this.hurt(player, attack.id, attack.damage, events);
    }
  }

  private nets(events: BossEvent[]): void {
    const attack = MASSEUS_ATTACKS.reti!;
    const pool = this.living.filter((player) => Math.hypot(player.x - this.x, player.z - this.z) <= attack.range);
    const count = Math.min(netTargetCount(this.lobby), pool.length);
    for (let i = 0; i < count; i++) {
      const index = this.rng.int(pool.length);
      const player = pool.splice(index, 1)[0]!;
      player.root = Math.max(player.root, attack.root ?? 0);
      events.push({ kind: 'hit', targetId: player.id, attack: attack.id, damage: 0 });
    }
  }

  private vortex(events: BossEvent[]): void {
    const attack = MASSEUS_ATTACKS.vortice!;
    const clustered = this.living.filter((player) => Math.hypot(player.x - this.x, player.z - this.z) <= 6).length;
    const damage = antiZergDamage(attack.damage, clustered);
    for (const player of this.living) {
      if (Math.hypot(player.x - this.x, player.z - this.z) > (attack.radius ?? 10)) continue;
      this.hurt(player, attack.id, damage, events);
    }
  }

  private tickTar(dt: number): void {
    this.clocks.pece = (this.clocks.pece ?? 0) - dt;
    if ((this.clocks.pece ?? 0) <= 0) {
      this.clocks.pece = MASSEUS_ATTACKS.pece!.cooldown;
      for (let i = 0; i < 3; i++) {
        const ang = this.rng.next() * Math.PI * 2;
        const dist = 4 + this.rng.next() * 10;
        this.pools.push({ x: this.x + Math.cos(ang) * dist, z: this.z + Math.sin(ang) * dist, left: 15, radius: 3 });
      }
    }
  }

  private tickPools(dt: number): void {
    for (const pool of this.pools) pool.left -= dt;
    for (let i = this.pools.length - 1; i >= 0; i--) if (this.pools[i]!.left <= 0) this.pools.splice(i, 1);
    for (const player of this.living) {
      if (this.pools.some((pool) => Math.hypot(player.x - pool.x, player.z - pool.z) <= pool.radius)) {
        player.slow = Math.max(player.slow, TAR_SLOW);
      }
    }
  }

  private tickStrikes(dt: number, events: BossEvent[]): void {
    for (const mark of this.strikes) mark.left -= dt;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const mark = this.strikes[i]!;
      if (mark.left > 0) continue;
      for (const player of this.living) {
        if (Math.hypot(player.x - mark.x, player.z - mark.z) <= MASSEUS_ATTACKS.fulmine!.radius!) {
          this.hurt(player, 'fulmine', MASSEUS_ATTACKS.fulmine!.damage, events);
        }
      }
      this.strikes.splice(i, 1);
    }
  }

  private tickAdds(dt: number, events: BossEvent[]): void {
    for (const add of this.adds) {
      if (!add.alive) continue;
      add.cooldown = Math.max(0, add.cooldown - dt);
      const target = this.nearest(add.x, add.z);
      if (!target) continue;
      this.moveBody(add, target.x, target.z, ADD_SPEED, dt);
      if (Math.hypot(target.x - add.x, target.z - add.z) > 1.8 || add.cooldown > 0) continue;
      add.cooldown = 1.8;
      this.hurt(target, 'fendente', ADD_DAMAGE, events);
    }
  }

  private tickWinches(dt: number, events: BossEvent[]): void {
    if (!this.addsSpawned) this.spawnAdds();
    for (const winch of this.winches) {
      if (winch.done) continue;
      const held = this.ropes > 0 && this.players.some((player) => player.alive && player.channeling && Math.hypot(player.x - winch.x, player.z - winch.z) <= WINCH_REACH);
      if (!held) {
        winch.progress = 0;
        continue;
      }
      winch.progress += dt;
      if (winch.progress < WINCH_CHANNEL) continue;
      winch.done = true;
      this.ropes -= 1;
    }
    if (this.winches.length === 2 && this.winches.every((winch) => winch.done)) {
      this.immune = false;
      this.setPhase(MasseusPhase.Phase2);
      events.push({ kind: 'phase', phase: MasseusPhase.Phase2 });
    }
  }

  private spawnAdds(): void {
    this.addsSpawned = true;
    const count = drownedCorsairCount(this.lobby);
    const hp = scaledHp(180, this.lobby);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const x = MASSEUS_CENTER.x + Math.cos(ang) * 14;
      const z = MASSEUS_CENTER.z + Math.sin(ang) * 14;
      const cell = this.level.grid.worldToCell(x, z);
      const tile = this.level.grid.tile(cell.cx, cell.cz);
      if (!tile?.walkable) continue;
      this.adds.push({ id: `annegato-${i}`, x, z, hp, maxHp: hp, alive: true, cooldown: 0.4 });
    }
  }

  killAdd(id: string): void {
    const add = this.adds.find((entry) => entry.id === id);
    if (!add || !add.alive) return;
    add.alive = false;
    add.hp = 0;
    this.ropes += 1;
  }

  private enterInterA(): void {
    this.immune = true;
    this.windup = null;
    this.charging = false;
    this.setPhase(MasseusPhase.InterA);
  }

  private enterInterB(): void {
    if (this.tideApplied) return;
    this.tideApplied = true;
    this.charging = false;
    this.windup = null;
    applyMasseusTide(this.level);
    this.setPhase(MasseusPhase.InterB);
    this.setPhase(MasseusPhase.Phase3);
  }

  private die(): void {
    this.portal = {
      id: 'portal-kaza',
      type: POIType.PORTALE_TRANSIZIONE,
      gridX: 15,
      gridZ: 12,
      sizeX: 1,
      sizeZ: 1,
      isTriggered: false,
    };
    this.gems = this.players.map((player) => ({ playerId: player.id, item: 'gemma_eclissi' as const }));
    this.immune = true;
    this.setPhase(MasseusPhase.Dead);
  }

  private setPhase(phase: MasseusPhase): void {
    this.phase = phase;
    this.note(phase);
  }

  private note(phase: MasseusPhase): void {
    this.phaseHistory.push(phase);
  }

  private hurt(player: CombatPlayer, attack: string, damage: number, events: BossEvent[]): void {
    if (damage > 0) {
      player.hp = Math.max(0, player.hp - damage);
      if (player.hp <= 0) player.alive = false;
    }
    events.push({ kind: 'hit', targetId: player.id, attack, damage });
  }

  private get living(): CombatPlayer[] {
    return this.players.filter((player) => player.alive);
  }

  private nearest(x: number, z: number): CombatPlayer | null {
    let best: CombatPlayer | null = null;
    let bestDist = Infinity;
    for (const player of this.living) {
      const dist = Math.hypot(player.x - x, player.z - z);
      if (dist < bestDist) {
        best = player;
        bestDist = dist;
      }
    }
    return best;
  }

  private faceNearest(): void {
    const target = this.nearest(this.x, this.z);
    if (!target) return;
    this.facingDeg = (Math.atan2(target.x - this.x, target.z - this.z) * 180) / Math.PI;
  }

  private stepToward(tx: number, tz: number, speed: number, dt: number): void {
    this.moveBody(this, tx, tz, speed, dt);
  }

  private moveBody(body: { x: number; z: number }, tx: number, tz: number, speed: number, dt: number): void {
    const dx = tx - body.x;
    const dz = tz - body.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    const step = Math.min(dist, speed * dt);
    const nx = body.x + (dx / dist) * step;
    const nz = body.z + (dz / dist) * step;
    const from = this.level.grid.worldToCell(body.x, body.z);
    const to = this.level.grid.worldToCell(nx, nz);
    if ((from.cx === to.cx && from.cz === to.cz) || this.level.grid.canStep(from.cx, from.cz, to.cx, to.cz)) {
      body.x = nx;
      body.z = nz;
    }
  }
}

