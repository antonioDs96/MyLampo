export type WorkspaceId = 'architecture' | 'skills' | 'dioramas' | 'combat' | 'bugs';

export type HeroId =
  | 'albereth'
  | 'jusef'
  | 'vyncent'
  | 'alexios'
  | 'rycard'
  | 'fabyorn'
  | 'gabryel'
  | 'anthon'
  | 'dalith';

export type WindElement =
  | 'SCIROCCO'
  | 'TRAMONTANA'
  | 'MAESTRALE'
  | 'LEVANTE'
  | 'PONENTE'
  | 'NONE';

export type EarthWind = 'SCIROCCO' | 'TRAMONTANA' | 'MAESTRALE';
export type CoastWind = 'LEVANTE' | 'PONENTE';
export type BranchId = 'A' | 'B' | 'C';

export type PrimitiveStatus =
  | 'DOT'
  | 'SLOW'
  | 'ROOT'
  | 'STUN'
  | 'VULNERABLE'
  | 'DISPLACE'
  | 'SHIELD'
  | 'HASTE'
  | 'EMPOWER'
  | 'SUPER_ARMOR'
  | 'STEALTH_CAMO'
  | 'REGEN';

export interface StatusSpec {
  code: PrimitiveStatus;
  kind: 'Buff' | 'Debuff';
  summary: string;
  bounds: string;
  teamCap: string;
  capMetric?: { key: string; max: number; unit: string };
}

export interface StatusPayload {
  type: PrimitiveStatus;
  intensity: number;
  unit: string;
  durationSec: number;
  target: 'enemy' | 'self' | 'party';
}

export interface TreeLeafNode {
  id: string;
  tier: 5 | 6 | 7;
  wind: EarthWind | CoastWind;
  title: string;
  effect: string;
  vfx: string;
  statuses: StatusPayload[];
}

export interface PostureBranch {
  branch: BranchId;
  name: string;
  focus: string;
  tier3: { title: string; effect: string; vfx: string; statuses: StatusPayload[] };
  tier4: { title: string; effect: string; vfx: string; statuses: StatusPayload[] };
  windRoutes: Record<string, [TreeLeafNode, TreeLeafNode, TreeLeafNode]>;
}

export interface AbilityTreeSpec {
  slot: 'E' | 'R';
  name: string;
  resource: 'Stamina' | 'Mana' | 'Eclissi';
  resourceCost: number;
  cooldownSec: number;
  baseSummary: string;
  tier1: { title: string; effect: string; vfx: string };
  tier2: { title: string; effect: string; vfx: string };
  branches: [PostureBranch, PostureBranch, PostureBranch];
}

export interface PassiveExpansionSpec {
  innatePassive: string;
  passiveBranchName: string;
  passiveTiers: [
    { tier: 1; name: string; effect: string; gemCost: number },
    { tier: 2; name: string; effect: string; gemCost: number },
    { tier: 3; name: string; effect: string; gemCost: number },
  ];
  uniqueKeystone: {
    name: string;
    unlockRequirement: string;
    gemCost: number;
    effect: string;
    synergyTag: string;
  };
}

export interface HeroSpec {
  id: HeroId;
  code: string;
  name: string;
  short: string;
  title: string;
  role: string;
  archetype: 'skirmisher' | 'support' | 'brawler' | 'juggernaut' | 'sniper' | 'breaker' | 'artillery' | 'disruptor' | 'evasion_tank';
  home: string;
  color: string;
  hp: number;
  stamina: number;
  speed: number;
  critBase: number;
  weaponStyle: string;
  passiveExpansion: PassiveExpansionSpec;
  specialE: AbilityTreeSpec;
  ultimateR: AbilityTreeSpec;
}

export type ElevationLevel = -2 | -1 | 0 | 1 | 2;

export type PaduanoPacingType =
  | 'INTRO'
  | 'HIGH_PRESSURE'
  | 'ASYMMETRIC_DILEMMA'
  | 'SIEGE_PEAK'
  | 'DECOMPRESSION_VALLEY'
  | 'ATTRITION_GAUNTLET'
  | 'CLIMAX_BOSS';

export interface SubTileProp {
  subX: 0 | 1;
  subY: 0 | 1;
  type: 'BAROQUE_COLUMN' | 'DRY_WALL_H' | 'DRY_WALL_V' | 'OLIVE_SHADOW' | 'LIME_BRAZIER' | 'MOORING_BOLLARD' | 'KARST_STALAGMITE';
  elevation: ElevationLevel;
  blocksLoS: boolean;
  blocksMovement: boolean;
  onImpactStunDuration?: number;
}

export interface BloodGateDef {
  id: string;
  gateCells: Array<{ x: number; y: number }>;
  requiredEliteKills: number;
  requiredTotalKills: number;
  isSealedOnInit: boolean;
  note: string;
}

export interface PoiMarker {
  id: string;
  kind: 'SPAWN_PARTY' | 'SANTUARIO_CURA' | 'FORZIERE_SINERGIA' | 'ALTARE_BIOMA' | 'PORTALE_TRANSIZIONE' | 'PILASTRO_BASTIONE';
  label: string;
  x: number;
  y: number;
  sizeX?: number;
  sizeY?: number;
}

export interface ZoneEncounter {
  zoneId: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Z6' | 'Z7';
  name: string;
  paduanoPacingType: PaduanoPacingType;
  tacticalRole: string;
  boundingBox: { minX: number; maxX: number; minY: number; maxY: number };
  baseElevation: ElevationLevel;
  carvedSlices: Array<{
    startX: number;
    endX: number;
    startY: number;
    endY: number;
    elevation: ElevationLevel;
  }>;
  elevationModifiers: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    targetElevation: ElevationLevel;
    isRamp?: boolean;
    rampDirection?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
  }>;
  subProps: Array<{
    macroX: number;
    macroY: number;
    props: SubTileProp[];
  }>;
  bloodGate?: BloodGateDef;
  garrison: {
    corsairMelee: number;
    corsairRanged: number;
    shieldedGuards: number;
    eliteChampions: number;
    hazardTraps: number;
  };
}

export type CityId = 'badiscar' | 'kaza' | 'ujian' | 'terre_rosse';

export interface BiomeElevationSwatch {
  label: string;
  color: string;
  pbrMaterial: string;
}

export interface ArchitecturalStyleDescriptor {
  lineage: string;
  spatialGrammar: string;
  sightlineRule: string;
  wallTreatment: string;
}

export interface DioramaLandmark {
  id: string;
  name: string;
  kind: 'MONUMENT' | 'WINCH' | 'LIGHTHOUSE' | 'ALTAR' | 'BRIDGE_ARCH' | 'RIFT' | 'OBELISK' | 'PILLAR';
  x: number;
  y: number;
  width?: number;
  height?: number;
  tacticalEffect: string;
}

export interface AudioAtmosphereSpec {
  cueId: string;
  soundscape: string;
  ambientBed: string;
  reactiveCue: string;
  spatialReverb: string;
  isPlaceholder: boolean;
}

export interface CityRegionProfile {
  id: CityId;
  name: string;
  badge: string;
  aestheticTitle: string;
  architecturalDescriptor: string;
  lynchGrammar: string;
  visibilityAndRendering: string;
  solidCoverageRange: string;
  paletteSummary: Record<ElevationLevel, BiomeElevationSwatch>;
  keyMaterials: string[];
  audioAtmosphere: AudioAtmosphereSpec;
}

export interface DioramaSpec {
  id: string;
  city: CityId;
  cityName: string;
  stageIndex: number;
  kind: 'environment' | 'boss_arena' | 'region_roadmap';
  name: string;
  subtitle: string;
  archetype: string;
  status: 'Canonical Spec' | 'New Authored Blueprint' | 'Region 2 Roadmap';
  gridSize: 64 | 32;
  targetSolidCoveragePct: number;
  materials: string[];
  terrainPalette: Record<ElevationLevel, BiomeElevationSwatch>;
  architecturalStyle: ArchitecturalStyleDescriptor;
  landmarks: DioramaLandmark[];
  audioAtmosphere: AudioAtmosphereSpec;
  miniBoss: string;
  targetRunMinutes: string;
  spawn: { x: number; y: number };
  portal: { x: number; y: number };
  pois: PoiMarker[];
  zones: Record<string, ZoneEncounter>;
  notes: string[];
}

export interface WindReactionSpec {
  id: string;
  kind: 'Heterologous' | 'Homologous';
  primer: WindElement;
  catalyst: WindElement;
  name: string;
  mechanics: string;
  bossBreakEffect: string;
}

export interface BestiaryEntry {
  id: string;
  name: string;
  rank: 'Base' | 'Élite' | 'Boss';
  hp: number;
  armor: number;
  speed: number;
  damage: number;
  signatureMove: string;
  tacticalCounter: string;
}

export interface ArchModule {
  id: string;
  packageName: '@malampu/shared' | '@malampu/server' | '@malampu/client';
  title: string;
  layer: 'Authoring & Level' | 'Simulation 60Hz' | 'Network & Persistence' | 'Rendering & HUD';
  currentGap: string;
  targetRefactor: string;
  dependencies: string[];
  contractPreview: string;
}

export interface BugTicket {
  id: string;
  subsystem: 'Terrain & Blood Gates' | 'Combat & 12 Statuses' | 'AI & Bosses' | 'Client VFX & UI';
  severity: 'Critical' | 'High' | 'Medium';
  title: string;
  symptom: string;
  rootCause: string;
  affectedModules: string[];
  fixPattern: string;
  verificationCheck: string;
}

export type BugStatus = 'open' | 'in_progress' | 'verified';
