/**
 * The fixed geography of the game.
 *   Region -> City -> three consecutive Environments -> City Boss.
 * The beta is frozen on Regione 1, la Costa Est. Later regions open only by
 * defeating the Region Boss, and are listed here as locked destinations.
 */
import { assemble, type NodeSpan } from './chunks';
import type { Biome, LayoutDef, Roster, Theme } from './layout';
import type { EnemyTypeId } from './types';

export type CityId = 'badiscar' | 'ujian' | 'kaza';
export const CITY_IDS: CityId[] = ['badiscar', 'ujian', 'kaza'];

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

interface EnvSpec {
  id: string;
  name: string;
  blurb: string;
  theme: Theme;
  biome: Biome;
  chunks: string[];
  roster: { mobs: EnemyTypeId[]; elites: EnemyTypeId[]; boss: EnemyTypeId };
}

function environment(city: CityId, index: number, spec: EnvSpec): EnvironmentDef {
  const built = assemble(spec.chunks);
  const roster: Roster = spec.roster;
  return {
    id: spec.id,
    city,
    index,
    name: spec.name,
    blurb: spec.blurb,
    miniBoss: spec.roster.boss,
    nodes: built.nodes,
    layout: {
      id: spec.id,
      name: spec.name,
      theme: spec.theme,
      biome: spec.biome,
      rows: built.rows,
      roster,
      nodes: built.nodes,
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

// ---------------------------------------------------------------------------- Badiscar

const BADISCAR: CityDef = {
  id: 'badiscar',
  name: 'Badiscar',
  subtitle: 'Le Terre Libere',
  blurb: 'Porto di contrabbandieri a picco sulle scogliere. La marea ha restituito la sua ciurma peggiore.',
  color: '#0ea5e9',
  environments: [
    environment('badiscar', 0, {
      id: 'badiscar_porto',
      name: 'Il Porto Marcescente',
      blurb: 'Moli sfondati e sartiame marcio. I Corsari Annegati tengono ancora il loro posto in falange.',
      theme: 'alley',
      biome: 'coastal',
      chunks: ['molo', 'ponte_rotto', 'bivio_scala', 'assedio_bastioni', 'arena_tonda'],
      roster: {
        mobs: ['corsaro_annegato', 'predone_sahuagin', 'corsaro_annegato', 'contrabbandiere_alchemico'],
        elites: ['nostromo_senzocchi', 'madre_spore'],
        boss: 'quartiermastro',
      },
    }),
    environment('badiscar', 1, {
      id: 'badiscar_falesie',
      name: 'Le Falesie Erose',
      blurb: 'Cenge strette sul mare e canali di risacca. Ciò che sembra roccia, a volte, ha le chele.',
      theme: 'alley',
      biome: 'coastal',
      chunks: ['cancello', 'canale', 'bivio_torre~', 'assedio_terrazze', 'arena_canali'],
      roster: {
        mobs: ['granchio_pietra', 'predone_sahuagin', 'granchio_pietra', 'sciame_polpi'],
        elites: ['nostromo_senzocchi', 'sirena_abisso'],
        boss: 'chela_madre',
      },
    }),
    environment('badiscar', 2, {
      id: 'badiscar_grotte',
      name: 'Le Grotte della Risacca',
      blurb: 'Sotto il porto la roccia è cava. Una campana di bronzo batte il tempo nel buio.',
      theme: 'crypt',
      biome: 'coastal',
      chunks: ['molo~', 'vicolo_salita', 'bivio_tetti', 'assedio_fossa~', 'arena_palchi'],
      roster: {
        mobs: ['sciame_polpi', 'granchio_pietra', 'corsaro_annegato', 'predone_sahuagin'],
        elites: ['madre_spore', 'nostromo_senzocchi'],
        boss: 'palombaro',
      },
    }),
  ],
  boss: arena(
    'badiscar_boss',
    "La Tana dell'Idra",
    'La grotta più profonda di Badiscar. Tre teste aspettano nella vasca.',
    'idra_carsica',
    'crypt',
    'coastal',
    [
      '#######################',
      '########.PPPPP.########',
      '#######..PPPP...#######',
      '#####.............#####',
      '###..^^.........^^..###',
      '##..^++^..___..^++^..##',
      '##..^^^.._____..^^^..##',
      '#E......___B___......E#',
      '##..^^^.._____..^^^..##',
      '##..^++^..___..^++^..##',
      '###..^^.........^^..###',
      '#####......E......#####',
      '#######################',
    ],
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
    environment('ujian', 0, {
      id: 'ujian_moli',
      name: 'I Moli dei Mercanti',
      blurb: 'Le banchine dei Pesatori. Chi non paga il dazio lo paga comunque.',
      theme: 'alley',
      biome: 'urban',
      chunks: ['cancello', 'piazza_fontana', 'bivio_torre', 'assedio_bastioni~', 'arena_tonda'],
      roster: {
        mobs: ['corsaro_annegato', 'contrabbandiere_alchemico', 'predone_sahuagin', 'corsaro_annegato'],
        elites: ['sirena_abisso', 'nostromo_senzocchi'],
        boss: 'esattore_maree',
      },
    }),
    environment('ujian', 1, {
      id: 'ujian_giardini',
      name: 'I Giardini Pensili Sommersi',
      blurb: 'Terrazze fiorite sotto un velo di spore. Respirate poco e non fermatevi.',
      theme: 'cathedral',
      biome: 'wild',
      chunks: ['molo', 'vicolo_salita~', 'bivio_scala~', 'assedio_terrazze~', 'arena_canali'],
      roster: {
        mobs: ['sciame_polpi', 'granchio_pietra', 'contrabbandiere_alchemico', 'sciame_polpi'],
        elites: ['madre_spore', 'sirena_abisso'],
        boss: 'matriarca_spore',
      },
    }),
    environment('ujian', 2, {
      id: 'ujian_biblioteca',
      name: 'La Biblioteca Allagata',
      blurb: 'Scaffali sommersi e una voce che spegne le formule in gola.',
      theme: 'cathedral',
      biome: 'urban',
      chunks: ['cancello~', 'canale~', 'bivio_tetti~', 'assedio_fossa', 'arena_palchi'],
      roster: {
        mobs: ['corsaro_annegato', 'sciame_polpi', 'contrabbandiere_alchemico', 'granchio_pietra'],
        elites: ['sirena_abisso', 'madre_spore'],
        boss: 'cantrice_abissale',
      },
    }),
  ],
  boss: arena(
    'ujian_boss',
    "L'Aula dell'Arconte",
    "La sala del consiglio, sott'acqua da anni. L'Arconte presiede ancora.",
    'arconte_ujian',
    'cathedral',
    'urban',
    [
      '#######################',
      '#########PPPPP#########',
      '########.PPPP..########',
      '####...............####',
      '###..o...........o..###',
      '#E...................E#',
      '###......^^^^^......###',
      '###..o...^^B^^...o..###',
      '###......^^^^^......###',
      '#E...................E#',
      '###..o...........o..###',
      '####...............####',
      '#######################',
    ],
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
    environment('kaza', 0, {
      id: 'kaza_bassifondi',
      name: 'I Bassifondi del Sindacato',
      blurb: 'Vicoli che cambiano padrone ogni notte. Guardatevi le spalle, letteralmente.',
      theme: 'alley',
      biome: 'urban',
      chunks: ['molo', 'vicolo_salita', 'bivio_tetti', 'assedio_bastioni', 'arena_tonda'],
      roster: {
        mobs: ['tagliagole_reietti', 'contrabbandiere_alchemico', 'tagliagole_reietti', 'corsaro_annegato'],
        elites: ['esecutore_kaza', 'nostromo_senzocchi'],
        boss: 'capo_sindacato',
      },
    }),
    environment('kaza', 1, {
      id: 'kaza_canali',
      name: 'I Canali della Magia Selvaggia',
      blurb: "L'etere cola nei canali e ciò che ci vive dentro non ha più un nome.",
      theme: 'crypt',
      biome: 'urban',
      chunks: ['cancello', 'canale', 'bivio_scala', 'assedio_fossa~', 'arena_canali'],
      roster: {
        mobs: ['granchio_pietra', 'contrabbandiere_alchemico', 'sciame_polpi', 'tagliagole_reietti'],
        elites: ['madre_spore', 'esecutore_kaza'],
        boss: 'alchimista_folle',
      },
    }),
    environment('kaza', 2, {
      id: 'kaza_arena',
      name: "L'Arena dei Reietti",
      blurb: 'La fossa dove Kaza-Massel regola i conti. Il Campione non ha mai perso.',
      theme: 'inn',
      biome: 'urban',
      chunks: ['molo~', 'ponte_rotto~', 'bivio_torre~', 'assedio_terrazze~', 'arena_palchi'],
      roster: {
        mobs: ['tagliagole_reietti', 'predone_sahuagin', 'corsaro_annegato', 'tagliagole_reietti'],
        elites: ['esecutore_kaza', 'sirena_abisso'],
        boss: 'campione_fossa',
      },
    }),
  ],
  boss: arena(
    'kaza_boss',
    'Il Trono di Rottami',
    'Un regno fatto di relitti e di etere. Il Re dei Reietti vi aspetta in piedi.',
    're_reietti',
    'inn',
    'urban',
    [
      '#######################',
      '#########PPPPP#########',
      '########.PPPP..########',
      '###.................###',
      '##..__...........__..##',
      '#E.._=...........=_..E#',
      '##..__...........__..##',
      '#..........B..........#',
      '##..__...........__..##',
      '#E.._=...........=_..E#',
      '##..__...........__..##',
      '###.................###',
      '#######################',
    ],
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
  blurb: 'Badiscar, Ujian e Kaza-Massel: tre città strette tra le scogliere e ciò che sale dal mare.',
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
