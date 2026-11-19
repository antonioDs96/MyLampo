/**
 * Fixed-grid navigation for the Badiscar dioramas.
 * A step is legal only when the destination is walkable and the elevation
 * changes by at most one terrace. Elevation +2 is a wall, −2 is the void.
 */

import {
  MaterialType,
  type AABBZoneDef,
  type ElevationLevel,
  type Vector2D,
} from '../levels/LevelDataTypes';

export const CELL_SIZE = 4;
export const ELEVATION_STEP = 4;
export const CAPSULE_RADIUS = 0.5;
export const SEPARATION_RADIUS = 1;
/**
 * Share of the remaining gap closed in one 60 Hz step.
 * Two heroes who overlap reach SEPARATION_RADIUS inside 0.2 s, and a dash
 * keeps its travel: the nudge never cancels the movement.
 */
export const SOFT_SEPARATION_YIELD = 0.35;
export const MIN_CORRIDOR_WIDTH = 3;
export const GHOST_WALL_RADIUS = 6;
export const GHOST_WALL_ALPHA = 0.2;
export const VOID_DAMAGE_FRACTION = 0.15;
export const SPORE_ARM_SECONDS = 3;
export const SPORE_STACK_SECONDS = 2;
export const SPORE_MAX_STACKS = 5;
export const SPORE_DOT = 15;
export const HIGH_GROUND_MUL = 1.1;
export const CAMERA_PITCH = (60 * Math.PI) / 180;

export interface ElevationPhysics {
  elevation: ElevationLevel;
  y: number;
  walkable: boolean;
  blocksLoS: boolean;
  speedMod: number;
}

/** Surfaces sit on a single Y. Walls occupy the volume from the floor up to +8 m. */
export const ELEVATION_PHYSICS: Record<ElevationLevel, ElevationPhysics> = {
  [-2]: { elevation: -2, y: -8, walkable: false, blocksLoS: false, speedMod: 0 },
  [-1]: { elevation: -1, y: -4, walkable: true, blocksLoS: false, speedMod: 0.85 },
  0: { elevation: 0, y: 0, walkable: true, blocksLoS: false, speedMod: 1 },
  1: { elevation: 1, y: 4, walkable: true, blocksLoS: false, speedMod: 1 },
  2: { elevation: 2, y: 0, walkable: false, blocksLoS: true, speedMod: 0 },
};

export function elevationY(level: ElevationLevel): number {
  return ELEVATION_PHYSICS[level].y;
}

export interface NavTile {
  elevation: ElevationLevel;
  material: MaterialType;
  walkable: boolean;
  blocksLoS: boolean;
  speedMod: number;
  /** Painted by an authored AABB. Unauthored border cells become walls. */
  authored: boolean;
  /** Timed geometric seal (anchor crack). Not a destructible prop. */
  sealed: boolean;
}

export interface CameraSample {
  /** Radians. 0 looks toward +Z, matching the isometric yaw. */
  yaw: number;
  pitch: number;
  distance: number;
  focusX: number;
  focusY: number;
  focusZ: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

interface Seal {
  cx: number;
  cz: number;
  left: number;
  prevWalkable: boolean;
  prevSpeed: number;
}

const NEIGHBORS: readonly Vector2D[] = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
];

export class NavGrid {
  readonly tiles: NavTile[];
  private readonly seals: Seal[] = [];
  private clock = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    defaultMaterial: MaterialType,
  ) {
    const count = width * height;
    this.tiles = new Array(count);
    for (let i = 0; i < count; i++) {
      this.tiles[i] = {
        elevation: 0,
        material: defaultMaterial,
        walkable: true,
        blocksLoS: false,
        speedMod: 1,
        authored: false,
        sealed: false,
      };
    }
  }

  index(cx: number, cz: number): number {
    return cz * this.width + cx;
  }

  inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.width && cz < this.height;
  }

  tile(cx: number, cz: number): NavTile | null {
    if (!this.inBounds(cx, cz)) return null;
    return this.tiles[this.index(cx, cz)]!;
  }

  worldToCell(x: number, z: number): { cx: number; cz: number } {
    return { cx: Math.floor(x / CELL_SIZE), cz: Math.floor(z / CELL_SIZE) };
  }

  cellCenter(cx: number, cz: number): Vector2D {
    return { x: (cx + 0.5) * CELL_SIZE, z: (cz + 0.5) * CELL_SIZE };
  }

  paintZone(zone: AABBZoneDef): void {
    for (let cz = zone.zMin; cz <= zone.zMax; cz++) {
      for (let cx = zone.xMin; cx <= zone.xMax; cx++) {
        const tile = this.tile(cx, cz);
        if (!tile) continue;
        tile.elevation = zone.elevation;
        tile.material = zone.material;
        tile.walkable = zone.walkable;
        tile.blocksLoS = zone.blocksLoS;
        tile.speedMod = zone.speedMod;
        tile.authored = true;
        tile.sealed = false;
      }
    }
  }

  /**
   * Border cells nobody authored become full-height walls.
   * Sea, landings and the exit portal are authored, so they stay open.
   */
  sealUnauthoredPerimeter(material: MaterialType): void {
    const mark = (cx: number, cz: number) => {
      const tile = this.tile(cx, cz);
      if (!tile || tile.authored) return;
      tile.elevation = 2;
      tile.material = material;
      tile.walkable = false;
      tile.blocksLoS = true;
      tile.speedMod = 0;
      tile.authored = true;
    };
    for (let cx = 0; cx < this.width; cx++) {
      mark(cx, 0);
      mark(cx, this.height - 1);
    }
    for (let cz = 0; cz < this.height; cz++) {
      mark(0, cz);
      mark(this.width - 1, cz);
    }
  }

  canStep(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    if (!this.inBounds(fromX, fromZ) || !this.inBounds(toX, toZ)) return false;
    const from = this.tile(fromX, fromZ)!;
    const to = this.tile(toX, toZ)!;
    if (!to.walkable) return false;
    return Math.abs(from.elevation - to.elevation) <= 1;
  }

  neighbors(cx: number, cz: number): Vector2D[] {
    const out: Vector2D[] = [];
    for (const step of NEIGHBORS) {
      const nx = cx + step.x;
      const nz = cz + step.z;
      if (this.canStep(cx, cz, nx, nz)) out.push({ x: nx, z: nz });
    }
    return out;
  }

  /**
   * 4-connected A*. Null when the two cells are on different sides of a cliff or a void.
   * An empty array means the goal is the start cell.
   */
  findPath(sx: number, sz: number, gx: number, gz: number): Vector2D[] | null {
    if (!this.inBounds(sx, sz) || !this.inBounds(gx, gz)) return null;
    const startTile = this.tile(sx, sz);
    const goalTile = this.tile(gx, gz);
    if (!startTile?.walkable || !goalTile?.walkable) return null;
    if (sx === gx && sz === gz) return [];

    const width = this.width;
    const key = (x: number, z: number) => z * width + x;
    const start = key(sx, sz);
    const goal = key(gx, gz);
    const open: number[] = [start];
    const came = new Int32Array(this.tiles.length).fill(-1);
    const gScore = new Float64Array(this.tiles.length).fill(Infinity);
    gScore[start] = 0;
    const heuristic = (x: number, z: number) => Math.hypot(gx - x, gz - z);

    while (open.length > 0) {
      let best = 0;
      let bestF = Infinity;
      for (let i = 0; i < open.length; i++) {
        const node = open[i]!;
        const f = gScore[node]! + heuristic(node % width, Math.floor(node / width));
        if (f < bestF) {
          bestF = f;
          best = i;
        }
      }
      const current = open.splice(best, 1)[0]!;
      if (current === goal) return this.rebuild(came, goal, width);

      const cx = current % width;
      const cz = Math.floor(current / width);
      for (const next of this.neighbors(cx, cz)) {
        const nk = key(next.x, next.z);
        const stepCost = 1 / Math.max(0.05, this.tile(next.x, next.z)!.speedMod);
        const tentative = gScore[current]! + stepCost;
        if (tentative >= gScore[nk]!) continue;
        came[nk] = current;
        gScore[nk] = tentative;
        if (!open.includes(nk)) open.push(nk);
      }
    }
    return null;
  }

  private rebuild(came: Int32Array, goal: number, width: number): Vector2D[] {
    const cells: Vector2D[] = [];
    let cursor = goal;
    while (cursor >= 0) {
      cells.push({ x: cursor % width, z: Math.floor(cursor / width) });
      const prev = came[cursor]!;
      if (prev < 0) break;
      cursor = prev;
    }
    cells.reverse();
    cells.shift();
    return cells;
  }

  lineOfSight(x0: number, z0: number, x1: number, z1: number): boolean {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 0.001) return true;
    const steps = Math.max(1, Math.ceil(dist / (CELL_SIZE * 0.25)));
    let last = -1;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cell = this.worldToCell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      const key = this.index(cell.cx, cell.cz);
      if (key === last) continue;
      last = key;
      const tile = this.tile(cell.cx, cell.cz);
      if (!tile || tile.blocksLoS) return false;
    }
    return true;
  }

  /**
   * +10% ranged damage from a +1 terrace onto elevation 0 or −1.
   * Melee does not gain the terrace bonus.
   */
  highGroundMultiplier(attacker: ElevationLevel, target: ElevationLevel, ranged: boolean): number {
    if (!ranged) return 1;
    if (attacker === 1 && (target === 0 || target === -1)) return HIGH_GROUND_MUL;
    return 1;
  }

  elevationAt(x: number, z: number): ElevationLevel | null {
    const cell = this.worldToCell(x, z);
    return this.tile(cell.cx, cell.cz)?.elevation ?? null;
  }

  speedModAt(x: number, z: number): number {
    const cell = this.worldToCell(x, z);
    return this.tile(cell.cx, cell.cz)?.speedMod ?? 0;
  }

  /**
   * Ghost Wall: a +2 volume between the 60° camera and a player, and within 6 m of that player,
   * dithers to alpha 0.20. Collision and line of sight stay blocked.
   */
  ghostWallAlpha(cx: number, cz: number, camera: CameraSample, players: readonly Vector2D[]): number {
    const tile = this.tile(cx, cz);
    if (!tile || tile.elevation !== 2) return 1;
    const x0 = cx * CELL_SIZE;
    const z0 = cz * CELL_SIZE;
    const x1 = x0 + CELL_SIZE;
    const z1 = z0 + CELL_SIZE;
    const cam = cameraPosition(camera);
    for (const player of players) {
      if (pointRectDistance(player.x, player.z, x0, z0, x1, z1) > GHOST_WALL_RADIUS) continue;
      const feet = this.elevationAt(player.x, player.z);
      const py = feet === null || feet === 2 ? camera.focusY : elevationY(feet) + 1.2;
      if (segmentHitsAabb(cam, { x: player.x, y: py, z: player.z }, { x: x0, y: 0, z: z0 }, { x: x1, y: ELEVATION_STEP * 2, z: z1 })) {
        return GHOST_WALL_ALPHA;
      }
    }
    return 1;
  }

  /**
   * Convert authored floor (elevation 0) inside a disc into −1 slime.
   * Walls, void and terraces are left alone so a cyst cannot delete a column.
   */
  meltFloorToSlime(x: number, z: number, radius: number, material: MaterialType): number {
    return this.paintDisc(x, z, radius, (tile) => tile.elevation === 0 && tile.walkable && !tile.blocksLoS && !tile.sealed, {
      elevation: -1,
      material,
      walkable: true,
      blocksLoS: false,
      speedMod: 0.85,
    });
  }

  /** Timed unwalkable crack. The previous floor comes back when the timer ends. */
  sealDisc(x: number, z: number, radius: number, seconds: number): number {
    let count = 0;
    this.forDisc(x, z, radius, (cx, cz, tile) => {
      if (!tile.walkable || tile.sealed || tile.elevation === 2) return;
      this.seals.push({ cx, cz, left: seconds, prevWalkable: true, prevSpeed: tile.speedMod });
      tile.walkable = false;
      tile.sealed = true;
      tile.speedMod = 0;
      count++;
    });
    return count;
  }

  tickSeals(dt: number): void {
    this.clock += dt;
    for (let i = this.seals.length - 1; i >= 0; i--) {
      const seal = this.seals[i]!;
      seal.left -= dt;
      if (seal.left > 0) continue;
      const tile = this.tile(seal.cx, seal.cz);
      if (tile?.sealed) {
        tile.sealed = false;
        tile.walkable = seal.prevWalkable;
        tile.speedMod = seal.prevSpeed;
      }
      this.seals.splice(i, 1);
    }
  }

  private paintDisc(
    x: number,
    z: number,
    radius: number,
    accept: (tile: NavTile) => boolean,
    patch: Pick<NavTile, 'elevation' | 'material' | 'walkable' | 'blocksLoS' | 'speedMod'>,
  ): number {
    let count = 0;
    this.forDisc(x, z, radius, (_cx, _cz, tile) => {
      if (!accept(tile)) return;
      tile.elevation = patch.elevation;
      tile.material = patch.material;
      tile.walkable = patch.walkable;
      tile.blocksLoS = patch.blocksLoS;
      tile.speedMod = patch.speedMod;
      count++;
    });
    return count;
  }

  private forDisc(x: number, z: number, radius: number, visit: (cx: number, cz: number, tile: NavTile) => void): void {
    const min = this.worldToCell(x - radius, z - radius);
    const max = this.worldToCell(x + radius, z + radius);
    for (let cz = min.cz; cz <= max.cz; cz++) {
      for (let cx = min.cx; cx <= max.cx; cx++) {
        const tile = this.tile(cx, cz);
        if (!tile) continue;
        const center = this.cellCenter(cx, cz);
        if (Math.hypot(center.x - x, center.z - z) > radius) continue;
        visit(cx, cz, tile);
      }
    }
  }
}

export function cameraPosition(camera: CameraSample): WorldPoint {
  const fx = Math.sin(camera.yaw);
  const fz = Math.cos(camera.yaw);
  const back = Math.cos(camera.pitch) * camera.distance;
  return {
    x: camera.focusX - fx * back,
    y: camera.focusY + Math.sin(camera.pitch) * camera.distance,
    z: camera.focusZ - fz * back,
  };
}

export function pointRectDistance(px: number, pz: number, x0: number, z0: number, x1: number, z1: number): number {
  const x = Math.max(x0, Math.min(px, x1));
  const z = Math.max(z0, Math.min(pz, z1));
  return Math.hypot(px - x, pz - z);
}

export function segmentHitsAabb(p0: WorldPoint, p1: WorldPoint, min: WorldPoint, max: WorldPoint): boolean {
  const delta = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
  const origin = [p0.x, p0.y, p0.z];
  const dir = [delta.x, delta.y, delta.z];
  const lo = [min.x, min.y, min.z];
  const hi = [max.x, max.y, max.z];
  let tmin = 0;
  let tmax = 1;
  for (let axis = 0; axis < 3; axis++) {
    const d = dir[axis]!;
    const p = origin[axis]!;
    if (Math.abs(d) < 1e-8) {
      if (p < lo[axis]! || p > hi[axis]!) return false;
      continue;
    }
    let t1 = (lo[axis]! - p) / d;
    let t2 = (hi[axis]! - p) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Elastic push so 0.5 m capsules do not occupy the same metre. */
export function separationOffset(ax: number, az: number, bx: number, bz: number, radius = SEPARATION_RADIUS): Vector2D {
  const dx = ax - bx;
  const dz = az - bz;
  const dist = Math.hypot(dx, dz);
  if (dist >= radius || dist < 1e-6) return { x: 0, z: 0 };
  const scale = (radius - dist) / dist;
  return { x: dx * scale, z: dz * scale };
}

/**
 * One elastic step that slides `x,z` away from an ally until the centres are
 * `radius` apart. The ally is expected to take their own step. A pair that
 * starts on the same point still separates, along +X.
 */
export function yieldFromAlly(
  x: number,
  z: number,
  allyX: number,
  allyZ: number,
  radius = SEPARATION_RADIUS,
  gain = SOFT_SEPARATION_YIELD,
): Vector2D {
  let dx = x - allyX;
  let dz = z - allyZ;
  let dist = Math.hypot(dx, dz);
  if (dist >= radius) return { x, z };
  if (dist < 1e-4) {
    dx = 1;
    dz = 0;
    dist = 0;
  }
  const push = (radius - dist) * gain;
  const nx = dist === 0 ? 1 : dx / dist;
  const nz = dist === 0 ? 0 : dz / dist;
  return { x: x + nx * push, z: z + nz * push };
}

export interface HazardBody {
  id: string;
  kind: 'player' | 'enemy';
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

export interface HazardResult {
  voidDamage: number;
  sporeDot: number;
  sporeStacks: number;
  dashMul: number;
  relocated: boolean;
}

/**
 * Void fall and the carst spore.
 * The spore arms only for players, only when the level opts in, and enemies never take it.
 */
export class ElevationSimulator {
  private readonly lastSafe = new Map<string, Vector2D>();
  private readonly dwell = new Map<string, number>();
  private readonly stacks = new Map<string, number>();

  constructor(
    private readonly grid: NavGrid,
    private readonly spores: boolean,
  ) {}

  note(body: HazardBody): void {
    const cell = this.grid.worldToCell(body.x, body.z);
    const tile = this.grid.tile(cell.cx, cell.cz);
    if (tile?.elevation === 0 && tile.walkable) {
      this.lastSafe.set(body.id, this.grid.cellCenter(cell.cx, cell.cz));
    }
  }

  integrate(body: HazardBody, dt: number): HazardResult {
    const result: HazardResult = { voidDamage: 0, sporeDot: 0, sporeStacks: 0, dashMul: 1, relocated: false };
    const cell = this.grid.worldToCell(body.x, body.z);
    const tile = this.grid.tile(cell.cx, cell.cz);
    if (!tile) return result;

    if (body.kind === 'player' && tile.elevation === -2) {
      result.voidDamage = body.maxHp * VOID_DAMAGE_FRACTION;
      body.hp = Math.max(0, body.hp - result.voidDamage);
      const safe = this.lastSafe.get(body.id) ?? this.nearestFloor(cell.cx, cell.cz);
      if (safe) {
        body.x = safe.x;
        body.z = safe.z;
        result.relocated = true;
      }
      this.dwell.set(body.id, 0);
      return result;
    }

    if (tile.elevation === 0 && tile.walkable) {
      this.lastSafe.set(body.id, this.grid.cellCenter(cell.cx, cell.cz));
    }

    if (body.kind !== 'player' || !this.spores || tile.elevation !== -1) {
      this.dwell.set(body.id, 0);
      this.stacks.set(body.id, 0);
      return result;
    }

    const previous = this.dwell.get(body.id) ?? 0;
    const stood = previous + dt;
    this.dwell.set(body.id, stood);
    if (stood <= SPORE_ARM_SECONDS) return result;

    const armedNow = stood - SPORE_ARM_SECONDS;
    const armedPrev = Math.max(0, previous - SPORE_ARM_SECONDS);
    const nextStacks = Math.min(SPORE_MAX_STACKS, Math.floor(armedNow / SPORE_STACK_SECONDS) + 1);
    this.stacks.set(body.id, nextStacks);
    result.sporeStacks = nextStacks;
    result.dashMul = dashMultiplier(nextStacks);
    result.sporeDot = SPORE_DOT * (armedNow - armedPrev);
    body.hp = Math.max(0, body.hp - result.sporeDot);
    return result;
  }

  private nearestFloor(cx: number, cz: number): Vector2D | null {
    const seen = new Set<number>();
    const queue = [{ x: cx, z: cz }];
    while (queue.length > 0) {
      const cell = queue.shift()!;
      if (!this.grid.inBounds(cell.x, cell.z)) continue;
      const key = this.grid.index(cell.x, cell.z);
      if (seen.has(key)) continue;
      seen.add(key);
      const tile = this.grid.tile(cell.x, cell.z)!;
      if (tile.elevation === 0 && tile.walkable) return this.grid.cellCenter(cell.x, cell.z);
      if (seen.size > 800) break;
      for (const step of NEIGHBORS) queue.push({ x: cell.x + step.x, z: cell.z + step.z });
    }
    return null;
  }
}

export function dashMultiplier(stacks: number): number {
  return 1 - 0.1 * Math.min(SPORE_MAX_STACKS, Math.max(0, stacks));
}
