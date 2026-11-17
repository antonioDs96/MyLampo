/**
 * Micro-chunks: hand-authored prefabs that every Environment is assembled from.
 * There is no procedural generation at runtime: the same list of chunks always
 * produces the same diorama, for every player, on every run.
 *
 * All chunks are CHUNK_W cells wide and connect through a three-cell door in the
 * middle of their first and last row, at elevation 0. See LayoutDef for the legend.
 */
export const CHUNK_W = 19;

/** The five tension nodes of an Environment, in order. */
export type NodeKind = 'approdo' | 'ingaggio' | 'bivio' | 'assedio' | 'miniboss';

export const NODE_NAMES: Record<NodeKind, string> = {
  approdo: "L'Approdo",
  ingaggio: "Arena d'Ingaggio",
  bivio: 'Bivio Tattico',
  assedio: "Arena d'Assedio",
  miniboss: 'Arena del Mini-Boss',
};

export const NODE_ORDER: NodeKind[] = ['approdo', 'ingaggio', 'bivio', 'assedio', 'miniboss'];

export interface Chunk {
  id: string;
  node: NodeKind;
  name: string;
  rows: string[];
}

const DEFS: Chunk[] = [
  // ------------------------------------------------------------------ L'Approdo: safe, flat, empty
  {
    id: 'molo',
    node: 'approdo',
    name: 'Il Molo',
    rows: [
      '###################',
      '######.......######',
      '#####..P.P.P..#####',
      '#####.P.P.P.P.#####',
      '#####..P...P..#####',
      '######...f...######',
      '#######.....#######',
      '########...########',
    ],
  },
  {
    id: 'cancello',
    node: 'approdo',
    name: 'Il Cancello',
    rows: [
      '###################',
      '####...........####',
      '####.P.P.P.P.P.####',
      '####...........####',
      '####.P.P.P.P.b.####',
      '#####....f....#####',
      '#######.....#######',
      '########...########',
    ],
  },

  // ------------------------------------------------------------------ Arena d'Ingaggio: choke points
  {
    id: 'vicolo_salita',
    node: 'ingaggio',
    name: 'Vicolo in Salita',
    rows: [
      '########...########',
      '#######.....#######',
      '#######.1.s.#######',
      '########.^.########',
      '########^^^########',
      '#######^2^4^#######',
      '#######^^^3^#######',
      '######s^^^^^s######',
      '########.^.########',
      '########...########',
    ],
  },
  {
    id: 'ponte_rotto',
    node: 'ingaggio',
    name: 'Ponte in Rovina',
    rows: [
      '########...########',
      '#####.........#####',
      '#####.s1...2s.#####',
      '#====##...##====###',
      '#=====#.r.#=====###',
      '#=====#...#=====###',
      '#====##.3.##====###',
      '#####.s..4..s.#####',
      '########...########',
    ],
  },
  {
    id: 'piazza_fontana',
    node: 'ingaggio',
    name: 'Piazza della Fontana',
    rows: [
      '########...########',
      '####...........####',
      '###..1.......2..###',
      '###.s.._____..s.###',
      '###...._.o._....###',
      '###.s.._____..s.###',
      '###..3.......4..###',
      '####...........####',
      '########...########',
    ],
  },
  {
    id: 'canale',
    node: 'ingaggio',
    name: 'Il Canale',
    rows: [
      '########...########',
      '######.......######',
      '#####..1...s.######',
      '####..___.___..####',
      '####._3_____2_.####',
      '####..___.___..####',
      '#####.s...4..######',
      '######...s...######',
      '########...########',
    ],
  },

  // ------------------------------------------------------------------ Bivio Tattico: safe-and-poor or steep-and-rich
  {
    id: 'bivio_scala',
    node: 'bivio',
    name: 'La Scalinata',
    rows: [
      '########...########',
      '###.............###',
      '###....#####.^..###',
      '##.....#####.^^.###',
      '##..1..#####^^2^###',
      '##.....####^^+++###',
      '##.s...####^+7+C###',
      '##..b..####^+++####',
      '##.....#####^^3s###',
      '##..s..#####.^..###',
      '###....#####....###',
      '###.............###',
      '########...########',
    ],
  },
  {
    id: 'bivio_torre',
    node: 'bivio',
    name: 'La Torre di Guardia',
    rows: [
      '########...########',
      '##...............##',
      '##.1....###..^^^.##',
      '##......###.^^+^.##',
      '##.s....###.^+8+.##',
      '##..c...###.^+C+.##',
      '##......###.^^+^.##',
      '##.s....###.s3^2.##',
      '##...............##',
      '########...########',
    ],
  },
  {
    id: 'bivio_tetti',
    node: 'bivio',
    name: 'I Tetti',
    rows: [
      '########...########',
      '###.............###',
      '###.2..####.....###',
      '###....####^^^^.###',
      '###.s..####^++^.###',
      '###.b..####+7C+.###',
      '###....####^++^.###',
      '###.s..####^3^^s###',
      '###...........1.###',
      '########...########',
    ],
  },

  // ------------------------------------------------------------------ Arena d'Assedio: the shrine basin, overlooked from every rim
  {
    id: 'assedio_bastioni',
    node: 'assedio',
    name: 'I Bastioni',
    rows: [
      '########...########',
      '##...............##',
      '#..^^^^.....^^^^..#',
      '#..^1+^.....^+2^..#',
      '#..^^^^.___.^^^^..#',
      '#.s...._____....s.#',
      '#....._______.....#',
      '#.s..____S____..s.#',
      '#....._______.....#',
      '#.s...._____....s.#',
      '#..^^^^.___.^^^^..#',
      '#..^3+^.....^+8^..#',
      '#..^^^^.....^^^^..#',
      '##.....1.4.2.....##',
      '########...########',
    ],
  },
  {
    id: 'assedio_terrazze',
    node: 'assedio',
    name: 'Le Terrazze',
    rows: [
      '########...########',
      '#.................#',
      '#.^^^^^^...^^^^^^.#',
      '#.^++1^^...^^2++^.#',
      '#.^^^.........^^^.#',
      '#.^^..._____...^^.#',
      '#.s...___S___...s.#',
      '#.^^..._____...^^.#',
      '#.^^^.........^^^.#',
      '#.^++7^^...^^3++^.#',
      '#.^^^^^^...^^^^^^.#',
      '#.s...1..4..2...s.#',
      '########...########',
    ],
  },
  {
    id: 'assedio_fossa',
    node: 'assedio',
    name: 'La Fossa',
    rows: [
      '########...########',
      '#.................#',
      '#.++++^.....^++++.#',
      '#.+1+^.......^+2+.#',
      '#.^^^.._____..^^^.#',
      '#.s..._______...s.#',
      '#.....___S___.....#',
      '#.s..._______...s.#',
      '#.^^^.._____..^^^.#',
      '#.+7+^.......^+3+.#',
      '#.++++^.....^++++.#',
      '#.s...4..1..2...s.#',
      '########...########',
    ],
  },

  // ------------------------------------------------------------------ Arena del Mini-Boss: readable, nothing to hide behind
  {
    id: 'arena_tonda',
    node: 'miniboss',
    name: 'La Rotonda',
    rows: [
      '########...########',
      '#####.........#####',
      '###.............###',
      '##...............##',
      '#.s.............s.#',
      '#........B........#',
      '#.s.............s.#',
      '##...............##',
      '###.............###',
      '#####....X....#####',
      '###################',
    ],
  },
  {
    id: 'arena_canali',
    node: 'miniboss',
    name: 'La Vasca',
    rows: [
      '########...########',
      '####...........####',
      '##...___...___...##',
      '#.s.__.......__.s.#',
      '#..._....B...._...#',
      '#.s.__.......__.s.#',
      '##...___...___...##',
      '####.....X.....####',
      '###################',
    ],
  },
  {
    id: 'arena_palchi',
    node: 'miniboss',
    name: 'I Palchi',
    rows: [
      '########...########',
      '###.............###',
      '#.^^...........^^.#',
      '#.^+..s.....s..+^.#',
      '#.^+.....B.....+^.#',
      '#.^+..s.....s..+^.#',
      '#.^^...........^^.#',
      '###......X......###',
      '###################',
    ],
  },
];

export const CHUNKS: Record<string, Chunk> = Object.fromEntries(DEFS.map((c) => [c.id, c]));
export const CHUNK_IDS = DEFS.map((c) => c.id);

/** The same prefab flipped left to right. */
export function mirrorRows(rows: string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

export interface NodeSpan {
  kind: NodeKind;
  name: string;
  chunk: string;
  /** First row of the node in the assembled map, and how many rows it spans. */
  row: number;
  rows: number;
}

/**
 * Stacks chunks top to bottom into one frozen map. A trailing '~' on a chunk id mirrors it.
 * Throws at module load if a chunk is missing or malformed: a broken diorama must never ship.
 */
export function assemble(ids: string[]): { rows: string[]; nodes: NodeSpan[] } {
  const rows: string[] = [];
  const nodes: NodeSpan[] = [];
  for (const raw of ids) {
    const flip = raw.endsWith('~');
    const id = flip ? raw.slice(0, -1) : raw;
    const chunk = CHUNKS[id];
    if (!chunk) throw new Error(`unknown chunk ${id}`);
    for (const row of chunk.rows) {
      if (row.length !== CHUNK_W) throw new Error(`chunk ${id}: row "${row}" is not ${CHUNK_W} wide`);
    }
    const part = flip ? mirrorRows(chunk.rows) : chunk.rows;
    nodes.push({ kind: chunk.node, name: NODE_NAMES[chunk.node], chunk: id, row: rows.length, rows: part.length });
    rows.push(...part);
  }
  return { rows, nodes };
}
