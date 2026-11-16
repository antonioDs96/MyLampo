import type { LayoutDef } from './layout';
import type { EnemyTypeId } from './types';

export interface Line {
  who: string;
  text: string;
}

export interface WaveDef {
  /**
   * Enemy type and base count for a solo player.
   * Party size scales copies (and HP / threat) via partyScale — more heroes → more enemies and a harder fight.
   */
  spawns: [EnemyTypeId, number][];
  /** Shown as a tutorial hint when the wave begins. */
  hint?: string;
  say?: Line[];
}

export interface StageDef {
  title: string;
  layout: LayoutDef;
  /** Players keep their positions when this stage replaces the previous one (the map mutates). */
  mutation?: boolean;
  intro?: Line[];
  waves: WaveDef[];
}

export type MissionMode = 'story' | 'boss' | 'arena';

export interface MissionDef {
  id: string;
  order: number;
  name: string;
  region: string;
  place: string;
  brief: string;
  stages: StageDef[];
  victory: Line[];
  /** story = campaign; boss = co-op spectacle fight; arena = last player standing. */
  mode?: MissionMode;
}

export const HUB_LAYOUT: LayoutDef = {
  id: 'taverna_carl',
  name: 'La Taverna di Carl',
  theme: 'tavern',
  rows: [
    '#############',
    '#k.t.....t.b#',
    '#...........#',
    '#..P.P.P.P..#',
    '#.....M.....#',
    '#..P.P.P.P..#',
    '#...........#',
    '#c....f....t#',
    '#...........#',
    '#b...D.D...k#',
    '#############',
  ],
};

const KAZA_1: LayoutDef = {
  id: 'kaza_vicolo',
  name: 'Il Vicolo dei Relitti',
  theme: 'alley',
  rows: [
    '###########',
    '#E...r...E#',
    '#.c.....b.#',
    '#.........#',
    '#....f....#',
    '#.........#',
    '#.b.....c.#',
    '#.P.P.P.P.#',
    '#.P.P.P.P.#',
    '###########',
  ],
};

const KAZA_2: LayoutDef = {
  id: 'kaza_mercato',
  name: 'Il Mercato dei Reietti',
  theme: 'alley',
  rows: [
    '################',
    '#P.P.#....E..#E#',
    '#P.P.#.b.....#.#',
    '#P.P.....##....#',
    '#P.P..c..##..c.#',
    '#....o.......o.#',
    '###..........###',
    '#E...b..##....E#',
    '#.......##..r..#',
    '################',
  ],
};

const KAZA_3: LayoutDef = {
  id: 'kaza_dariol',
  name: 'La Locanda di Dariol',
  theme: 'alley',
  rows: [
    '###############',
    '#E.....E.....E#',
    '#..c.......b..#',
    '#....o...o....#',
    '#......B......#',
    '#....o...o....#',
    '#..b.......c..#',
    '#...P.P.P.P...#',
    '#...P.P.P.P...#',
    '###############',
  ],
};

const CALEM_A: LayoutDef = {
  id: 'calem_sala',
  name: 'La Sala Comune',
  theme: 'inn',
  rows: [
    '#############',
    '#E....k....E#',
    '#..t.....t..#',
    '#...........#',
    '#.P.P...P.P.#',
    '#.....o.....#',
    '#.P.P...P.P.#',
    '#...........#',
    '#..t.....t..#',
    '#E....b....E#',
    '#############',
  ],
};

const CALEM_B: LayoutDef = {
  id: 'calem_stanze',
  name: 'Le Stanze che si Spostano',
  theme: 'inn',
  rows: [
    '#############',
    '#E...#.#...E#',
    '#....#.#....#',
    '#.##.....##.#',
    '#..P.P.P.P..#',
    '###...o...###',
    '#..P.P.P.P..#',
    '#.##.....##.#',
    '#....#.#....#',
    '#E...#.#...E#',
    '#############',
  ],
};

const CALEM_C: LayoutDef = {
  id: 'calem_cripte',
  name: 'I Corridoi delle Cripte',
  theme: 'crypt',
  rows: [
    '#############',
    '#E..#...#..E#',
    '#...#.o.#...#',
    '#..P.P.P.P..#',
    '###.##.##.###',
    '#.....o.....#',
    '###.##.##.###',
    '#..P.P.P.P..#',
    '#...#.o.#...#',
    '#E..#...#..E#',
    '#############',
  ],
};

const CALEM_D: LayoutDef = {
  id: 'calem_eco',
  name: 'La Cripta Inesplorata',
  theme: 'crypt',
  rows: [
    '#############',
    '#E.........E#',
    '#.o.......o.#',
    '#...........#',
    '#...........#',
    '#.....B.....#',
    '#...........#',
    '#..P.P.P.P..#',
    '#.oP.P.P.Po.#',
    '#E.........E#',
    '#############',
  ],
};

const CATTEDRALE_1: LayoutDef = {
  id: 'cattedrale_navata',
  name: 'La Navata Morta',
  theme: 'cathedral',
  rows: [
    '###########',
    '#E...E...E#',
    '#.o.....o.#',
    '#.........#',
    '#.o.....o.#',
    '#.........#',
    '#.o.....o.#',
    '#.........#',
    '#.o.....o.#',
    '#.P.P.P.P.#',
    '#.P.P.P.P.#',
    '###########',
  ],
};

const CATTEDRALE_2: LayoutDef = {
  id: 'cattedrale_altare',
  name: "L'Altare del Sommo Taciturno",
  theme: 'cathedral',
  rows: [
    '###############',
    '#E...........E#',
    '#..o.......o..#',
    '#.............#',
    '#......B......#',
    '#.............#',
    '#.............#',
    '#..o.......o..#',
    '#.............#',
    '#...P.P.P.P...#',
    '#...P.P.P.P...#',
    '###############',
  ],
};

export const MISSIONS: MissionDef[] = [
  {
    id: 'kaza',
    order: 1,
    name: 'I Vicoli di Kaza-Massel',
    region: 'ujian',
    place: 'Kaza-Massel — baraccopoli dei reietti, ai confini di Ujian',
    brief:
      "L'Ordine del Sole Nero rastrella i vicoli di Kaza-Massel in cerca di creature instabili da «purificare». Dariol offre riparo alla Compagnia: bisogna raggiungere la sua locanda.",
    stages: [
      {
        title: 'Il Vicolo dei Relitti',
        layout: KAZA_1,
        intro: [
          { who: 'Carlos', text: "Kaza-Massel. Scafi rovesciati, debiti e pessime decisioni. Vi sentirete a casa." },
          { who: 'Carlos', text: "L'Ordine è qui per «purificare». Tradotto: restate vivi e arrivate da Dariol." },
        ],
        waves: [
          {
            spawns: [['cultista', 4]],
            hint: 'J o clic sinistro: attacco leggero (ripeti per la combo). K o clic destro: attacco pesante, tieni premuto per caricarlo.',
          },
          {
            spawns: [['cultista', 5]],
            hint: 'Bagliore BLU: para con Q poco prima del colpo per una parata perfetta. Bagliore ROSSO: non si para, schiva con SPAZIO.',
          },
          {
            spawns: [
              ['cultista', 4],
              ['creatura', 3],
            ],
            hint: "Le creature instabili esplodono quando cadono: allontanati. Tab aggancia un bersaglio.",
            say: [{ who: 'Carlos', text: 'Quelle non sono dell\'Ordine. Sono ciò che l\'Eclissi fa alla gente di qui. Non restate vicini quando cadono.' }],
          },
        ],
      },
      {
        title: 'Il Mercato dei Reietti',
        layout: KAZA_2,
        intro: [{ who: 'Carlos', text: 'Il mercato. Di solito qui si vende di tutto. Oggi si regalano solo coltellate.' }],
        waves: [
          {
            spawns: [
              ['cultista', 5],
              ['accolito', 2],
            ],
            hint: 'Riempi la barra gialla di un nemico per farlo barcollare, poi premi F per l\'esecuzione.',
          },
          {
            spawns: [
              ['creatura', 5],
              ['accolito', 3],
            ],
            hint: 'E: abilità distintiva. R: suprema, quando la barra è piena.',
          },
          {
            spawns: [
              ['cultista', 6],
              ['creatura', 4],
              ['accolito', 2],
            ],
          },
        ],
      },
      {
        title: 'La Locanda di Dariol',
        layout: KAZA_3,
        intro: [
          { who: 'Carlos', text: "Ecco la locanda. E davanti alla porta, un Inquisitore. Naturalmente." },
          { who: 'Carlos', text: 'Le sue lame rosse non si parano. Schivate, e colpite quando barcolla.' },
        ],
        waves: [
          {
            spawns: [
              ['inquisitore', 1],
              ['cultista', 4],
            ],
          },
          {
            spawns: [
              ['inquisitore', 1],
              ['creatura', 5],
              ['accolito', 3],
            ],
            say: [{ who: 'Carlos', text: 'Un altro. Dariol dovrà farmi uno sconto sul vino.' }],
          },
        ],
      },
    ],
    victory: [
      { who: 'Carlos', text: "Dariol dice che avete un tavolo, un debito in meno e un nemico in più. L'Ordine sa chi siete." },
      { who: 'Carlos', text: 'Tornate alla Taverna. A Mur, Albereth ha sentito qualcosa muoversi sotto la Locanda di Calem.' },
    ],
  },
  {
    id: 'calem',
    order: 2,
    name: 'La Locanda di Calem — Giorno di Caos',
    region: 'mur',
    place: 'Mur — le Porte di Málya',
    brief:
      "Nel Giorno di Caos la Locanda di Calem diventa un dungeon: le stanze si spostano e i corridoi scendono verso cripte inesplorate. Qualcosa, là sotto, ha preso forma.",
    stages: [
      {
        title: 'La Sala Comune',
        layout: CALEM_A,
        intro: [
          { who: 'Carlos', text: "Giorno di Caos. Calem non invecchia e non risponde alle domande: due ottime ragioni per non fidarsi." },
          { who: 'Carlos', text: "Quando le pareti iniziano a muoversi, non discutete con loro." },
        ],
        waves: [
          {
            spawns: [
              ['ombra', 4],
              ['cultista', 3],
            ],
            hint: "Le Ombre colpiscono in fretta e compaiono alle spalle: tieni d'occhio il bagliore rosso.",
          },
          {
            spawns: [
              ['ombra', 5],
              ['tessitrice', 2],
            ],
          },
        ],
      },
      {
        title: 'Le Stanze che si Spostano',
        layout: CALEM_B,
        mutation: true,
        intro: [{ who: 'Carlos', text: 'Ecco. La locanda ha cambiato idea su dove tenere i muri.' }],
        waves: [
          {
            spawns: [
              ['ombra', 5],
              ['tessitrice', 3],
            ],
          },
          {
            spawns: [
              ['ombra', 5],
              ['creatura', 5],
              ['tessitrice', 2],
            ],
          },
        ],
      },
      {
        title: 'I Corridoi delle Cripte',
        layout: CALEM_C,
        mutation: true,
        intro: [{ who: 'Carlos', text: "Cripte. Sotto una locanda. A Mur non buttano via niente, nemmeno i morti." }],
        waves: [
          {
            spawns: [
              ['ombra', 6],
              ['tessitrice', 3],
            ],
          },
          {
            spawns: [
              ['inquisitore', 1],
              ['ombra', 5],
              ['tessitrice', 3],
            ],
            say: [{ who: 'Carlos', text: "Un Inquisitore, quaggiù? L'Ordine cerca la stessa cosa che cerchiamo noi." }],
          },
        ],
      },
      {
        title: 'La Cripta Inesplorata',
        layout: CALEM_D,
        mutation: true,
        intro: [
          { who: 'Carlos', text: "Fermi. Lo sentite? Il caos ha smesso di muoversi. Ha deciso che forma avere." },
        ],
        waves: [
          {
            spawns: [
              ['ombra_maggiore', 1],
              ['ombra', 4],
            ],
          },
        ],
      },
    ],
    victory: [
      { who: 'Carlos', text: "L'Eco si è dissolta e le stanze tornano al loro posto. Calem vi ha visti scendere e non ha detto una parola." },
      { who: 'Carlos', text: "Nella cripta c'era un sigillo di San ä Rica. Kaballor sa del Chiavistello. Toccherà andare a chiederglielo di persona." },
    ],
  },
  {
    id: 'cattedrale',
    order: 3,
    name: 'La Cattedrale Muta',
    region: 'sanarica',
    place: 'San ä Rica — il Regno del Silenzio',
    brief:
      "Nella Cattedrale Muta nessun suono si propaga. Klaus Kaballor, gigante del Silenzio e nemico giurato di Jusef, custodisce ciò che l'Ordine sa sul Chiavistello.",
    stages: [
      {
        title: 'La Navata Morta',
        layout: CATTEDRALE_1,
        intro: [
          { who: 'Carlos', text: 'San ä Rica. Qui il silenzio è legge e il canto è un crimine. Jusef, cerca di non farti giustiziare subito.' },
          { who: 'Carlos', text: "Dentro le cupole nere le vostre abilità tacciono. Uscitene, o restate nella bolla di Gabryel." },
        ],
        waves: [
          {
            spawns: [
              ['cultista', 5],
              ['accolito', 4],
            ],
          },
          {
            spawns: [
              ['inquisitore', 1],
              ['cultista', 5],
              ['accolito', 4],
            ],
          },
          {
            spawns: [
              ['inquisitore', 2],
              ['accolito', 5],
            ],
          },
        ],
      },
      {
        title: "L'Altare del Sommo Taciturno",
        layout: CATTEDRALE_2,
        intro: [
          { who: 'Carlos', text: "Eccolo. Klaus Kaballor. Un uomo che ha fatto del silenzio una religione e che suona un tamburo. Non fateglielo notare." },
          { who: 'Carlos', text: "Le onde del tamburo non si parano: attraversatele schivando. E quando barcolla, non sprecate l'occasione." },
        ],
        waves: [
          {
            spawns: [['klaus', 1]],
          },
        ],
      },
    ],
    victory: [
      { who: 'Carlos', text: "Il tamburo tace. Per la prima volta, in questa cattedrale, qualcuno ha fatto rumore e ha vinto." },
      { who: 'Carlos', text: "Kaballor parlava di una Dea Velata e di un'Eclissi che non è ancora al culmine. Riposate. Il resto del Salento ci aspetta." },
    ],
  },
];

const ARENA_FOSSA: LayoutDef = {
  id: 'arena_fossa',
  name: 'La Fossa di Badiscar',
  theme: 'crypt',
  rows: [
    '###########',
    '#bbbb.bbbb#',
    '#b.P...P.b#',
    '#b.......b#',
    '#b.P...P.b#',
    '#b.......b#',
    '#b.P...P.b#',
    '#b.......b#',
    '#b.P...P.b#',
    '#bbbb.bbbb#',
    '###########',
  ],
};

const ARENA_ANELLO: LayoutDef = {
  id: 'arena_anello',
  name: "L'Anello di Ujian",
  theme: 'alley',
  rows: [
    '#############',
    '#c.........c#',
    '#.P.......P.#',
    '#...........#',
    '#.P.......P.#',
    '#.....o.....#',
    '#.P.......P.#',
    '#...........#',
    '#.P.......P.#',
    '#c.........c#',
    '#############',
  ],
};

const BOSS_TAMBURO: LayoutDef = {
  id: 'boss_tamburo',
  name: 'Arena del Tamburo',
  theme: 'cathedral',
  rows: [
    '#############',
    '#E.........E#',
    '#..o.....o..#',
    '#...........#',
    '#.....B.....#',
    '#...........#',
    '#...........#',
    '#..o.....o..#',
    '#.P.P.P.P.P.#',
    '#.P.P.P.....#',
    '#############',
  ],
};

const BOSS_ECO: LayoutDef = {
  id: 'boss_eco',
  name: "Arena dell'Eco",
  theme: 'crypt',
  rows: [
    '#############',
    '#r.........r#',
    '#...........#',
    '#..o.....o..#',
    '#.....B.....#',
    '#...........#',
    '#..o.....o..#',
    '#...........#',
    '#.P.P.P.P.P.#',
    '#.P.P.P.....#',
    '#############',
  ],
};

const BOSS_SOLE: LayoutDef = {
  id: 'boss_sole',
  name: 'Arena del Sole Nero',
  theme: 'inn',
  rows: [
    '#############',
    '#E.........E#',
    '#..b.....c..#',
    '#...........#',
    '#.....B.....#',
    '#...........#',
    '#..c.....b..#',
    '#...........#',
    '#.P.P.P.P.P.#',
    '#.P.P.P.....#',
    '#############',
  ],
};

/** One-shot boss arenas and last-standing pits, selectable from the council table. */
export const EXTRA_PLAYS: MissionDef[] = [
  {
    id: 'boss_klaus',
    order: 101,
    mode: 'boss',
    name: 'Arena del Tamburo',
    region: 'sanarica',
    place: 'Prove speciali · Klaus Kaballor',
    brief: 'Niente corridoi, niente ondate: solo voi e il Tamburo Sacro. Chi cade resta a terra finché il gigante non tace.',
    stages: [
      {
        title: 'Arena del Tamburo',
        layout: BOSS_TAMBURO,
        intro: [
          { who: 'Carlos', text: 'Niente processione. Niente scuse. Kaballor è già in mezzo al cerchio.' },
          { who: 'Carlos', text: 'Schivate le onde rosse, uscite dal silenzio, e quando barcolla — tutti insieme.' },
        ],
        waves: [{ spawns: [['klaus', 1]] }],
      },
    ],
    victory: [{ who: 'Carlos', text: 'Il tamburo tace. Questa volta non c’era una cattedrale a proteggerlo: solo voi.' }],
  },
  {
    id: 'boss_eco',
    order: 102,
    mode: 'boss',
    name: "Arena dell'Eco",
    region: 'mur',
    place: "Prove speciali · L'Eco di Calem",
    brief: "L'ombra maggiore che Calem ha partorito, rinchiusa in una fossa di pietra. Batterla qui è più onesto che nelle cripte.",
    stages: [
      {
        title: "Arena dell'Eco",
        layout: BOSS_ECO,
        intro: [
          { who: 'Carlos', text: "L'Eco non ha più stanze da spostare. Ha solo voi da spezzare." },
          { who: 'Carlos', text: 'Quando si spezza, non perdete tempo: l’esecuzione è la fine del caos.' },
        ],
        waves: [{ spawns: [['ombra_maggiore', 1], ['ombra', 4]] }],
      },
    ],
    victory: [{ who: 'Carlos', text: 'L’Eco si dissolve. Calem, da qualche parte, ha appena perso un segreto.' }],
  },
  {
    id: 'boss_sole',
    order: 103,
    mode: 'boss',
    name: 'Arena del Sole Nero',
    region: 'ujian',
    place: 'Prove speciali · Inquisitori',
    brief: 'Due Inquisitori nello stesso cerchio. Lame rosse, niente parate: solo schivate e contrattacchi.',
    stages: [
      {
        title: 'Arena del Sole Nero',
        layout: BOSS_SOLE,
        intro: [
          { who: 'Carlos', text: 'Due sole neri. Se ne lasciate uno solo vivo troppo a lungo, vi taglia a metà.' },
        ],
        waves: [{ spawns: [['inquisitore', 2], ['cultista', 4]] }],
      },
    ],
    victory: [{ who: 'Carlos', text: 'L’Ordine ha perso due lame. Buon segno. Cattivo precedent.' }],
  },
  {
    id: 'arena_fossa',
    order: 201,
    mode: 'arena',
    name: 'La Fossa di Badiscar',
    region: 'badiscar',
    place: 'Prove speciali · Ultimo in piedi',
    brief: 'Niente mostri. Solo la Compagnia. Chi cade resta a terra: vince l’ultimo che resta in piedi.',
    stages: [
      {
        title: 'La Fossa di Badiscar',
        layout: ARENA_FOSSA,
        intro: [
          { who: 'Carlos', text: 'Regole della Fossa: niente rianimazioni, niente alleanze. Ultimo in piedi beve gratis. Gli altri pagano il tavolo.' },
        ],
        waves: [],
      },
    ],
    victory: [{ who: 'Carlos', text: 'Uno solo resta. Gli altri, a terra. La taverna ha già acceso le mance.' }],
  },
  {
    id: 'arena_anello',
    order: 202,
    mode: 'arena',
    name: "L'Anello di Ujian",
    region: 'ujian',
    place: 'Prove speciali · Ultimo in piedi',
    brief: 'Cerchio aperto, un pilastro al centro, casse ai bordi. Stesso patto: ultimo in piedi.',
    stages: [
      {
        title: "L'Anello di Ujian",
        layout: ARENA_ANELLO,
        intro: [
          { who: 'Carlos', text: 'Spingeteli contro le casse. O contro il pilastro. O gli uni contro gli altri. Io conto i colpi.' },
        ],
        waves: [],
      },
    ],
    victory: [{ who: 'Carlos', text: 'L’Anello ha scelto. Gli altri possono alzarsi… dopo aver pagato il vino.' }],
  },
];

export function allMissions(): MissionDef[] {
  return [...MISSIONS, ...EXTRA_PLAYS];
}

export function missionById(id: string): MissionDef | undefined {
  return allMissions().find((m) => m.id === id);
}

export function storyMissions(): MissionDef[] {
  return MISSIONS;
}

export function bossPlays(): MissionDef[] {
  return EXTRA_PLAYS.filter((m) => m.mode === 'boss');
}

export function arenaPlays(): MissionDef[] {
  return EXTRA_PLAYS.filter((m) => m.mode === 'arena');
}
