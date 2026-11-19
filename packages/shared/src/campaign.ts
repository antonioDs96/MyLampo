/**
 * The fixed geography of the game.
 *   Region -> City -> three consecutive Environments -> City Boss.
 * The beta is frozen on Regione 1, la Costa Est. Later regions open only by
 * defeating the Region Boss, and are listed here as locked destinations.
 */
import { type NodeSpan } from './chunks';
import { type LevelId } from './levels/LevelDataTypes';
import { loadLevel } from './levels/LevelLoader';
import { bakeDiorama } from './levels/toLayout';
import type { Biome, LayoutDef, Roster, Theme } from './layout';
import type { EnemyTypeId } from './types';

export type CityId = 'badiscar' | 'ujian' | 'kaza';
/** Badiscar opens the coast. Kaza-Massel follows its boss, then Ujian. */
export const CITY_IDS: CityId[] = ['badiscar', 'kaza', 'ujian'];

/** A city is open when every city before it on the coast has fallen. */
export function cityUnlocked(cleared: readonly string[], city: CityId): boolean {
  const at = CITY_IDS.indexOf(city);
  if (at <= 0) return true;
  return cleared.includes(CITY_IDS[at - 1]!);
}

/** Environments in a City. After the third comes the City Boss arena. */
export const ENVIRONMENTS_PER_CITY = 3;
/** Stage index of the City Boss arena inside a City run. */
export const CITY_BOSS_STAGE = ENVIRONMENTS_PER_CITY;

export interface EnvironmentDef {
  id: string;
  city: CityId;
  /** 0, 1 or 2. */
  index: number;
  name: string;
  blurb: string;
  miniBoss: EnemyTypeId;
  layout: LayoutDef;
  nodes: NodeSpan[];
}

export interface BossArenaDef {
  id: string;
  name: string;
  blurb: string;
  boss: EnemyTypeId;
  layout: LayoutDef;
}

export interface CityDef {
  id: CityId;
  name: string;
  subtitle: string;
  blurb: string;
  color: string;
  environments: EnvironmentDef[];
  boss: BossArenaDef;
}

function diorama(
  city: CityId,
  index: number,
  spec: {
    id: string;
    name: string;
    blurb: string;
    theme: Theme;
    biome: Biome;
    level: LevelId;
    roster: { mobs: EnemyTypeId[]; elites: EnemyTypeId[]; boss: EnemyTypeId };
  },
): EnvironmentDef {
  const baked = bakeDiorama(loadLevel(spec.level));
  const roster: Roster = spec.roster;
  return {
    id: spec.id,
    city,
    index,
    name: spec.name,
    blurb: spec.blurb,
    miniBoss: spec.roster.boss,
    nodes: baked.nodes,
    layout: {
      id: spec.id,
      name: spec.name,
      theme: spec.theme,
      biome: spec.biome,
      rows: baked.rows,
      roster,
      nodes: baked.nodes,
      sealedVoid: true,
      gates: baked.gates,
    },
  };
}

function arena(
  id: string,
  name: string,
  blurb: string,
  boss: EnemyTypeId,
  theme: Theme,
  biome: Biome,
  rows: string[],
): BossArenaDef {
  return { id, name, blurb, boss, layout: { id, name, theme, biome, rows, roster: { mobs: [], elites: [], boss } } };
}

/** City Boss arenas authored as dioramas: the boss stands, the doors summon, the sea is sealed. */
function dioramaArena(
  id: string,
  name: string,
  blurb: string,
  boss: EnemyTypeId,
  theme: Theme,
  biome: Biome,
  level: LevelId,
  adds: EnemyTypeId[] = [],
): BossArenaDef {
  const baked = bakeDiorama(loadLevel(level), true);
  return {
    id,
    name,
    blurb,
    boss,
    layout: {
      id,
      name,
      theme,
      biome,
      rows: baked.rows,
      roster: { mobs: adds, elites: [], boss },
      sealedVoid: true,
    },
  };
}

// ---------------------------------------------------------------------------- Badiscar

const BADISCAR: CityDef = {
  id: 'badiscar',
  name: 'Badiscar',
  subtitle: 'Le Terre Libere',
  blurb: 'Porto di contrabbandieri a picco sulle scogliere. La marea ha restituito la sua ciurma peggiore.',
  color: '#0ea5e9',
  environments: [
    diorama('badiscar', 0, {
      id: 'badiscar_porto',
      name: 'Il Porto Marcescente',
      blurb: 'Quattro vasche di salagione, il mercato sul molo e il bastione del dazio. Il mare chiude la mappa: non si cammina.',
      theme: 'alley',
      biome: 'coastal',
      level: 'porto',
      roster: {
        mobs: ['corsaro_annegato', 'predone_sahuagin', 'granchio_pietra', 'sciame_polpi'],
        elites: ['nostromo_senzocchi', 'nostromo_senzocchi'],
        boss: 'quartiermastro',
      },
    }),
    diorama('badiscar', 1, {
      id: 'badiscar_falesie',
      name: 'Le Falesie Erose',
      blurb: 'Approdo sulla scogliera, conca sotto il piano e la gola a est. La Chela Madre chiude la cava.',
      theme: 'alley',
      biome: 'coastal',
      level: 'falesie',
      roster: {
        mobs: ['corsaro_annegato', 'predone_sahuagin', 'granchio_pietra', 'sciame_polpi'],
        elites: ['nostromo_senzocchi', 'nostromo_senzocchi'],
        boss: 'chela_madre',
      },
    }),
    diorama('badiscar', 2, {
      id: 'badiscar_grotte',
      name: 'Le Grotte Carsiche',
      blurb: 'Lago di melma, ponti di calcite e l’altare in fondo. Il Palombaro Cieco aspetta oltre il lago.',
      theme: 'crypt',
      biome: 'coastal',
      level: 'grotte',
      roster: {
        mobs: ['corsaro_annegato', 'predone_sahuagin', 'granchio_pietra', 'sciame_polpi'],
        elites: ['nostromo_senzocchi', 'madre_spore'],
        boss: 'palombaro',
      },
    }),
  ],
  boss: dioramaArena(
    'badiscar_boss',
    'Il Bastione di Masseus',
    'Arena quadrata sul mare, quattro colonne e il corsaro che le usa come freno. Dopo di lui si apre Kaza-Massel.',
    'masseus',
    'crypt',
    'coastal',
    'masseus',
  ),
};

// ---------------------------------------------------------------------------- Ujian

const UJIAN: CityDef = {
  id: 'ujian',
  name: 'Ujian',
  subtitle: "La Città sull'Altopiano",
  blurb: "Calcare antico e magia sorvegliata. L'acqua è salita fino ai giardini e alla biblioteca.",
  color: '#a855f7',
  environments: [
    diorama('ujian', 0, {
      id: 'ujian_ponte',
      name: 'Il Ponte delle Sirene',
      blurb: 'Viadotto sospeso sull’abisso. Chi non paga il dazio lo paga comunque.',
      theme: 'alley',
      biome: 'urban',
      level: 'ujian_ponte',
      roster: {
        mobs: ['corsaro_annegato', 'contrabbandiere_alchemico', 'predone_sahuagin', 'corsaro_annegato'],
        elites: ['sirena_abisso', 'nostromo_senzocchi'],
        boss: 'esattore_maree',
      },
    }),
    diorama('ujian', 1, {
      id: 'ujian_terrazze',
      name: 'Le Terrazze del Sale',
      blurb: 'Terrazze fiorite sotto un velo di spore. Respirate poco e non fermatevi.',
      theme: 'cathedral',
      biome: 'wild',
      level: 'ujian_terrazze',
      roster: {
        mobs: ['sciame_polpi', 'granchio_pietra', 'contrabbandiere_alchemico', 'sciame_polpi'],
        elites: ['madre_spore', 'sirena_abisso'],
        boss: 'matriarca_spore',
      },
    }),
    diorama('ujian', 2, {
      id: 'ujian_tempio',
      name: 'Il Tempio Sommerso',
      blurb: 'Scaffali sommersi e una voce che spegne le formule in gola.',
      theme: 'cathedral',
      biome: 'urban',
      level: 'ujian_tempio',
      roster: {
        mobs: ['corsaro_annegato', 'sciame_polpi', 'contrabbandiere_alchemico', 'granchio_pietra'],
        elites: ['sirena_abisso', 'madre_spore'],
        boss: 'cantrice_abissale',
      },
    }),
  ],
  boss: dioramaArena(
    'ujian_boss',
    "L'Aula dell'Arconte",
    "La sala del consiglio, sott'acqua da anni. L'Arconte presiede ancora.",
    'arconte_ujian',
    'cathedral',
    'urban',
    'ujian_soglia',
  ),
};

// ---------------------------------------------------------------------------- Kaza-Massel

const KAZA: CityDef = {
  id: 'kaza',
  name: 'Kaza-Massel',
  subtitle: 'La Baraccopoli dei Reietti',
  blurb: 'Nessuno comanda, tutti riscuotono. La magia selvaggia scorre nei canali di scolo.',
  color: '#f97316',
  environments: [
    diorama('kaza', 0, {
      id: 'kaza_canali',
      name: 'I Canali della Dogana Vecchia',
      blurb: 'Chiuse gemelle, loggia del contrabbando e il molo nord-est. Guardatevi le spalle.',
      theme: 'alley',
      biome: 'urban',
      level: 'kaza_canali',
      roster: {
        mobs: ['tagliagole_reietti', 'contrabbandiere_alchemico', 'tagliagole_reietti', 'corsaro_annegato'],
        elites: ['esecutore_kaza', 'nostromo_senzocchi'],
        boss: 'capo_sindacato',
      },
    }),
    diorama('kaza', 1, {
      id: 'kaza_saline',
      name: 'Le Saline Sommerse',
      blurb: "Vasche di evaporazione e diga di sale. L'etere cola nei canali e ciò che ci vive non ha più un nome.",
      theme: 'crypt',
      biome: 'urban',
      level: 'kaza_saline',
      roster: {
        mobs: ['granchio_pietra', 'contrabbandiere_alchemico', 'sciame_polpi', 'tagliagole_reietti'],
        elites: ['madre_spore', 'esecutore_kaza'],
        boss: 'alchimista_folle',
      },
    }),
    diorama('kaza', 2, {
      id: 'kaza_cittadella',
      name: 'La Cittadella di Kaza',
      blurb: 'Bastione d’assedio e sala d’armi. Il Campione non ha mai perso.',
      theme: 'inn',
      biome: 'urban',
      level: 'kaza_cittadella',
      roster: {
        mobs: ['tagliagole_reietti', 'predone_sahuagin', 'corsaro_annegato', 'tagliagole_reietti'],
        elites: ['esecutore_kaza', 'sirena_abisso'],
        boss: 'campione_fossa',
      },
    }),
  ],
  boss: dioramaArena(
    'kaza_boss',
    'Il Molo del Velo',
    'Laguna di nebbie e due fari. Il Re dei Reietti vi aspetta in piedi.',
    're_reietti',
    'inn',
    'urban',
    'kaza_molo',
  ),
};

export const CITIES: Record<CityId, CityDef> = { badiscar: BADISCAR, ujian: UJIAN, kaza: KAZA };

// ---------------------------------------------------------------------------- Region

export interface RegionDef {
  id: string;
  name: string;
  subtitle: string;
  blurb: string;
  cities: CityId[];
  boss: BossArenaDef;
}

export const REGION: RegionDef = {
  id: 'costa_est',
  name: 'Costa Est',
  subtitle: 'Regione 1',
  blurb: 'Badiscar, poi Kaza-Massel, poi Ujian. Ogni città è tre ambienti e il suo boss: la successiva resta chiusa finché quello non cade.',
  cities: CITY_IDS,
  boss: arena(
    'costa_est_boss',
    "L'Abisso di Badiscar",
    "A ogni fase l'acqua tossica sale di un piano. Restano le piattaforme: non salite tutti sulla stessa.",
    'leviatano',
    'crypt',
    'coastal',
    [
      '###########################',
      '###########PPPPP###########',
      '##########.PPPP..##########',
      '####...................####',
      '###..^^^....._.....^^^..###',
      '##..^+++^...___...^+++^..##',
      '##..^+++^.._____..^+++^..##',
      '#E...^^^..__.^.__..^^^...E#',
      '#...^^^^^__.^B^.__^^^^^...#',
      '#E...^^^..__.^.__..^^^...E#',
      '##..^+++^.._____..^+++^..##',
      '##..^+++^...___...^+++^..##',
      '###..^^^....._.....^^^..###',
      '####...................####',
      '###########################',
    ],
  ),
};

/** Destinations shown on the Map Table but sealed until the Region Boss falls. */
export const LOCKED_REGIONS: { id: string; name: string; blurb: string }[] = [
  { id: 'terre_rosse', name: 'Le Terre Rosse', blurb: 'Regione 2 — sigillata. Si apre abbattendo il Leviatano di Badiscar.' },
  { id: 'regno_silenzio', name: 'Il Regno del Silenzio', blurb: 'Regione 3 — sigillata.' },
];

// ---------------------------------------------------------------------------- Hub

/** La Taverna di Carl: the only safe place. A Carl, I Iej, Y Saraya, L Eleonora, M the Map Table. */
export const HUB_LAYOUT: LayoutDef = {
  id: 'taverna',
  name: 'La Taverna di Carl',
  theme: 'tavern',
  biome: 'urban',
  rows: [
    '###############',
    '#k.A.t...t.b.k#',
    '#.............#',
    '#I...........Y#',
    '#..P.P.P.P.P..#',
    '#......M......#',
    '#..P.P.P.P....#',
    '#L............#',
    '#c....f.....t.#',
    '#.............#',
    '#b...D...D...k#',
    '###############',
  ],
};

// ---------------------------------------------------------------------------- Stages

/** Where a run is: an Environment of a City, a City Boss arena, or the Region Boss. */
export type Stage =
  | { kind: 'env'; city: CityId; index: number }
  | { kind: 'cityBoss'; city: CityId }
  | { kind: 'regionBoss' };

export function stageOf(city: CityId, index: number): Stage {
  return index >= CITY_BOSS_STAGE ? { kind: 'cityBoss', city } : { kind: 'env', city, index: Math.max(0, index) };
}

/** Position inside a City run: 0..2 for the Environments, 3 for the City Boss. */
export function stageIndex(stage: Stage): number {
  return stage.kind === 'env' ? stage.index : stage.kind === 'cityBoss' ? CITY_BOSS_STAGE : 0;
}

export function stageLayout(stage: Stage): LayoutDef {
  if (stage.kind === 'regionBoss') return REGION.boss.layout;
  const city = CITIES[stage.city];
  return stage.kind === 'cityBoss' ? city.boss.layout : city.environments[stage.index]!.layout;
}

export function stageName(stage: Stage): string {
  if (stage.kind === 'regionBoss') return REGION.boss.name;
  const city = CITIES[stage.city];
  return stage.kind === 'cityBoss' ? city.boss.name : city.environments[stage.index]!.name;
}

export function stageBlurb(stage: Stage): string {
  if (stage.kind === 'regionBoss') return REGION.boss.blurb;
  const city = CITIES[stage.city];
  return stage.kind === 'cityBoss' ? city.boss.blurb : city.environments[stage.index]!.blurb;
}

/** "Badiscar · Ambiente 2 di 3" */
export function stageLabel(stage: Stage): string {
  if (stage.kind === 'regionBoss') return `${REGION.name} · Boss di Regione`;
  const city = CITIES[stage.city];
  return stage.kind === 'cityBoss'
    ? `${city.name} · Boss di Città`
    : `${city.name} · Ambiente ${stage.index + 1} di ${ENVIRONMENTS_PER_CITY}`;
}

export function isCityId(v: unknown): v is CityId {
  return typeof v === 'string' && (CITY_IDS as string[]).includes(v);
}

/** Every fixed map of the game, for tests and tools. */
export function allStageLayouts(): LayoutDef[] {
  const out: LayoutDef[] = [HUB_LAYOUT];
  for (const id of CITY_IDS) {
    for (const env of CITIES[id].environments) out.push(env.layout);
    out.push(CITIES[id].boss.layout);
  }
  out.push(REGION.boss.layout);
  return out;
}

export function layoutDefById(id: string): LayoutDef | undefined {
  return allStageLayouts().find((l) => l.id === id);
}
