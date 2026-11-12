import type { LayoutDef } from './layout';
import type { EnemyTypeId } from './types';

export interface Line {
  who: string;
  text: string;
}

export interface WaveDef {
  /** Enemy type and base count (for one player). */
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

export interface MissionDef {
  id: string;
  order: number;
  name: string;
  region: string;
  place: string;
  brief: string;
  stages: StageDef[];
  victory: Line[];
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
            spawns: [['cultista', 2]],
            hint: 'Clic sinistro: attacco leggero (ripeti per la combo). Clic destro: attacco pesante, tieni premuto per caricarlo.',
          },
          {
            spawns: [['cultista', 3]],
            hint: 'Bagliore BLU: para con Q poco prima del colpo per una parata perfetta. Bagliore ROSSO: non si para, schiva con SPAZIO.',
          },
          {
            spawns: [
              ['cultista', 2],
              ['creatura', 2],
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
              ['cultista', 3],
              ['accolito', 1],
            ],
            hint: 'Riempi la barra gialla di un nemico per farlo barcollare, poi premi F per l\'esecuzione.',
          },
          {
            spawns: [
              ['creatura', 3],
              ['accolito', 2],
            ],
            hint: 'E: abilità distintiva. R: suprema, quando la barra è piena.',
          },
          {
            spawns: [
              ['cultista', 4],
              ['creatura', 2],
              ['accolito', 1],
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
              ['cultista', 2],
            ],
          },
          {
            spawns: [
              ['inquisitore', 1],
              ['creatura', 3],
              ['accolito', 2],
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
              ['ombra', 2],
              ['cultista', 2],
            ],
            hint: "Le Ombre colpiscono in fretta e compaiono alle spalle: tieni d'occhio il bagliore rosso.",
          },
          {
            spawns: [
              ['ombra', 3],
              ['tessitrice', 1],
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
              ['ombra', 3],
              ['tessitrice', 2],
            ],
          },
          {
            spawns: [
              ['ombra', 3],
              ['creatura', 3],
              ['tessitrice', 1],
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
              ['ombra', 4],
              ['tessitrice', 2],
            ],
          },
          {
            spawns: [
              ['inquisitore', 1],
              ['ombra', 3],
              ['tessitrice', 2],
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
              ['ombra', 2],
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
              ['cultista', 3],
              ['accolito', 2],
            ],
          },
          {
            spawns: [
              ['inquisitore', 1],
              ['cultista', 3],
              ['accolito', 2],
            ],
          },
          {
            spawns: [
              ['inquisitore', 2],
              ['accolito', 3],
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

export function missionById(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}
