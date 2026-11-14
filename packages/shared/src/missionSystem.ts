/**
 * Procedural mission contracts (4 typologies) for the Hub board [F].
 * Generates objectives tied to the multi-zone biome cluster.
 */
import { BESTIARY, bossForBiome, elitesForBiome, mobsForBiome } from './bestiaryCatalog';
import {
  biomeOfHub,
  generateRaidArena,
  generateZoneCluster,
  hashSeedString,
  makeMissionSeed,
  type BiomeId,
  type HubId,
  type ZoneMap,
  zoneMapToLayout,
} from './proceduralBiomes';
import { Rng } from './math';
import type { Layout } from './layout';
import type { EnemyTypeId } from './types';
import type { WaveDef } from './missions';

export type MissionKind = 'BOSS_HUNT' | 'CAPTURE_QUEST' | 'GATHERING_RUN' | 'RAID_DEFENSE';

export interface MissionContract {
  id: string;
  kind: MissionKind;
  hubId: HubId;
  biome: BiomeId;
  name: string;
  brief: string;
  missionSeed: string;
  /** Display difficulty 1–5. */
  danger: number;
  rewardHint: string;
}

export interface ProceduralMissionRuntime {
  contract: MissionContract;
  zones: ZoneMap[];
  /** For RAID_DEFENSE a single arena replaces the cluster. */
  raidArena?: ZoneMap;
  zoneIndex: number; // 0..2 for cluster, 0 for raid
  objectives: MissionObjectiveState;
}

export interface MissionObjectiveState {
  kind: MissionKind;
  /** Gathering: nodes remaining to extract. */
  resourcesLeft: number;
  resourcesTotal: number;
  resourcesCarried: number;
  /** Boss hunt / capture. */
  bossId: EnemyTypeId;
  bossSpawned: boolean;
  bossHpFrac: number;
  bossBroken: boolean;
  captureReady: boolean;
  captureSucceeded: boolean;
  bossKilledIllegally: boolean;
  /** Raid. */
  wave: number;
  wavesTotal: number;
  relicHp: number;
  relicMaxHp: number;
  gateUnlocked: boolean[];
  extractUnlocked: boolean;
  complete: boolean;
  failed: boolean;
}

const KIND_LABELS: Record<MissionKind, string> = {
  BOSS_HUNT: 'Caccia al Boss',
  CAPTURE_QUEST: 'Cattura Viva',
  GATHERING_RUN: 'Raccolta & Estrazione',
  RAID_DEFENSE: 'Raid / Assedio',
};

const RESOURCE_NAMES: Record<BiomeId, string> = {
  urban: 'Pietra Solare',
  coastal: 'Reliquie Abissali',
  wild: 'Radici Arcana',
};

const BOSS_NAMES: Record<BiomeId, string> = {
  urban: 'Alto Inquisitore Vaelen',
  coastal: "L'Idra Carsica di Badiscar",
  wild: 'Il Monolito Vivente di Jugianel',
};

export function contractName(kind: MissionKind, biome: BiomeId, rng: Rng): string {
  const base = KIND_LABELS[kind];
  const place =
    biome === 'urban' ? rng.pick(['Mur', 'Málya', 'i Vicoli Neri']) : biome === 'coastal' ? rng.pick(['Badiscar', 'Otranth', 'Kaza-Massel']) : rng.pick(['Jugianel', 'San ã Rica', 'Miner-Vin']);
  return `${base} · ${place}`;
}

export function generateContractBoard(hubId: HubId, seed: number | string, count = 4): MissionContract[] {
  const rng = new Rng(typeof seed === 'string' ? hashSeedString(seed) : seed >>> 0 || 1);
  const biome = biomeOfHub(hubId);
  const kinds: MissionKind[] = ['BOSS_HUNT', 'CAPTURE_QUEST', 'GATHERING_RUN', 'RAID_DEFENSE'];
  // Shuffle kinds so the board feels fresh but always offers variety.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = kinds[i]!;
    kinds[i] = kinds[j]!;
    kinds[j] = tmp;
  }
  const out: MissionContract[] = [];
  for (let i = 0; i < Math.min(count, kinds.length); i++) {
    const kind = kinds[i]!;
    const missionSeed = makeMissionSeed(hubId, 10000 + rng.int(89999));
    const danger = 2 + rng.int(3);
    const boss = BOSS_NAMES[biome];
    const res = RESOURCE_NAMES[biome];
    let brief = '';
    let rewardHint = 'Bottino di missione + PE';
    if (kind === 'BOSS_HUNT') {
      brief = `Inseguite ${boss} attraverso tre zone. Sotto il 50% HP sfonderà la tana e andrà in Furia.`;
      rewardHint = 'Forziere Reliquia del Boss (arma rara, un archetipo a testa)';
    } else if (kind === 'CAPTURE_QUEST') {
      brief = `Tramortite ${boss} senza ucciderlo: sotto il 15% HP e Spezzato, premi [F] per catturare (regola Tramortire).`;
      rewardHint = 'Bonus cattura + Forziere Reliquia';
    } else if (kind === 'GATHERING_RUN') {
      brief = `Estraete 6 nodi di ${res} e riportateli al varco dell'Hub. Ondate di mob ed élite cercheranno di fermarvi.`;
      rewardHint = `PE + oro + ${res}`;
    } else {
      brief = `Difendete la Reliquia Centrale nell'Arena Bastione da 3 ondate (N/E/O). Alla 3ª ondata arriva ${boss}.`;
      rewardHint = 'Forziere Reliquia se la difesa regge';
    }
    out.push({
      id: `${kind.toLowerCase()}_${hubId}_${i}_${missionSeed.slice(-5)}`,
      kind,
      hubId,
      biome,
      name: contractName(kind, biome, rng),
      brief,
      missionSeed,
      danger,
      rewardHint,
    });
  }
  return out;
}

export function emptyObjectives(kind: MissionKind, biome: BiomeId): MissionObjectiveState {
  return {
    kind,
    resourcesLeft: kind === 'GATHERING_RUN' ? 6 : 0,
    resourcesTotal: kind === 'GATHERING_RUN' ? 6 : 0,
    resourcesCarried: 0,
    bossId: bossForBiome(biome),
    bossSpawned: false,
    bossHpFrac: 1,
    bossBroken: false,
    captureReady: false,
    captureSucceeded: false,
    bossKilledIllegally: false,
    wave: 0,
    wavesTotal: kind === 'RAID_DEFENSE' ? 3 : 0,
    relicHp: 100,
    relicMaxHp: 100,
    gateUnlocked: [true, false, false],
    extractUnlocked: false,
    complete: false,
    failed: false,
  };
}

export function createProceduralRuntime(contract: MissionContract): ProceduralMissionRuntime {
  if (contract.kind === 'RAID_DEFENSE') {
    const rng = new Rng(hashSeedString(contract.missionSeed));
    const arena = generateRaidArena(rng, contract.hubId, contract.missionSeed.slice(-6));
    return {
      contract,
      zones: [arena],
      raidArena: arena,
      zoneIndex: 0,
      objectives: emptyObjectives(contract.kind, contract.biome),
    };
  }
  const zones = generateZoneCluster(contract.missionSeed, contract.hubId);
  // Scatter 6 gathering nodes across zones
  if (contract.kind === 'GATHERING_RUN') {
    const rng = new Rng(hashSeedString(contract.missionSeed + ':res'));
    let left = 6;
    for (const z of zones) {
      const n = z === zones[2] ? left : Math.min(left, 2);
      for (let i = 0; i < n; i++) {
        const s = z.enemySpawns[rng.int(Math.max(1, z.enemySpawns.length))] ?? z.center;
        z.resourceSpawns.push({ x: s.x + rng.range(-2, 2), z: s.z + rng.range(-2, 2) });
      }
      left -= n;
    }
  }
  return {
    contract,
    zones,
    zoneIndex: 0,
    objectives: emptyObjectives(contract.kind, contract.biome),
  };
}

export function currentZone(rt: ProceduralMissionRuntime): ZoneMap {
  return rt.zones[rt.zoneIndex]!;
}

export function currentLayout(rt: ProceduralMissionRuntime): Layout {
  return zoneMapToLayout(currentZone(rt));
}

/** Build wave tables for the current zone from bestiary + mission kind. */
export function wavesForZone(rt: ProceduralMissionRuntime): WaveDef[] {
  const biome = rt.contract.biome;
  const mobs = mobsForBiome(biome);
  const elites = elitesForBiome(biome);
  const boss = bossForBiome(biome);
  const z = rt.zoneIndex + 1;
  const kind = rt.contract.kind;

  if (kind === 'RAID_DEFENSE') {
    return [
      { spawns: [[mobs[0]!, 4], [mobs[1]!, 3]], hint: 'Ondata 1 · Varco Nord' },
      { spawns: [[mobs[2]!, 4], [elites[0]!, 1]], hint: 'Ondata 2 · Varchi Est e Ovest' },
      { spawns: [[boss, 1], [mobs[3]!, 3], [elites[1]!, 1]], hint: `Ondata 3 · ${BOSS_NAMES[biome]}` },
    ];
  }

  if (kind === 'GATHERING_RUN') {
    return [
      { spawns: [[mobs[rngPick(mobs, z)]!, 3], [mobs[(z + 1) % mobs.length]!, 2]], hint: `Estrai ${RESOURCE_NAMES[biome]} con [F]` },
      { spawns: [[mobs[1]!, 3], [elites[0]!, 1]], hint: 'Difendi i portatori verso il varco' },
    ];
  }

  // Boss hunt / capture share patrol structure; boss appears late.
  if (z === 1) {
    return [
      { spawns: [[mobs[0]!, 3]], hint: 'Tracce del boss… avanzate.' },
      { spawns: [[mobs[1]!, 3], [mobs[2]!, 2]] },
      { spawns: [[mobs[3]!, 2], [elites[0]!, 1]] },
    ];
  }
  if (z === 2) {
    return [
      { spawns: [[mobs[2]!, 3], [elites[0]!, 1]], hint: 'Il boss è vicino.' },
      {
        spawns: [[boss, 1], [mobs[4]!, 2]],
        hint: kind === 'CAPTURE_QUEST' ? 'Non uccidetelo: spezzatelo e tramortitelo.' : 'Sotto il 50% HP sfonderà la Zona 3.',
      },
    ];
  }
  // Zone 3 boss lair
  return [
    {
      spawns: [[boss, 1], [elites[1]!, 1]],
      hint: kind === 'CAPTURE_QUEST' ? 'Sotto 15% HP + Spezzato → [F] Cattura' : 'Tana del Boss — finite il lavoro.',
    },
  ];
}

function rngPick(list: EnemyTypeId[], salt: number): number {
  return Math.abs(salt) % list.length;
}

export function unlockNextGate(rt: ProceduralMissionRuntime): void {
  const zone = currentZone(rt);
  for (const g of zone.gates) {
    if (g.link.startsWith('z') || g.link === 'hub') g.unlocked = true;
  }
  rt.objectives.gateUnlocked[rt.zoneIndex] = true;
  if (rt.zoneIndex < rt.zones.length - 1) {
    // Mark egress unlocked for UI
  }
  if (rt.contract.kind === 'GATHERING_RUN' && rt.objectives.resourcesCarried >= rt.objectives.resourcesTotal) {
    rt.objectives.extractUnlocked = true;
  }
}

export function advanceZone(rt: ProceduralMissionRuntime): boolean {
  if (rt.zoneIndex >= rt.zones.length - 1) return false;
  rt.zoneIndex++;
  return true;
}

/** Update capture prompt eligibility. */
export function updateBossObjective(
  rt: ProceduralMissionRuntime,
  boss: { hp: number; maxHp: number; broken: boolean; dead: boolean },
): void {
  if (!boss) return;
  rt.objectives.bossSpawned = true;
  rt.objectives.bossHpFrac = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  rt.objectives.bossBroken = boss.broken;
  if (rt.contract.kind === 'CAPTURE_QUEST') {
    if (boss.dead) {
      rt.objectives.bossKilledIllegally = true;
      rt.objectives.captureReady = false;
    } else {
      rt.objectives.captureReady = rt.objectives.bossHpFrac <= 0.15 && boss.broken;
    }
  }
  if (rt.contract.kind === 'BOSS_HUNT' && rt.zoneIndex === 1 && rt.objectives.bossHpFrac <= 0.5) {
    // Enrage: unlock gate to zone 3
    unlockNextGate(rt);
  }
}

export function tryCapture(rt: ProceduralMissionRuntime): boolean {
  if (rt.contract.kind !== 'CAPTURE_QUEST') return false;
  if (!rt.objectives.captureReady || rt.objectives.bossKilledIllegally) return false;
  rt.objectives.captureSucceeded = true;
  rt.objectives.complete = true;
  return true;
}

export function gatherResource(rt: ProceduralMissionRuntime): boolean {
  if (rt.contract.kind !== 'GATHERING_RUN') return false;
  if (rt.objectives.resourcesLeft <= 0) return false;
  rt.objectives.resourcesLeft--;
  rt.objectives.resourcesCarried++;
  if (rt.objectives.resourcesCarried >= rt.objectives.resourcesTotal) {
    rt.objectives.extractUnlocked = true;
    unlockNextGate(rt);
  }
  return true;
}

export function damageRelic(rt: ProceduralMissionRuntime, amount: number): void {
  if (rt.contract.kind !== 'RAID_DEFENSE') return;
  rt.objectives.relicHp = Math.max(0, rt.objectives.relicHp - amount);
  if (rt.objectives.relicHp <= 0) rt.objectives.failed = true;
}

/** Human-readable objective line for HUD. */
export function objectiveHudLine(rt: ProceduralMissionRuntime): string {
  const o = rt.objectives;
  if (o.failed) return 'Missione fallita';
  if (o.complete) return 'Obiettivo completato — tornate al varco';
  switch (o.kind) {
    case 'BOSS_HUNT':
      return o.bossSpawned ? `Boss ${Math.ceil(o.bossHpFrac * 100)}% HP · Zona ${rt.zoneIndex + 1}/3` : `Caccia · Zona ${rt.zoneIndex + 1}/3`;
    case 'CAPTURE_QUEST':
      if (o.bossKilledIllegally) return 'Boss ucciso — bonus cattura annullato';
      if (o.captureReady) return 'Premi [F] per Catturare/Tramortire';
      return o.bossSpawned ? `Tramortire · ${Math.ceil(o.bossHpFrac * 100)}% HP` : `Cattura viva · Zona ${rt.zoneIndex + 1}/3`;
    case 'GATHERING_RUN':
      return `${RESOURCE_NAMES[rt.contract.biome]} ${o.resourcesCarried}/${o.resourcesTotal}` + (o.extractUnlocked ? ' · Varco aperto' : '');
    case 'RAID_DEFENSE':
      return `Reliquia ${Math.ceil((o.relicHp / o.relicMaxHp) * 100)}% · Ondata ${Math.min(o.wave + 1, o.wavesTotal)}/${o.wavesTotal}`;
  }
}

export function bestiaryTipForContract(contract: MissionContract): string {
  const boss = BESTIARY.find((e) => e.id === bossForBiome(contract.biome));
  return boss?.tip ?? '';
}

export { KIND_LABELS, RESOURCE_NAMES, BOSS_NAMES };
