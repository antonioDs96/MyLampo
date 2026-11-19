import type { DioramaSpec, ElevationLevel } from './types';

export interface CompiledDioramaResult {
  size: number;
  elevationGrid: Int8Array;
  walkableGrid: Uint8Array;
  losBlockingGrid: Uint8Array;
  zoneGrid: Array<string>;
  solidCoveragePct: number;
  walkableCount: number;
  seamErrors: Array<{ x: number; y: number; neighborX: number; neighborY: number; delta: number }>;
  poiErrors: string[];
  spawnReachable: boolean;
  portalReachable: boolean;
  reachableCells: Set<number>;
  pillarIntegrityOk: boolean;
  totalGarrisonUnits: number;
  bloodGateCount: number;
  minBloodGateWidthCells: number;
  bloodGateWidthOk: boolean;
  sealedPortalBlocked: boolean;
  bloodGateSealingOk: boolean;
}

export const MASSEUS_PILLAR_BOXES: ReadonlyArray<readonly [number, number, number, number]> = [
  [7, 10, 7, 10],
  [21, 24, 7, 10],
  [7, 10, 21, 24],
  [21, 24, 21, 24],
];

function runBfsFromSpawn(
  size: number,
  elevationGrid: Int8Array,
  walkableGrid: Uint8Array,
  spawnIdx: number,
  extraBlockedIndices?: Set<number>,
): Set<number> {
  const reachable = new Set<number>();
  if (walkableGrid[spawnIdx] !== 1 || extraBlockedIndices?.has(spawnIdx)) {
    return reachable;
  }
  const queue: number[] = [spawnIdx];
  reachable.add(spawnIdx);
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++]!;
    const cx = curr % size;
    const cy = Math.floor(curr / size);
    const cz = elevationGrid[curr]!;
    const dirs: [number, number][] = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of dirs) {
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const nIdx = ny * size + nx;
      if (reachable.has(nIdx) || walkableGrid[nIdx] === 0 || extraBlockedIndices?.has(nIdx)) {
        continue;
      }
      if (Math.abs(cz - elevationGrid[nIdx]!) <= 1) {
        reachable.add(nIdx);
        queue.push(nIdx);
      }
    }
  }
  return reachable;
}

export function compileDiorama(spec: DioramaSpec): CompiledDioramaResult {
  const size = spec.gridSize;
  const total = size * size;
  const elevationGrid = new Int8Array(total);
  const walkableGrid = new Uint8Array(total);
  const losBlockingGrid = new Uint8Array(total);
  const zoneGrid = new Array<string>(total).fill('WALL');

  // Solid-by-Default initialization: Quota +2, unwalkable, blocks LoS
  elevationGrid.fill(2);
  walkableGrid.fill(0);
  losBlockingGrid.fill(1);

  const zones = Object.values(spec.zones);
  let totalGarrisonUnits = 0;

  for (const zone of zones) {
    totalGarrisonUnits +=
      zone.garrison.corsairMelee +
      zone.garrison.corsairRanged +
      zone.garrison.shieldedGuards +
      zone.garrison.eliteChampions;

    for (const slice of zone.carvedSlices) {
      const x0 = Math.max(0, slice.startX);
      const x1 = Math.min(size, slice.endX);
      const y0 = Math.max(0, slice.startY);
      const y1 = Math.min(size, slice.endY);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = y * size + x;
          elevationGrid[idx] = slice.elevation;
          const isWalkable = slice.elevation >= -1 && slice.elevation <= 1;
          walkableGrid[idx] = isWalkable ? 1 : 0;
          losBlockingGrid[idx] = slice.elevation === 2 ? 1 : 0;
          zoneGrid[idx] = zone.zoneId;
        }
      }
    }

    for (const mod of zone.elevationModifiers) {
      const x0 = Math.max(0, mod.x);
      const x1 = Math.min(size, mod.x + mod.width);
      const y0 = Math.max(0, mod.y);
      const y1 = Math.min(size, mod.y + mod.height);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = y * size + x;
          elevationGrid[idx] = mod.targetElevation;
          const isWalkable = mod.targetElevation >= -1 && mod.targetElevation <= 1;
          walkableGrid[idx] = isWalkable ? 1 : 0;
          losBlockingGrid[idx] = mod.targetElevation === 2 ? 1 : 0;
          if (zoneGrid[idx] === 'WALL') zoneGrid[idx] = zone.zoneId;
        }
      }
    }

    for (const propGroup of zone.subProps) {
      for (const prop of propGroup.props) {
        if (prop.blocksLoS && prop.elevation === 2) {
          const idx = propGroup.macroY * size + propGroup.macroX;
          if (idx >= 0 && idx < total) {
            losBlockingGrid[idx] = 1;
          }
        }
      }
    }
  }

  // Validate vertical step continuity |ΔZ| <= 1 between adjacent walkable cells
  const seamErrors: CompiledDioramaResult['seamErrors'] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (walkableGrid[idx] === 0) continue;
      const z = elevationGrid[idx]!;
      const neighbors: [number, number][] = [
        [x + 1, y],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx >= size || ny >= size) continue;
        const nIdx = ny * size + nx;
        if (walkableGrid[nIdx] === 0) continue;
        const nz = elevationGrid[nIdx]!;
        const delta = Math.abs(z - nz);
        if (delta >= 2) {
          seamErrors.push({ x, y, neighborX: nx, neighborY: ny, delta });
        }
      }
    }
  }

  // BFS reachability from Spawn using |ΔZ| <= 1 rule (unsealed pass)
  const spawnIdx = spec.spawn.y * size + spec.spawn.x;
  const spawnReachable = walkableGrid[spawnIdx] === 1;
  const reachableCells = runBfsFromSpawn(size, elevationGrid, walkableGrid, spawnIdx);

  const portalIdx = spec.portal.y * size + spec.portal.x;
  const portalReachable = reachableCells.has(portalIdx);

  // Validate POIs walkability & BFS reachability from Spawn
  const poiErrors: string[] = [];
  for (const poi of spec.pois) {
    if (poi.x < 0 || poi.x >= size || poi.y < 0 || poi.y >= size) {
      poiErrors.push(`${poi.label} (${poi.x}, ${poi.y}) è fuori griglia.`);
      continue;
    }
    const idx = poi.y * size + poi.x;
    const elev = elevationGrid[idx] as ElevationLevel;
    if (poi.kind === 'PILASTRO_BASTIONE') {
      if (elev !== 2) {
        poiErrors.push(`${poi.label} deve essere solido a Quota +2 (trovata Quota ${elev}).`);
      }
    } else if (walkableGrid[idx] === 0) {
      poiErrors.push(`${poi.label} (${poi.x}, ${poi.y}) cade su cella non calpestabile (Quota ${elev}).`);
    } else if (spawnReachable && !reachableCells.has(idx)) {
      poiErrors.push(`${poi.label} (${poi.x}, ${poi.y}) è isolato da SPAWN_PARTY (BFS non raggiungibile).`);
    }
  }

  // Validate Blood Gate sealing & minimum 3-cell (12m) artery width
  const sealedGateIndices = new Set<number>();
  let bloodGateCount = 0;
  let minBloodGateWidthCells = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    if (!zone.bloodGate) continue;
    bloodGateCount++;
    let walkableGateSpan = 0;
    for (const c of zone.bloodGate.gateCells) {
      if (c.x < 0 || c.x >= size || c.y < 0 || c.y >= size) continue;
      const gIdx = c.y * size + c.x;
      if (walkableGrid[gIdx] === 1) {
        walkableGateSpan++;
      }
      if (zone.bloodGate.isSealedOnInit) {
        sealedGateIndices.add(gIdx);
      }
    }
    if (walkableGateSpan < minBloodGateWidthCells) {
      minBloodGateWidthCells = walkableGateSpan;
    }
  }

  if (bloodGateCount === 0) {
    minBloodGateWidthCells = 0;
  }

  const sealedReachable = runBfsFromSpawn(
    size,
    elevationGrid,
    walkableGrid,
    spawnIdx,
    sealedGateIndices,
  );
  const sealedPortalBlocked =
    spec.kind === 'boss_arena' ? true : !sealedReachable.has(portalIdx);
  const bloodGateWidthOk =
    spec.kind === 'boss_arena' ? true : bloodGateCount >= 2 && minBloodGateWidthCells >= 3;
  const bloodGateSealingOk =
    spec.kind === 'boss_arena'
      ? true
      : bloodGateCount >= 2 && sealedPortalBlocked && portalReachable;

  let solidCount = 0;
  let walkableCount = 0;
  for (let i = 0; i < total; i++) {
    if (walkableGrid[i] === 1) walkableCount++;
    else solidCount++;
  }
  const solidCoveragePct = Math.round((solidCount / total) * 1000) / 10;

  let pillarIntegrityOk = true;
  if (spec.id === 'badiscar_masseus_arena') {
    for (const [x0, x1, y0, y1] of MASSEUS_PILLAR_BOXES) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = y * size + x;
          if (elevationGrid[idx] !== 2 || walkableGrid[idx] !== 0) pillarIntegrityOk = false;
        }
      }
    }
  }

  return {
    size,
    elevationGrid,
    walkableGrid,
    losBlockingGrid,
    zoneGrid,
    solidCoveragePct,
    walkableCount,
    seamErrors,
    poiErrors,
    spawnReachable,
    portalReachable,
    reachableCells,
    pillarIntegrityOk,
    totalGarrisonUnits,
    bloodGateCount,
    minBloodGateWidthCells,
    bloodGateWidthOk,
    sealedPortalBlocked,
    bloodGateSealingOk,
  };
}

export function simulateMasseusTideInterphase(spec: DioramaSpec): {
  floodedCells: number;
  pillarCellsChecked: number;
  allPillarsIntact: boolean;
} {
  const compiled = compileDiorama(spec);
  const size = compiled.size;
  const tideElevation = new Int8Array(compiled.elevationGrid);
  const tideWalkable = new Uint8Array(compiled.walkableGrid);
  const tideLos = new Uint8Array(compiled.losBlockingGrid);

  const isInsidePillarBox = (x: number, y: number) =>
    MASSEUS_PILLAR_BOXES.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

  let floodedCells = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isInsidePillarBox(x, y)) continue;
      const idx = y * size + x;
      if (tideElevation[idx]! <= 0) {
        tideElevation[idx] = -1;
        tideWalkable[idx] = 1;
        floodedCells++;
      }
    }
  }

  let pillarCellsChecked = 0;
  let allPillarsIntact = true;
  for (const [x0, x1, y0, y1] of MASSEUS_PILLAR_BOXES) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        pillarCellsChecked++;
        const idx = y * size + x;
        if (tideElevation[idx] !== 2 || tideWalkable[idx] !== 0 || tideLos[idx] !== 1) {
          allPillarsIntact = false;
        }
      }
    }
  }

  return {
    floodedCells,
    pillarCellsChecked,
    allPillarsIntact,
  };
}

export function computeEncounterScaling(baseHp: number, baseStagger: number, baseDmg: number, players: number, meleeWithin6m: number) {
  const n = Math.max(1, Math.min(9, players));
  const hpMultCombat = 1 + (n - 1) * 0.55;
  const hpMultMob = 1 + (n - 1) * 0.45;
  const staggerMult = 1 + (n - 1) * 0.7;
  const antiZergMult = 1 + 0.35 * Math.max(0, meleeWithin6m - 1);
  return {
    players: n,
    bossHp: Math.round(baseHp * hpMultCombat),
    mobHpMult: Math.round(hpMultMob * 100) / 100,
    bossHpMult: Math.round(hpMultCombat * 100) / 100,
    bossStagger: Math.round(baseStagger * staggerMult),
    staggerMult: Math.round(staggerMult * 100) / 100,
    antiZergMult: Math.round(antiZergMult * 100) / 100,
    effective360Dmg: Math.round(baseDmg * antiZergMult),
  };
}
