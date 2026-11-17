/**
 * Garrison AI for a fixed diorama.
 * Every listed spawn is created with the level. Party size only filters which of them wake up.
 * Sentinels telegraph a 36 m district alert; other eyes and ears go straight to combat.
 */

import { antiZergDamage, scaledHp, spawnEnabled } from '../core/DifficultyScaler';
import {
  ALARM_CHANNEL,
  ALARM_RADIUS,
  EnemyType,
  IDLE_HEARING,
  IDLE_VISION,
  MaterialType,
  mitigate,
  profileOf,
  type AttackProfile,
  type EnemyProfile,
  type EnemySpawnDef,
  type Vector2D,
} from '../levels/LevelDataTypes';
import type { BuiltLevel } from '../levels/LevelLoader';
import { ElevationSimulator, type NavGrid, separationOffset } from '../navigation/NavMeshService';

export enum AiState {
  Idle = 'IDLE_STATIONARY',
  Patrol = 'PATROL_MOBILE',
  Alarm = 'ALARM_CHANNELING',
  Combat = 'COMBAT_AGGRO',
}

export interface CombatPlayer {
  id: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  root: number;
  slow: number;
  stun: number;
  silence: number;
  blind: number;
  channeling: boolean;
  knockX: number;
  knockZ: number;
}

export interface Cyst {
  id: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  left: number;
}

export interface EnemyAgent {
  id: string;
  type: EnemyType;
  state: AiState;
  x: number;
  z: number;
  facingDeg: number;
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  burrowed: boolean;
  stun: number;
  freeze: number;
  knockX: number;
  knockZ: number;
  alarm: number;
  cooldowns: Record<string, number>;
  windup: { attack: string; left: number; aimX: number; aimZ: number; targetId: string } | null;
  path: Vector2D[];
  pathAge: number;
  patrolIndex: number;
  patrolDir: 1 | -1;
  waypoints: Vector2D[];
  cysts: Cyst[];
  cystClock: number;
}

export type AiEvent =
  | { kind: 'alert'; sourceId: string; x: number; z: number; radius: number }
  | { kind: 'hit'; sourceId: string; targetId: string; attack: string; damage: number }
  | { kind: 'death'; sourceId: string }
  | { kind: 'slime'; x: number; z: number; cells: number }
  | { kind: 'fissure'; x: number; z: number; cells: number };

interface Shot {
  ownerId: string;
  attack: AttackProfile;
  x: number;
  z: number;
  tx: number;
  tz: number;
  speed: number;
  damage: number;
}

const CYST_LIFE = 5;
const CYST_HP = 80;

export function makePlayer(id: string, x: number, z: number, maxHp: number): CombatPlayer {
  return {
    id, x, z, hp: maxHp, maxHp, alive: true,
    root: 0, slow: 0, stun: 0, silence: 0, blind: 0, channeling: false, knockX: 0, knockZ: 0,
  };
}

export class EnemyAIController {
  readonly agents: EnemyAgent[] = [];
  private readonly shots: Shot[] = [];
  private readonly hazards: ElevationSimulator;
  private cystSerial = 0;

  constructor(
    private readonly level: BuiltLevel,
    private readonly players: CombatPlayer[],
    private readonly lobbySize: number,
  ) {
    this.hazards = new ElevationSimulator(level.grid, level.sporeHazard);
    for (const spawn of level.spawns) {
      if (!spawnEnabled(spawn.minPlayersRequired, lobbySize)) continue;
      this.agents.push(this.spawnAgent(spawn));
    }
  }

  get grid(): NavGrid {
    return this.level.grid;
  }

  update(dt: number): AiEvent[] {
    const events: AiEvent[] = [];
    this.level.grid.tickSeals(dt);
    this.decayPlayers(dt);
    for (const player of this.players) this.shove(player, dt);

    for (const agent of this.agents) {
      if (!agent.alive) continue;
      this.tickAgent(agent, dt, events);
    }
    this.tickShots(dt, events);
    for (const player of this.players) {
      if (!player.alive) continue;
      const body = { ...player, kind: 'player' as const };
      this.hazards.note(body);
      const hazard = this.hazards.integrate(body, dt);
      player.hp = body.hp;
      player.x = body.x;
      player.z = body.z;
      if (hazard.sporeDot > 0 || hazard.voidDamage > 0) {
        if (player.hp <= 0) player.alive = false;
      }
    }
    return events;
  }

  damageAgent(id: string, raw: number, fromX: number, fromZ: number): number {
    const agent = this.agents.find((entry) => entry.id === id);
    if (!agent || !agent.alive || agent.burrowed || raw <= 0) return 0;
    let amount = raw;
    if (agent.type === EnemyType.GUARDIANO_PIETRA) {
      const bearing = bearingDeg(agent.x, agent.z, fromX, fromZ);
      if (Math.abs(angleDelta(bearing, agent.facingDeg)) <= 90) amount *= 0.2;
    }
    amount = mitigate(amount, agent.armor);
    agent.hp -= amount;
    if (agent.hp <= 0) {
      agent.hp = 0;
      agent.alive = false;
      agent.burrowed = false;
    }
    return amount;
  }

  damageCyst(id: string, amount: number): boolean {
    for (const agent of this.agents) {
      const cyst = agent.cysts.find((entry) => entry.id === id);
      if (!cyst) continue;
      cyst.hp -= amount;
      if (cyst.hp <= 0) cyst.left = 0;
      return true;
    }
    return false;
  }

  applyControl(id: string, effect: { stun?: number; freeze?: number; knockX?: number; knockZ?: number }): void {
    const agent = this.agents.find((entry) => entry.id === id);
    if (!agent || !agent.alive) return;
    if (effect.stun) agent.stun = Math.max(agent.stun, effect.stun);
    if (effect.freeze) agent.freeze = Math.max(agent.freeze, effect.freeze);
    if (effect.knockX || effect.knockZ) {
      agent.knockX += effect.knockX ?? 0;
      agent.knockZ += effect.knockZ ?? 0;
    }
    if (agent.state === AiState.Alarm && (agent.stun > 0 || agent.freeze > 0 || effect.knockX || effect.knockZ)) {
      agent.state = agent.waypoints.length > 0 ? AiState.Patrol : AiState.Idle;
      agent.alarm = 0;
      agent.windup = null;
    }
  }

  private spawnAgent(spawn: EnemySpawnDef): EnemyAgent {
    const profile = profileOf(spawn.type)!;
    const home = this.level.grid.cellCenter(spawn.gridX, spawn.gridZ);
    const tile = this.level.grid.tile(spawn.gridX, spawn.gridZ);
    const burrow = Boolean(profile.burrowRadius && tile?.elevation === -1);
    const waypoints = (spawn.patrolWaypoints ?? []).map((point) => this.level.grid.cellCenter(point.x, point.z));
    return {
      id: spawn.id,
      type: spawn.type,
      state: waypoints.length > 0 ? AiState.Patrol : AiState.Idle,
      x: home.x,
      z: home.z,
      facingDeg: spawn.facingAngleDeg,
      hp: scaledHp(profile.hp, this.lobbySize),
      maxHp: scaledHp(profile.hp, this.lobbySize),
      armor: profile.armor,
      alive: true,
      burrowed: burrow,
      stun: 0,
      freeze: 0,
      knockX: 0,
      knockZ: 0,
      alarm: 0,
      cooldowns: {},
      windup: null,
      path: [],
      pathAge: 0,
      patrolIndex: 0,
      patrolDir: 1,
      waypoints,
      cysts: [],
      cystClock: 0,
    };
  }

  private tickAgent(agent: EnemyAgent, dt: number, events: AiEvent[]): void {
    for (const key of Object.keys(agent.cooldowns)) agent.cooldowns[key] = Math.max(0, (agent.cooldowns[key] ?? 0) - dt);
    agent.stun = Math.max(0, agent.stun - dt);
    agent.freeze = Math.max(0, agent.freeze - dt);
    this.decayKnock(agent, dt);
    this.ageCysts(agent, dt, events);

    if (agent.stun > 0 || agent.freeze > 0) {
      agent.windup = null;
      return;
    }

    const profile = profileOf(agent.type)!;
    if (agent.burrowed) {
      const close = this.nearest(agent, profile.burrowRadius ?? 4, false);
      if (!close) return;
      agent.burrowed = false;
      agent.state = AiState.Combat;
    }

    if (agent.state === AiState.Alarm) {
      this.channelAlarm(agent, dt, events);
      return;
    }

    const seen = this.perceive(agent, true);
    const heard = seen ? null : this.perceive(agent, false);
    const target = seen ?? heard;

    if (agent.state === AiState.Patrol) this.patrol(agent, dt, profile);
    if (target && agent.state !== AiState.Combat) {
      if (agent.type === EnemyType.SENTINELLA_RONDA && seen) {
        agent.state = AiState.Alarm;
        agent.alarm = ALARM_CHANNEL;
        agent.windup = null;
        agent.path = [];
        return;
      }
      agent.state = AiState.Combat;
    }
    if (agent.state !== AiState.Combat || !target) return;

    this.face(agent, target.x, target.z);
    this.seek(agent, target, profile, dt);
    this.fight(agent, target, profile, dt, events);
  }

  private channelAlarm(agent: EnemyAgent, dt: number, events: AiEvent[]): void {
    agent.alarm -= dt;
    if (agent.alarm > 0) return;
    events.push({ kind: 'alert', sourceId: agent.id, x: agent.x, z: agent.z, radius: ALARM_RADIUS });
    for (const other of this.agents) {
      if (!other.alive) continue;
      if (Math.hypot(other.x - agent.x, other.z - agent.z) > ALARM_RADIUS) continue;
      other.burrowed = false;
      other.state = AiState.Combat;
      other.alarm = 0;
    }
    agent.state = AiState.Combat;
  }

  private perceive(agent: EnemyAgent, vision: boolean): CombatPlayer | null {
    let best: CombatPlayer | null = null;
    let bestDist = Infinity;
    const cone = agent.state === AiState.Combat
      ? { radius: 22, arc: 360 }
      : agent.type === EnemyType.SENTINELLA_RONDA && agent.state === AiState.Patrol
        ? { radius: 14, arc: 120 }
        : { radius: IDLE_VISION.radius, arc: IDLE_VISION.arcDeg };
    for (const player of this.players) {
      if (!player.alive) continue;
      const dist = Math.hypot(player.x - agent.x, player.z - agent.z);
      if (vision) {
        if (dist > cone.radius || !inCone(agent.x, agent.z, agent.facingDeg, player.x, player.z, cone.radius, cone.arc)) continue;
        if (!this.level.grid.lineOfSight(agent.x, agent.z, player.x, player.z)) continue;
      } else if (dist > IDLE_HEARING) {
        continue;
      }
      if (dist < bestDist) {
        best = player;
        bestDist = dist;
      }
    }
    return best;
  }

  private nearest(agent: EnemyAgent, radius: number, needSight: boolean): CombatPlayer | null {
    let best: CombatPlayer | null = null;
    let bestDist = radius;
    for (const player of this.players) {
      if (!player.alive) continue;
      const dist = Math.hypot(player.x - agent.x, player.z - agent.z);
      if (dist > bestDist) continue;
      if (needSight && !this.level.grid.lineOfSight(agent.x, agent.z, player.x, player.z)) continue;
      best = player;
      bestDist = dist;
    }
    return best;
  }

  private patrol(agent: EnemyAgent, dt: number, profile: EnemyProfile): void {
    const point = agent.waypoints[agent.patrolIndex];
    if (!point) return;
    this.face(agent, point.x, point.z);
    this.stepTowards(agent, point.x, point.z, profile.speed, dt);
    if (Math.hypot(point.x - agent.x, point.z - agent.z) > 0.45) return;
    const next = agent.patrolIndex + agent.patrolDir;
    if (next < 0 || next >= agent.waypoints.length) agent.patrolDir = agent.patrolDir === 1 ? -1 : 1;
    agent.patrolIndex = Math.min(agent.waypoints.length - 1, Math.max(0, agent.patrolIndex + agent.patrolDir));
  }

  private seek(agent: EnemyAgent, target: CombatPlayer, profile: EnemyProfile, dt: number): void {
    const speed = agent.state === AiState.Combat ? (profile.alertSpeed ?? profile.speed) : profile.speed;
    const pace = speed * Math.max(0.05, this.level.grid.speedModAt(agent.x, agent.z));
    if (profile.advance === 'static') return;
    const dist = Math.hypot(target.x - agent.x, target.z - agent.z);
    if (profile.advance === 'ranged' && profile.preferred) {
      const [min, max] = profile.preferred;
      const perch = this.findPerch(agent, target, min, max);
      if (perch) {
        this.stepTowards(agent, perch.x, perch.z, pace, dt);
        return;
      }
      if (dist < min) {
        this.stepTowards(agent, agent.x - (target.x - agent.x), agent.z - (target.z - agent.z), pace, dt);
        return;
      }
      if (dist <= max) return;
    }
    const reach = profile.attacks.find((attack) => attack.kind === 'melee')?.range ?? 1.6;
    if (dist <= reach) return;
    agent.pathAge -= dt;
    if (agent.pathAge <= 0 || agent.path.length === 0) {
      const from = this.level.grid.worldToCell(agent.x, agent.z);
      const to = this.level.grid.worldToCell(target.x, target.z);
      const path = this.level.grid.findPath(from.cx, from.cz, to.cx, to.cz);
      agent.path = (path ?? []).map((cell) => this.level.grid.cellCenter(cell.x, cell.z));
      agent.pathAge = 0.6;
    }
    const next = agent.path[0];
    if (!next) {
      this.stepTowards(agent, target.x, target.z, pace, dt);
      return;
    }
    this.stepTowards(agent, next.x, next.z, pace, dt);
    if (Math.hypot(next.x - agent.x, next.z - agent.z) < 0.4) agent.path.shift();
  }

  private findPerch(agent: EnemyAgent, target: CombatPlayer, min: number, max: number): Vector2D | null {
    const origin = this.level.grid.worldToCell(agent.x, agent.z);
    let best: Vector2D | null = null;
    let bestDist = Infinity;
    for (let dz = -6; dz <= 6; dz++) {
      for (let dx = -6; dx <= 6; dx++) {
        const tile = this.level.grid.tile(origin.cx + dx, origin.cz + dz);
        if (!tile || tile.elevation !== 1 || !tile.walkable) continue;
        const center = this.level.grid.cellCenter(origin.cx + dx, origin.cz + dz);
        const dist = Math.hypot(center.x - target.x, center.z - target.z);
        if (dist < min || dist > max) continue;
        if (!this.level.grid.lineOfSight(center.x, center.z, target.x, target.z)) continue;
        const travel = Math.hypot(center.x - agent.x, center.z - agent.z);
        if (travel < bestDist) {
          best = center;
          bestDist = travel;
        }
      }
    }
    return best;
  }

  private fight(agent: EnemyAgent, target: CombatPlayer, profile: EnemyProfile, dt: number, events: AiEvent[]): void {
    if (agent.windup) {
      agent.windup.left -= dt;
      if (agent.windup.left > 0) return;
      const attack = profile.attacks.find((entry) => entry.id === agent.windup!.attack);
      const aim = agent.windup;
      agent.windup = null;
      if (attack) this.resolve(agent, attack, aim.aimX, aim.aimZ, events);
      return;
    }
    if (agent.type === EnemyType.MINIBOSS_MADRE) {
      agent.cystClock += dt;
      const cyst = profile.attacks.find((entry) => entry.id === 'cisti');
      if (cyst && agent.cystClock >= cyst.cooldown && agent.cysts.length === 0) {
        agent.cystClock = 0;
        this.spawnCysts(agent);
      }
    }
    const attack = this.pickAttack(agent, target, profile);
    if (!attack) return;
    agent.cooldowns[attack.id] = attack.cooldown;
    agent.windup = { attack: attack.id, left: attack.windup, aimX: target.x, aimZ: target.z, targetId: target.id };
    if (attack.windup <= 0) {
      agent.windup = null;
      this.resolve(agent, attack, target.x, target.z, events);
    }
  }

  private pickAttack(agent: EnemyAgent, target: CombatPlayer, profile: EnemyProfile): AttackProfile | null {
    const dist = Math.hypot(target.x - agent.x, target.z - agent.z);
    for (const attack of profile.attacks) {
      if (attack.id === 'allarme' || attack.id === 'cisti') continue;
      if ((agent.cooldowns[attack.id] ?? 0) > 0) continue;
      if (attack.dash && attack.minRange !== undefined) {
        if (dist >= attack.minRange && dist <= attack.minRange + attack.dash) return attack;
        continue;
      }
      if (attack.kind === 'zone' && attack.range === 0) {
        if (attack.radius === undefined || dist <= attack.radius) return attack;
        continue;
      }
      if (dist <= attack.range) return attack;
    }
    return null;
  }

  private resolve(agent: EnemyAgent, attack: AttackProfile, aimX: number, aimZ: number, events: AiEvent[]): void {
    if (attack.dash) this.dash(agent, aimX, aimZ, attack.dash);
    if (attack.projectileSpeed) {
      this.shots.push({
        ownerId: agent.id,
        attack,
        x: agent.x,
        z: agent.z,
        tx: aimX,
        tz: aimZ,
        speed: attack.projectileSpeed,
        damage: this.damageOf(agent, attack, aimX, aimZ),
      });
      return;
    }
    if (attack.fissure && attack.radius) {
      const cells = this.level.grid.sealDisc(aimX, aimZ, attack.radius, attack.fissure);
      events.push({ kind: 'fissure', x: aimX, z: aimZ, cells });
    }
    if (attack.pull) {
      const victim = this.players.find((player) => player.alive && Math.hypot(player.x - aimX, player.z - aimZ) < 1.2);
      if (victim && this.level.grid.lineOfSight(agent.x, agent.z, victim.x, victim.z)) {
        const dx = victim.x - agent.x;
        const dz = victim.z - agent.z;
        const dist = Math.hypot(dx, dz) || 1;
        victim.x = agent.x + (dx / dist) * 1.4;
        victim.z = agent.z + (dz / dist) * 1.4;
        this.hurt(agent, attack, victim, this.damageOf(agent, attack, victim.x, victim.z), events);
      }
      return;
    }
    const aroundSelf = attack.kind === 'zone' && attack.range === 0;
    const originX = aroundSelf ? agent.x : aimX;
    const originZ = aroundSelf ? agent.z : aimZ;
    const radius = attack.radius ?? attack.range;
    for (const player of this.players) {
      if (!player.alive) continue;
      if (Math.hypot(player.x - originX, player.z - originZ) > radius + 0.2) continue;
      if (attack.arcDeg && attack.arcDeg < 360) {
        const bearing = bearingDeg(agent.x, agent.z, player.x, player.z);
        if (Math.abs(angleDelta(bearing, agent.facingDeg)) > attack.arcDeg / 2) continue;
      }
      if (attack.id === 'boato' && !this.level.grid.lineOfSight(agent.x, agent.z, player.x, player.z)) continue;
      if (attack.kind === 'melee' && !this.level.grid.lineOfSight(agent.x, agent.z, player.x, player.z)) continue;
      this.hurt(agent, attack, player, this.damageOf(agent, attack, player.x, player.z), events);
    }
  }

  private dash(agent: EnemyAgent, tx: number, tz: number, distance: number): void {
    const dx = tx - agent.x;
    const dz = tz - agent.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    let left = Math.min(distance, dist);
    while (left > 0.01) {
      const bit = Math.min(0.5, left);
      this.tryMove(agent, (dx / dist) * bit, (dz / dist) * bit);
      left -= bit;
    }
  }

  private damageOf(agent: EnemyAgent, attack: AttackProfile, targetX: number, targetZ: number): number {
    let damage = attack.damage;
    if (attack.antiZerg) {
      const clustered = this.players.filter((player) => player.alive && Math.hypot(player.x - agent.x, player.z - agent.z) <= 6).length;
      damage = antiZergDamage(attack.damage, clustered);
    }
    const from = this.level.grid.elevationAt(agent.x, agent.z);
    const to = this.level.grid.elevationAt(targetX, targetZ);
    if (from !== null && to !== null) {
      damage *= this.level.grid.highGroundMultiplier(from, to, attack.kind === 'ranged');
    }
    return damage;
  }

  private hurt(agent: EnemyAgent, attack: AttackProfile, player: CombatPlayer, damage: number, events: AiEvent[]): void {
    if (damage > 0) {
      player.hp = Math.max(0, player.hp - damage);
      if (player.hp <= 0) player.alive = false;
      events.push({ kind: 'hit', sourceId: agent.id, targetId: player.id, attack: attack.id, damage });
    }
    if (attack.root) player.root = Math.max(player.root, attack.root);
    if (attack.slow && attack.slowDuration) player.slow = Math.max(player.slow, attack.slowDuration);
    if (attack.stun) player.stun = Math.max(player.stun, attack.stun);
    if (attack.silence) player.silence = Math.max(player.silence, attack.silence);
    if (attack.blind) player.blind = Math.max(player.blind, attack.blind);
    if (attack.interrupt) player.channeling = false;
    if (attack.knockback) {
      const dist = Math.hypot(player.x - agent.x, player.z - agent.z) || 1;
      player.knockX += ((player.x - agent.x) / dist) * attack.knockback * 4;
      player.knockZ += ((player.z - agent.z) / dist) * attack.knockback * 4;
    }
  }

  private tickShots(dt: number, events: AiEvent[]): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i]!;
      const dx = shot.tx - shot.x;
      const dz = shot.tz - shot.z;
      const dist = Math.hypot(dx, dz);
      const step = shot.speed * dt;
      if (dist <= step + 0.3) {
        this.explode(shot, events);
        this.shots.splice(i, 1);
        continue;
      }
      shot.x += (dx / dist) * step;
      shot.z += (dz / dist) * step;
      const tile = this.level.grid.tile(this.level.grid.worldToCell(shot.x, shot.z).cx, this.level.grid.worldToCell(shot.x, shot.z).cz);
      if (tile?.blocksLoS) {
        this.shots.splice(i, 1);
        continue;
      }
      const owner = this.agents.find((agent) => agent.id === shot.ownerId);
      for (const player of this.players) {
        if (!player.alive) continue;
        if (Math.hypot(player.x - shot.x, player.z - shot.z) > 0.6) continue;
        if (owner) this.hurt(owner, shot.attack, player, shot.damage, events);
        this.shots.splice(i, 1);
        break;
      }
    }
  }

  private explode(shot: Shot, events: AiEvent[]): void {
    const owner = this.agents.find((agent) => agent.id === shot.ownerId);
    if (!owner) return;
    const radius = shot.attack.radius ?? 0.6;
    for (const player of this.players) {
      if (!player.alive) continue;
      if (Math.hypot(player.x - shot.tx, player.z - shot.tz) > radius) continue;
      this.hurt(owner, shot.attack, player, shot.damage, events);
    }
  }

  private spawnCysts(agent: EnemyAgent): void {
    const offsets = [
      [3, 3],
      [-3, 3],
      [3, -3],
      [-3, -3],
    ];
    for (const [ox, oz] of offsets) {
      this.cystSerial += 1;
      agent.cysts.push({
        id: `${agent.id}-cyst-${this.cystSerial}`,
        x: agent.x + ox,
        z: agent.z + oz,
        hp: scaledHp(CYST_HP, this.lobbySize),
        maxHp: scaledHp(CYST_HP, this.lobbySize),
        left: CYST_LIFE,
      });
    }
  }

  private ageCysts(agent: EnemyAgent, dt: number, events: AiEvent[]): void {
    for (let i = agent.cysts.length - 1; i >= 0; i--) {
      const cyst = agent.cysts[i]!;
      cyst.left -= dt;
      if (cyst.left > 0 && cyst.hp > 0) continue;
      if (cyst.hp > 0) {
        const cells = this.level.grid.meltFloorToSlime(cyst.x, cyst.z, 8, MaterialType.MELMA_SOLFUREA);
        events.push({ kind: 'slime', x: cyst.x, z: cyst.z, cells });
      }
      agent.cysts.splice(i, 1);
    }
  }

  private stepTowards(agent: EnemyAgent, tx: number, tz: number, speed: number, dt: number): void {
    const dx = tx - agent.x;
    const dz = tz - agent.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    const step = Math.min(dist, speed * dt);
    this.tryMove(agent, (dx / dist) * step, (dz / dist) * step);
    this.separate(agent);
  }

  private tryMove(agent: EnemyAgent, dx: number, dz: number): void {
    const nx = agent.x + dx;
    const nz = agent.z + dz;
    const from = this.level.grid.worldToCell(agent.x, agent.z);
    const to = this.level.grid.worldToCell(nx, nz);
    if (from.cx === to.cx && from.cz === to.cz) {
      agent.x = nx;
      agent.z = nz;
      return;
    }
    if (this.level.grid.canStep(from.cx, from.cz, to.cx, to.cz)) {
      agent.x = nx;
      agent.z = nz;
      return;
    }
    if (dx !== 0 && this.level.grid.canStep(from.cx, from.cz, this.level.grid.worldToCell(nx, agent.z).cx, from.cz)) agent.x = nx;
    if (dz !== 0 && this.level.grid.canStep(from.cx, from.cz, from.cx, this.level.grid.worldToCell(agent.x, nz).cz)) agent.z = nz;
  }

  private separate(agent: EnemyAgent): void {
    for (const other of this.agents) {
      if (other === agent || !other.alive || other.burrowed) continue;
      const push = separationOffset(agent.x, agent.z, other.x, other.z);
      if (push.x === 0 && push.z === 0) continue;
      this.tryMove(agent, push.x * 0.5, push.z * 0.5);
    }
  }

  private shove(player: CombatPlayer, dt: number): void {
    const speed = Math.hypot(player.knockX, player.knockZ);
    if (speed < 0.05) {
      player.knockX = 0;
      player.knockZ = 0;
      return;
    }
    const nx = player.x + player.knockX * dt;
    const nz = player.z + player.knockZ * dt;
    const to = this.level.grid.worldToCell(nx, nz);
    const tile = this.level.grid.tile(to.cx, to.cz);
    if (tile && tile.elevation !== 2) {
      player.x = nx;
      player.z = nz;
    }
    player.knockX *= Math.max(0, 1 - dt * 3);
    player.knockZ *= Math.max(0, 1 - dt * 3);
  }

  private decayKnock(agent: EnemyAgent, dt: number): void {
    const speed = Math.hypot(agent.knockX, agent.knockZ);
    if (speed < 0.05) {
      agent.knockX = 0;
      agent.knockZ = 0;
      return;
    }
    this.tryMove(agent, agent.knockX * dt, agent.knockZ * dt);
    agent.knockX *= Math.max(0, 1 - dt * 4);
    agent.knockZ *= Math.max(0, 1 - dt * 4);
  }

  private decayPlayers(dt: number): void {
    for (const player of this.players) {
      player.root = Math.max(0, player.root - dt);
      player.slow = Math.max(0, player.slow - dt);
      player.stun = Math.max(0, player.stun - dt);
      player.silence = Math.max(0, player.silence - dt);
      player.blind = Math.max(0, player.blind - dt);
    }
  }

  private face(agent: EnemyAgent, x: number, z: number): void {
    agent.facingDeg = bearingDeg(agent.x, agent.z, x, z);
  }
}

export function bearingDeg(x: number, z: number, tx: number, tz: number): number {
  return (Math.atan2(tx - x, tz - z) * 180) / Math.PI;
}

export function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function inCone(ox: number, oz: number, facingDeg: number, tx: number, tz: number, radius: number, arcDeg: number): boolean {
  const dist = Math.hypot(tx - ox, tz - oz);
  if (dist > radius || dist < 0.001) return false;
  return Math.abs(angleDelta(bearingDeg(ox, oz, tx, tz), facingDeg)) <= arcDeg / 2;
}
