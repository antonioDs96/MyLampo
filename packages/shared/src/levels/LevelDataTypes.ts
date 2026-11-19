/**
 * Data contracts for the fixed Badiscar dioramas.
 * Levels are authored AABB masks. Nothing in the terrain carries hit points:
 * pillars fall because Masseus runs into them, and fissures are timed seals.
 */

export type ElevationLevel = -2 | -1 | 0 | 1 | 2;

export enum MaterialType {
  // Ambiente 1 — Falesie Erose
  PIETRA_LECCESE = 'mat_pietra_leccese',
  TERRA_ROSSA = 'mat_terra_rossa',
  BAGNASCIUGA = 'mat_bagnasciuga',
  MARE_COSTIERO = 'mat_mare_costiero',
  MACCHIA_ROCCIOSA = 'mat_macchia_rocciosa',
  // Ambiente 2 — Porto Marcescente
  LEGNO_CATRAMATO = 'mat_legno_catramato',
  LASTRICATO_PORTO = 'mat_lastricato_porto',
  VASCA_SALAGIONE = 'mat_vasca_salagione',
  MARE_PORTO = 'mat_mare_porto',
  PARETE_DOGANA = 'mat_parete_dogana',
  // Ambiente 3 — Grotte Carsiche
  CALCITE_IPOGEA = 'mat_calcite_ipogea',
  MELMA_SOLFUREA = 'mat_melma_solfurea',
  ABISSO_NERO = 'mat_abisso_nero',
  PILASTRO_CARSICO = 'mat_pilastro_carsico',
  CRISTALLO_FLUORITE = 'mat_cristallo',
  // Arena
  BASTIONE_PIETRA = 'mat_bastione_pietra',
  PILASTRO_ROTTURA = 'mat_pilastro_rottura',
}

export enum POIType {
  SPAWN_PARTY = 'POI_SPAWN_PARTY',
  SANTUARIO_CURA = 'POI_SANTUARIO_CURA',
  FORZIERE_SINERGIA = 'POI_FORZIERE_SINERGIA',
  ALTARE_BIOMA = 'POI_ALTARE_BIOMA',
  PILASTRO_BASTIONE = 'POI_PILASTRO_BASTIONE',
  PORTALE_TRANSIZIONE = 'POI_PORTALE',
}

export enum EnemyType {
  CORSARO_MELEE = 'MOB_CORSARO_MELEE',
  CORSARO_TIRATORE = 'MOB_CORSARO_TIRATORE',
  SENTINELLA_RONDA = 'MOB_SENTINELLA_RONDA',
  GRANCHIO_PIETRA = 'MOB_GRANCHIO_PIETRA',
  UFFICIALE_DAZIO = 'MOB_UFFICIALE_DAZIO',
  GUARDIANO_PIETRA = 'MOB_GUARDIANO_PIETRA',
  ABERRAZIONE_LAGO = 'MOB_ABERRAZIONE_LAGO',
  MINIBOSS_NOSTROMO = 'BOSS_NOSTROMO',
  MINIBOSS_ANCORA = 'BOSS_ANCORA_SANGUE',
  MINIBOSS_MADRE = 'BOSS_MADRE_SPORE',
  BOSS_MASSEUS = 'BOSS_MASSEUS',
}

export type LevelId =
  | 'falesie'
  | 'porto'
  | 'grotte'
  | 'masseus'
  | 'kaza_canali'
  | 'kaza_saline'
  | 'kaza_cittadella'
  | 'kaza_molo'
  | 'ujian_ponte'
  | 'ujian_terrazze'
  | 'ujian_tempio'
  | 'ujian_soglia';

export interface Vector2D {
  x: number;
  z: number;
}

export interface EnemySpawnDef {
  id: string;
  type: EnemyType;
  gridX: number;
  gridZ: number;
  facingAngleDeg: number;
  minPlayersRequired: 1 | 4 | 7;
  patrolWaypoints?: Vector2D[];
  /** Diorama zone (Z1..Z7) whose garrison this unit belongs to. */
  zone?: string;
}

/** A Blood Gate of a diorama: walkable cells it seals and the zone garrison that holds it. */
export interface GateSpawnDef {
  id: string;
  zone: string;
  cells: Vector2D[];
  kills: number;
  elites: number;
}

export interface POIDef {
  id: string;
  type: POIType;
  gridX: number;
  gridZ: number;
  sizeX: number;
  sizeZ: number;
  buffId?: string;
  /** Pillars start intact. Other triggers start unspent. */
  isTriggered?: boolean;
  isDestroyed?: boolean;
}

export interface AABBZoneDef {
  name: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  elevation: ElevationLevel;
  material: MaterialType;
  walkable: boolean;
  blocksLoS: boolean;
  speedMod: number;
}

/** PBR recipe consumed by the client material manager. Values match the diorama brief. */
export interface MaterialRecipe {
  albedo: [number, number, number];
  roughness: number;
  metallic: number;
  /** Dielectric specular intensity. 0 leaves the renderer default. */
  specular: number;
  emissive: [number, number, number];
  unlit: boolean;
}

export const MATERIAL_RECIPES: Record<MaterialType, MaterialRecipe> = {
  [MaterialType.PIETRA_LECCESE]: { albedo: [0.76, 0.67, 0.42], roughness: 0.85, metallic: 0, specular: 0.04, emissive: [0, 0, 0], unlit: false },
  [MaterialType.TERRA_ROSSA]: { albedo: [0.55, 0.22, 0.14], roughness: 0.9, metallic: 0, specular: 0.03, emissive: [0, 0, 0], unlit: false },
  [MaterialType.BAGNASCIUGA]: { albedo: [0.62, 0.52, 0.38], roughness: 0.15, metallic: 0, specular: 0.7, emissive: [0, 0, 0], unlit: false },
  [MaterialType.MARE_COSTIERO]: { albedo: [0.05, 0.42, 0.58], roughness: 0.08, metallic: 0, specular: 0.55, emissive: [0, 0.02, 0.03], unlit: false },
  [MaterialType.MACCHIA_ROCCIOSA]: { albedo: [0.42, 0.4, 0.28], roughness: 0.82, metallic: 0, specular: 0.04, emissive: [0, 0, 0], unlit: false },
  [MaterialType.LEGNO_CATRAMATO]: { albedo: [0.1, 0.08, 0.07], roughness: 0.35, metallic: 0, specular: 0.4, emissive: [0, 0, 0], unlit: false },
  [MaterialType.LASTRICATO_PORTO]: { albedo: [0.2, 0.2, 0.22], roughness: 0.4, metallic: 0, specular: 0.2, emissive: [0, 0, 0], unlit: false },
  [MaterialType.VASCA_SALAGIONE]: { albedo: [0.16, 0.17, 0.1], roughness: 0.1, metallic: 0, specular: 0.35, emissive: [0, 0, 0], unlit: false },
  [MaterialType.MARE_PORTO]: { albedo: [0.06, 0.2, 0.14], roughness: 0.12, metallic: 0, specular: 0.45, emissive: [0, 0.01, 0.01], unlit: false },
  [MaterialType.PARETE_DOGANA]: { albedo: [0.14, 0.09, 0.06], roughness: 0.55, metallic: 0, specular: 0.12, emissive: [0, 0, 0], unlit: false },
  [MaterialType.CALCITE_IPOGEA]: { albedo: [0.48, 0.52, 0.58], roughness: 0.3, metallic: 0, specular: 0.25, emissive: [0, 0, 0], unlit: false },
  [MaterialType.MELMA_SOLFUREA]: { albedo: [0.48, 0.38, 0.14], roughness: 0.45, metallic: 0, specular: 0.15, emissive: [0.05, 0.15, 0.04], unlit: false },
  [MaterialType.ABISSO_NERO]: { albedo: [0, 0, 0], roughness: 1, metallic: 0, specular: 0, emissive: [0, 0, 0], unlit: true },
  [MaterialType.PILASTRO_CARSICO]: { albedo: [0.58, 0.54, 0.46], roughness: 0.7, metallic: 0, specular: 0.08, emissive: [0, 0, 0], unlit: false },
  [MaterialType.CRISTALLO_FLUORITE]: { albedo: [0.45, 0.85, 0.9], roughness: 0.12, metallic: 0, specular: 0.65, emissive: [0.1, 0.4, 0.42], unlit: false },
  [MaterialType.BASTIONE_PIETRA]: { albedo: [0.64, 0.62, 0.56], roughness: 0.45, metallic: 0, specular: 0.22, emissive: [0, 0, 0], unlit: false },
  [MaterialType.PILASTRO_ROTTURA]: { albedo: [0.36, 0.35, 0.34], roughness: 0.62, metallic: 0.04, specular: 0.18, emissive: [0, 0, 0], unlit: false },
};

export type AttackKind = 'melee' | 'ranged' | 'zone' | 'control';

export interface AttackProfile {
  id: string;
  name: string;
  kind: AttackKind;
  damage: number;
  /** Seconds before the hit. Attacks that can drop an 80 HP hero are at least 1.5s. */
  windup: number;
  cooldown: number;
  range: number;
  arcDeg?: number;
  radius?: number;
  projectileSpeed?: number;
  dash?: number;
  minRange?: number;
  root?: number;
  slow?: number;
  slowDuration?: number;
  knockback?: number;
  stun?: number;
  silence?: number;
  blind?: number;
  interrupt?: boolean;
  antiZerg?: boolean;
  /** Pull the target to the attacker on connect. */
  pull?: boolean;
  /** Timed unwalkable crack. Not a hit-point prop. */
  fissure?: number;
  /** True when the listed damage is allowed to kill from full HP because the windup is the tell. */
  lethalTell?: boolean;
}

export type AdvanceStyle = 'melee' | 'ranged' | 'static';

export interface EnemyProfile {
  type: EnemyType;
  hp: number;
  armor: number;
  speed: number;
  alertSpeed?: number;
  advance: AdvanceStyle;
  /** Preferred band for ranged kiting, metres. */
  preferred?: [number, number];
  attacks: AttackProfile[];
  vision?: { radius: number; arcDeg: number };
  hearing?: number;
  /** Hidden on elevation -1 until a player steps inside this radius. */
  burrowRadius?: number;
}

const melee = (partial: AttackProfile): AttackProfile => partial;

export const ENEMY_PROFILES: Record<Exclude<EnemyType, EnemyType.BOSS_MASSEUS>, EnemyProfile> = {
  [EnemyType.CORSARO_MELEE]: {
    type: EnemyType.CORSARO_MELEE,
    hp: 180,
    armor: 10,
    speed: 4,
    advance: 'melee',
    attacks: [
      melee({ id: 'fendente', name: 'Fendente', kind: 'melee', damage: 12, windup: 0.4, cooldown: 1.8, range: 1.8, arcDeg: 90 }),
      melee({ id: 'carica', name: 'Carica Rapida', kind: 'melee', damage: 18, windup: 0.45, cooldown: 6, range: 6, minRange: 5, dash: 6, arcDeg: 40 }),
    ],
  },
  [EnemyType.CORSARO_TIRATORE]: {
    type: EnemyType.CORSARO_TIRATORE,
    hp: 120,
    armor: 0,
    speed: 3.5,
    advance: 'ranged',
    preferred: [8, 14],
    attacks: [
      melee({ id: 'dardo', name: 'Dardo Arpionato', kind: 'ranged', damage: 10, windup: 0.45, cooldown: 2.2, range: 18, projectileSpeed: 22, root: 2 }),
      melee({ id: 'rete', name: 'Rete di Piombo', kind: 'ranged', damage: 0, windup: 0.55, cooldown: 8, range: 12, radius: 2.5, projectileSpeed: 14, slow: 0.4, slowDuration: 3 }),
    ],
  },
  [EnemyType.SENTINELLA_RONDA]: {
    type: EnemyType.SENTINELLA_RONDA,
    hp: 150,
    armor: 5,
    speed: 2.2,
    alertSpeed: 4.2,
    advance: 'melee',
    vision: { radius: 14, arcDeg: 120 },
    attacks: [
      melee({ id: 'allarme', name: 'Allarme di Settore', kind: 'control', damage: 0, windup: 1.5, cooldown: 8, range: 14 }),
      melee({ id: 'bastone', name: 'Colpo di Bastone', kind: 'melee', damage: 8, windup: 0.4, cooldown: 1.6, range: 1.8, arcDeg: 70, knockback: 3 }),
    ],
  },
  [EnemyType.GRANCHIO_PIETRA]: {
    type: EnemyType.GRANCHIO_PIETRA,
    hp: 220,
    armor: 35,
    speed: 3,
    advance: 'melee',
    burrowRadius: 4,
    attacks: [
      melee({ id: 'chela', name: 'Scatto di Chela', kind: 'melee', damage: 16, windup: 0.35, cooldown: 2.4, range: 2.2, arcDeg: 80, dash: 3, interrupt: true }),
    ],
  },
  [EnemyType.UFFICIALE_DAZIO]: {
    type: EnemyType.UFFICIALE_DAZIO,
    hp: 450,
    armor: 25,
    speed: 3.2,
    advance: 'melee',
    attacks: [
      melee({ id: 'lanterna', name: 'Lanterna Cieca', kind: 'control', damage: 0, windup: 1.5, cooldown: 10, range: 10, arcDeg: 60, blind: 2.5 }),
      melee({ id: 'mazzata', name: 'Mazzata Pesante', kind: 'melee', damage: 28, windup: 0.7, cooldown: 3, range: 2.2, arcDeg: 80 }),
    ],
  },
  [EnemyType.GUARDIANO_PIETRA]: {
    type: EnemyType.GUARDIANO_PIETRA,
    hp: 750,
    armor: 50,
    speed: 2.5,
    advance: 'melee',
    attacks: [
      melee({ id: 'pestone', name: 'Pestone Sismico', kind: 'zone', damage: 24, windup: 0.8, cooldown: 6, range: 0, radius: 4, stun: 1.5 }),
    ],
  },
  [EnemyType.ABERRAZIONE_LAGO]: {
    type: EnemyType.ABERRAZIONE_LAGO,
    hp: 200,
    armor: 15,
    speed: 3.6,
    advance: 'ranged',
    preferred: [6, 12],
    burrowRadius: 6,
    attacks: [
      melee({ id: 'sputo', name: 'Sputo Velenoso', kind: 'ranged', damage: 12, windup: 0.5, cooldown: 3.5, range: 14, projectileSpeed: 16, radius: 1.2 }),
    ],
  },
  [EnemyType.MINIBOSS_NOSTROMO]: {
    type: EnemyType.MINIBOSS_NOSTROMO,
    hp: 2200,
    armor: 20,
    speed: 3.2,
    advance: 'melee',
    attacks: [
      melee({ id: 'arpione', name: 'Arpione del Naufrago', kind: 'ranged', damage: 35, windup: 0.7, cooldown: 8, range: 24, projectileSpeed: 28, pull: true }),
      melee({ id: 'spazzata', name: "Spazzata d'Ancora", kind: 'melee', damage: 45, windup: 0.75, cooldown: 5, range: 5, arcDeg: 180, knockback: 6 }),
    ],
  },
  [EnemyType.MINIBOSS_ANCORA]: {
    type: EnemyType.MINIBOSS_ANCORA,
    hp: 3400,
    armor: 25,
    speed: 2.6,
    advance: 'static',
    attacks: [
      melee({ id: 'vortice', name: "Vortice d'Ormeggio", kind: 'zone', damage: 50, windup: 2, cooldown: 12, range: 0, radius: 10, antiZerg: true }),
      melee({ id: 'lancio', name: "Lancio dell'Ancora", kind: 'zone', damage: 40, windup: 0.9, cooldown: 9, range: 16, radius: 3, fissure: 4 }),
    ],
  },
  [EnemyType.MINIBOSS_MADRE]: {
    type: EnemyType.MINIBOSS_MADRE,
    hp: 4800,
    armor: 15,
    speed: 2.2,
    advance: 'static',
    attacks: [
      melee({ id: 'cisti', name: 'Espulsione Cisti', kind: 'zone', damage: 0, windup: 0.6, cooldown: 20, range: 0, radius: 8 }),
      melee({ id: 'boato', name: 'Boato Cavernoso', kind: 'zone', damage: 85, windup: 3, cooldown: 18, range: 0, radius: 400, silence: 3, lethalTell: true }),
    ],
  },
};

export const IDLE_VISION = { radius: 8, arcDeg: 90 } as const;
export const IDLE_HEARING = 6;
export const ALARM_CHANNEL = 1.5;
export const ALARM_RADIUS = 36;

/** Shrine, chest and altar channels from the diorama brief. */
export const POI_CHANNELS = {
  shrineSeconds: 3,
  shrineHealFraction: 0.4,
  chestSeconds: 3,
  altarSeconds: 1.2,
  altarDuration: 120,
  portalSeconds: 0.6,
} as const;

export const MASSEUS_BASE_HP = 18_000;

export interface MasseusAttack {
  id: string;
  name: string;
  damage: number;
  windup: number;
  cooldown: number;
  range: number;
  arcDeg?: number;
  radius?: number;
  antiZerg?: boolean;
  lethalTell?: boolean;
  root?: number;
}

export const MASSEUS_ATTACKS: Record<string, MasseusAttack> = {
  alabarda: { id: 'alabarda', name: 'Spazzata Alabarda', damage: 30, windup: 0.8, cooldown: 4.5, range: 6, arcDeg: 180 },
  reti: { id: 'reti', name: 'Reti da Salagione', damage: 0, windup: 0.6, cooldown: 9, range: 24, root: 3 },
  carica: { id: 'carica', name: 'Carica Inarrestabile', damage: 180, windup: 3, cooldown: 35, range: 64, lethalTell: true },
  pece: { id: 'pece', name: 'Pozze di Pece', damage: 0, windup: 0.4, cooldown: 14, range: 18, radius: 3 },
  vortice: { id: 'vortice', name: "Vortice dell'Annegato", damage: 45, windup: 2, cooldown: 14, range: 0, radius: 10, antiZerg: true },
  fulmine: { id: 'fulmine', name: 'Fulmine Salmastro', damage: 35, windup: 1, cooldown: 2, range: 0, radius: 2.5 },
};

/** Hero pools the damage table is checked against. Squishiest first. */
export const HERO_HP_POOL = [80, 85, 88, 90, 95, 100, 140, 160, 220] as const;

/**
 * Flat armour rating from the bestiary, folded with the familiar 100/(100+armor) curve.
 * The lithic shield is applied before this, and is not the same number.
 */
export function mitigate(raw: number, armor: number): number {
  if (raw <= 0) return 0;
  return raw * (100 / (100 + Math.max(0, armor)));
}

export function profileOf(type: EnemyType): EnemyProfile | undefined {
  if (type === EnemyType.BOSS_MASSEUS) return undefined;
  return ENEMY_PROFILES[type];
}
