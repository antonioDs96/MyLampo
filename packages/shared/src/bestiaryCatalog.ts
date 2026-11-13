/**
 * Fixed bestiary: 24 creatures (5 mob + 2 elite + 1 boss × 3 biomes).
 * Damage modifiers follow SRD 5.2.1 vulnerability / resistance / immunity.
 */
import type { BiomeId } from './proceduralBiomes';
import type { EnemyTypeId } from './types';
import type { DamageType } from './itemsCatalog';

export type DamageKind =
  | DamageType
  | 'tuono'
  | 'fulmine'
  | 'freddo'
  | 'necrotico'
  | 'psichico'
  | 'forza'
  | 'etere'
  | 'physical_front'
  | 'frightened';

export type EnemyGrade = 'mob' | 'elite' | 'boss';

export interface BestiaryEntry {
  id: EnemyTypeId;
  index: number;
  name: string;
  biome: BiomeId;
  grade: EnemyGrade;
  desc: string;
  /** Strategic co-op tip shown in the Tomo. */
  tip: string;
  vulnerability: DamageKind[];
  resistance: DamageKind[];
  immunity: DamageKind[];
  /** Special runtime flags. */
  flags?: {
    petrifyUntilHeavy?: boolean;
    frontalProjectileImmune?: boolean;
    backstabSynergy?: boolean;
    waterSpeedMul?: number;
    packBonus?: boolean;
    regenerateUnless?: DamageKind[];
    ragePhysicalRes?: boolean;
    shatterCombo?: boolean;
  };
}

/** Extended damage types beyond the item catalog (for UI badges). */
export const DAMAGE_KIND_LABELS: Record<string, string> = {
  tagliente: 'Tagliente',
  perforante: 'Perforante',
  contundente: 'Contundente',
  fuoco: 'Fuoco',
  acido: 'Acido',
  radioso: 'Radioso',
  veleno: 'Veleno',
  tuono: 'Tuono',
  fulmine: 'Fulmine',
  freddo: 'Freddo',
  necrotico: 'Necrotico',
  psichico: 'Psichico',
  forza: 'Forza',
  etere: 'Etere',
  physical_front: 'Proiettili frontali',
  frightened: 'Spaventato',
};

export const BESTIARY: BestiaryEntry[] = [
  // —— URBAN ——
  {
    index: 1,
    id: 'coscritto_sole_nero',
    name: 'Coscritto del Sole Nero',
    biome: 'urban',
    grade: 'mob',
    desc: 'Fanatico rastrellatore dei vicoli di Mur. Attacca con Lampo Azzurro.',
    tip: 'Vulnerabile a Perforante e Fuoco — Albereth e Gabryel lo smontano in fretta.',
    vulnerability: ['perforante', 'fuoco'],
    resistance: [],
    immunity: [],
  },
  {
    index: 2,
    id: 'balestriere_tetti',
    name: 'Balestriere dei Tetti',
    biome: 'urban',
    grade: 'mob',
    desc: 'Mira laser con Lampo Rosso dai cornicioni.',
    tip: 'Resiste ai dardi; chiudigli la distanza con Tagliente o Tuono.',
    vulnerability: ['tagliente', 'tuono'],
    resistance: ['perforante'],
    immunity: [],
  },
  {
    index: 3,
    id: 'mastino_guerra',
    name: 'Mastino da Guerra Corazzato',
    biome: 'urban',
    grade: 'mob',
    desc: 'Balzo rapido che rallenta la preda.',
    tip: 'Freddo di Fabyorn o affondi Perforanti: il Contundente rimbalza sulla corazza.',
    vulnerability: ['freddo', 'perforante'],
    resistance: ['contundente'],
    immunity: [],
  },
  {
    index: 4,
    id: 'accolito_silenzio',
    name: 'Accolito del Silenzio',
    biome: 'urban',
    grade: 'mob',
    desc: 'Aura che rallenta la ricarica di [E] e [R].',
    tip: 'Radioso di Gabryel o lame Taglienti; resta nella Bolla di Realtà.',
    vulnerability: ['radioso', 'tagliente'],
    resistance: ['necrotico'],
    immunity: [],
  },
  {
    index: 5,
    id: 'gargoyle_leccese',
    name: 'Gargoyle di Pietra Leccese',
    biome: 'urban',
    grade: 'mob',
    desc: 'Si pietrifica finché non subisce un colpo pesante K.',
    tip: 'Alexios o Fabyorn lo svegliano col K Contundente/Fulmine.',
    vulnerability: ['contundente', 'fulmine'],
    resistance: ['tagliente', 'perforante'],
    immunity: ['veleno'],
    flags: { petrifyUntilHeavy: true },
  },
  {
    index: 6,
    id: 'scudiero_falange',
    name: 'Scudiero Falange',
    biome: 'urban',
    grade: 'elite',
    desc: 'Scudo frontale: immune ai proiettili da davanti.',
    tip: 'Alexios lo provoca con [E]; Albereth colpisce alle spalle. Fulmine lo apre.',
    vulnerability: ['fulmine'],
    resistance: [],
    immunity: ['physical_front'],
    flags: { frontalProjectileImmune: true, backstabSynergy: true },
  },
  {
    index: 7,
    id: 'flagellante_famelico',
    name: 'Flagellante Famelico',
    biome: 'urban',
    grade: 'elite',
    desc: 'Combo Azzurro+Rosso; immune alla paura.',
    tip: "Interrompilo con l'Ocarina d'Osso di Albereth. Radioso e Freddo lo spezzano.",
    vulnerability: ['radioso', 'freddo'],
    resistance: ['fuoco', 'necrotico'],
    immunity: ['frightened'],
  },
  {
    index: 8,
    id: 'vaelen',
    name: 'Alto Inquisitore Vaelen',
    biome: 'urban',
    grade: 'boss',
    desc: 'Pilastri solari e catene di giudizio (Lampo Rosso).',
    tip: 'Bolla di Gabryel neutralizza il giudizio. Necrotico / Perforante alle spalle.',
    vulnerability: ['necrotico', 'perforante'],
    resistance: ['radioso', 'fuoco'],
    immunity: [],
    flags: { backstabSynergy: true },
  },

  // —— COASTAL ——
  {
    index: 9,
    id: 'tagliagole_reietti',
    name: 'Tagliagole dei Reietti',
    biome: 'coastal',
    grade: 'mob',
    desc: 'Aggira alle spalle nei vicoli del porto.',
    tip: 'Contundente e Radioso. Attenzione alle spalle.',
    vulnerability: ['contundente', 'radioso'],
    resistance: ['veleno'],
    immunity: [],
  },
  {
    index: 10,
    id: 'predone_sahuagin',
    name: 'Predone Sahuagin di Otranth',
    biome: 'coastal',
    grade: 'mob',
    desc: 'Velocità doppia nelle pozze d’acqua.',
    tip: 'Tiralo fuori dall’acqua; Fulmine e Perforante.',
    vulnerability: ['fulmine', 'perforante'],
    resistance: ['freddo', 'acido'],
    immunity: [],
    flags: { waterSpeedMul: 2 },
  },
  {
    index: 11,
    id: 'granchio_scogliera',
    name: 'Granchio Corazzato di Scogliera',
    biome: 'coastal',
    grade: 'mob',
    desc: 'Pinzata con Lampo Azzurro.',
    tip: 'Contundente / Fulmine. Tagliente e Perforante scivolano sul guscio.',
    vulnerability: ['contundente', 'fulmine'],
    resistance: ['tagliente', 'perforante'],
    immunity: [],
  },
  {
    index: 12,
    id: 'contrabbandiere_alchemico',
    name: 'Contrabbandiere Alchemico',
    biome: 'coastal',
    grade: 'mob',
    desc: 'Lancia fiale; esplode se colpito con K durante il lancio.',
    tip: 'Interrompi il lancio con K. Vulnerabile a Perforante e Freddo.',
    vulnerability: ['perforante', 'freddo'],
    resistance: ['fuoco'],
    immunity: [],
  },
  {
    index: 13,
    id: 'sciame_polpi',
    name: "Sciame di Polpi d'Ombra",
    biome: 'coastal',
    grade: 'mob',
    desc: 'Riduce la visuale della Compagnia.',
    tip: 'Radioso e Fuoco dissolvono lo sciame.',
    vulnerability: ['radioso', 'fuoco'],
    resistance: ['contundente', 'perforante'],
    immunity: [],
  },
  {
    index: 14,
    id: 'esecutore_kaza',
    name: 'Esecutore dei Sindacati di Kaza-Massel',
    biome: 'coastal',
    grade: 'elite',
    desc: 'Cortine fumogene; si cela nel porto.',
    tip: "Marchio dell'Etereo di Rycard lo rivela. Radioso / Psichico.",
    vulnerability: ['radioso', 'psichico'],
    resistance: ['veleno'],
    immunity: [],
  },
  {
    index: 15,
    id: 'sirena_abisso',
    name: "Sirena dell'Abisso Calcareo",
    biome: 'coastal',
    grade: 'elite',
    desc: 'Canto ipnotico ad area.',
    tip: 'Jusef o Gabryel annullano il canto. Fulmine / Perforante.',
    vulnerability: ['fulmine', 'perforante'],
    resistance: ['freddo'],
    immunity: [],
  },
  {
    index: 16,
    id: 'idra_carsica',
    name: "L'Idra Carsica di Badiscar",
    biome: 'coastal',
    grade: 'boss',
    desc: 'Triplo morso Azzurro-Azzurro-Rosso; rigenera se non bruciata.',
    tip: 'Mantieni Fuoco o Radioso attivi o rigenera ogni secondo.',
    vulnerability: ['fuoco', 'radioso'],
    resistance: ['freddo', 'veleno', 'acido'],
    immunity: [],
    flags: { regenerateUnless: ['fuoco', 'radioso'] },
  },

  // —— WILD ——
  {
    index: 17,
    id: 'lupo_ombra',
    name: "Lupo d'Ombra dell'Eclissi",
    biome: 'wild',
    grade: 'mob',
    desc: 'Bonus danno in branco.',
    tip: 'Isola i lupi. Radioso / Fuoco.',
    vulnerability: ['radioso', 'fuoco'],
    resistance: ['freddo', 'necrotico'],
    immunity: [],
    flags: { packBonus: true },
  },
  {
    index: 18,
    id: 'cespuglio_spine',
    name: 'Cespuglio di Spine Corrotto',
    biome: 'wild',
    grade: 'mob',
    desc: 'Radici con Lampo Rosso sotto i giocatori fermi.',
    tip: 'Non restare fermi. Fuoco / Tagliente.',
    vulnerability: ['fuoco', 'tagliente'],
    resistance: ['perforante', 'contundente'],
    immunity: [],
  },
  {
    index: 19,
    id: 'sciamano_menhir',
    name: 'Sciamano dei Menhir',
    biome: 'wild',
    grade: 'mob',
    desc: 'Attiva i monoliti di silenzio.',
    tip: 'Priorità assoluta. Perforante / Veleno. Bolla di Gabryel.',
    vulnerability: ['perforante', 'veleno'],
    resistance: ['fulmine'],
    immunity: [],
  },
  {
    index: 20,
    id: 'cinghiale_murge',
    name: 'Cinghiale Corazzato delle Murge',
    biome: 'wild',
    grade: 'mob',
    desc: 'Carica Azzurra: 1 Parata Perfetta Q riempie il 100% della Barra Gialla.',
    tip: 'Para la carica con Q. Fulmine / Perforante.',
    vulnerability: ['fulmine', 'perforante'],
    resistance: ['contundente'],
    immunity: [],
  },
  {
    index: 21,
    id: 'fuoco_fatuo',
    name: 'Fuoco Fatuo dei Dolmen',
    biome: 'wild',
    grade: 'mob',
    desc: 'Evade i colpi base finché non viene colpito da [E] o Contrattacco.',
    tip: 'Apri con abilità o Contrattacco, poi Radioso / Forza.',
    vulnerability: ['radioso', 'forza'],
    resistance: [],
    immunity: ['fulmine', 'veleno'],
  },
  {
    index: 22,
    id: 'berserker_jugianel',
    name: 'Berserker Rinnegato di Jugianel',
    biome: 'wild',
    grade: 'elite',
    desc: 'In Ira resiste al fisico; il Gelo di Fabyorn spegne l’Ira.',
    tip: 'Fabyorn [E]/ Gelo → poi tutti. Freddo / Psichico.',
    vulnerability: ['freddo', 'psichico'],
    resistance: [],
    immunity: [],
    flags: { ragePhysicalRes: true },
  },
  {
    index: 23,
    id: 'orsogufo_miner',
    name: 'Orsogufo delle Cripte di Miner-Vin',
    biome: 'wild',
    grade: 'elite',
    desc: 'Urlo respingente ad alto danno postura.',
    tip: 'Schiva l’urlo. Fuoco / Perforante.',
    vulnerability: ['fuoco', 'perforante'],
    resistance: ['freddo'],
    immunity: [],
  },
  {
    index: 24,
    id: 'monolito_vivente',
    name: 'Il Monolito Vivente di Jugianel',
    biome: 'wild',
    grade: 'boss',
    desc: 'Frantumazione: Congelamento Fabyorn + Contundente Alexios → ×4 postura.',
    tip: 'Combo Gelo + pugni di pietra. Contundente / Tuono.',
    vulnerability: ['contundente', 'tuono'],
    resistance: ['tagliente', 'perforante'],
    immunity: ['veleno', 'fuoco'],
    flags: { shatterCombo: true },
  },
];

export const BESTIARY_BY_ID: Record<string, BestiaryEntry> = Object.fromEntries(BESTIARY.map((e) => [e.id, e]));

export function bestiaryByBiome(biome: BiomeId): BestiaryEntry[] {
  return BESTIARY.filter((e) => e.biome === biome);
}

export function mobsForBiome(biome: BiomeId): EnemyTypeId[] {
  return bestiaryByBiome(biome).filter((e) => e.grade === 'mob').map((e) => e.id);
}

export function elitesForBiome(biome: BiomeId): EnemyTypeId[] {
  return bestiaryByBiome(biome).filter((e) => e.grade === 'elite').map((e) => e.id);
}

export function bossForBiome(biome: BiomeId): EnemyTypeId {
  return bestiaryByBiome(biome).find((e) => e.grade === 'boss')!.id;
}

/**
 * SRD damage multiplier: vulnerability ×2, resistance ÷2, immunity 0.
 * Multiple tags stack multiplicatively only once per category.
 */
export function damageMultiplier(entry: BestiaryEntry | undefined, damageType: string, opts?: { fromFront?: boolean; backstab?: boolean }): number {
  if (!entry) return 1;
  const dt = damageType as DamageKind;
  if (entry.immunity.includes(dt)) return 0;
  if (entry.immunity.includes('physical_front') && opts?.fromFront && (dt === 'perforante' || damageType === 'projectile')) return 0;
  let mul = 1;
  if (entry.vulnerability.includes(dt)) mul *= 2;
  // Backstab synergy: treat backstab perforante as vulnerability for flagged foes
  if (opts?.backstab && entry.flags?.backstabSynergy && (dt === 'perforante' || dt === 'tagliente')) mul *= 2;
  if (entry.resistance.includes(dt)) mul *= 0.5;
  if (entry.flags?.ragePhysicalRes && (dt === 'tagliente' || dt === 'perforante' || dt === 'contundente')) mul *= 0.5;
  return mul;
}

/** Semaforo pre-missione: green if weapon damage hits a biome vulnerability. */
export type TrafficLight = 'green' | 'yellow' | 'red';

export function biomeTrafficLight(biome: BiomeId, weaponDamageTypes: string[]): TrafficLight {
  const vulns = new Set(bestiaryByBiome(biome).flatMap((e) => e.vulnerability.map(String)));
  const resists = new Set(bestiaryByBiome(biome).flatMap((e) => e.resistance.map(String)));
  let hits = 0;
  let blocked = 0;
  for (const d of weaponDamageTypes) {
    if (vulns.has(d)) hits++;
    if (resists.has(d)) blocked++;
  }
  if (hits > 0) return 'green';
  if (blocked > 0 && hits === 0) return 'red';
  return 'yellow';
}
