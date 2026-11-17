/**
 * The sea around Badiscar, drawn like a woodblock print of a great wave.
 * One long swell carries the curl; Prussian-blue bands and white claws sit on the lip.
 * Waves run at full height outside the walls and fade within SHORE_FADE metres,
 * so a crest never rises through the walkable abyss slabs.
 * The same numbers feed the vertex shader — keep seaHeight() and seaVertexShader() in step.
 */

import { STEP_HEIGHT } from '@malampu/shared';

export interface SeaWave {
  /** Unit direction the swell travels. */
  dirX: number;
  dirZ: number;
  /** Radians per metre. */
  k: number;
  /** Crest height in metres. */
  amp: number;
  /** Radians per second. */
  omega: number;
  /**
   * Horizontal pinch, 0..1. The sum of steep * k * amp across every wave
   * must stay below 1, or a crest loops over itself.
   */
  steep: number;
}

function unit(x: number, z: number): { dirX: number; dirZ: number } {
  const l = Math.hypot(x, z);
  return { dirX: x / l, dirZ: z / l };
}

function wave(dirX: number, dirZ: number, k: number, amp: number, omega: number, steep: number): SeaWave {
  return { ...unit(dirX, dirZ), k, amp, omega, steep };
}

/** Crests narrower than a sine, so the lip reads as a curl instead of a round swell. Max stays 1. */
const CREST_POW = 1.45;

/**
 * One great wave from the east, and three lesser swells behind it.
 * The first is broad enough that the white claws along its lip stay readable.
 */
export const SEA_WAVES: readonly SeaWave[] = [
  wave(-0.93, 0.37, 0.18, 3.4, 1.7, 0.95),
  wave(-0.25, -0.97, 0.32, 0.9, 1.8, 0.35),
  wave(0.18, 0.98, 0.5, 0.4, 2.4, 0.25),
  wave(-0.72, -0.69, 0.85, 0.18, 3.2, 0.2),
];

/** How far past the playable wall the water mesh reaches, in metres. */
export const SEA_MARGIN = 72;

/**
 * Metres of storm that remain once you step inside the wall. Deeper than this, the sea is flat.
 * Short on purpose: the open water is several metres tall, and it has to be gone before the abyss pavement.
 */
export const SHORE_FADE = 5.5;

/**
 * Centre of the headland blocks, metres outside the wall.
 * They sit in the water and stop short of the mesh edge, so open sea shows beyond them.
 */
export const HEADLAND_GAP = 30;
export const HEADLAND_THICK = 14;

/**
 * Mean waterline. Abyss pavement tops sit at -2 * STEP_HEIGHT.
 * Open-water crests climb the outside of the rim wall; inland the storm has already died.
 */
export const SEA_LEVEL = -2 * STEP_HEIGHT - 2.2;

/** Highest the surface can rise above the mean, for a shore factor in 0..1. */
export function seaCrest(shore: number): number {
  let sum = 0;
  for (const w of SEA_WAVES) sum += w.amp;
  return sum * shore;
}

/** Catch-all ground, kept under the deepest trough. */
export function seaBedY(): number {
  return SEA_LEVEL - seaCrest(1) - 0.55;
}

/** 1 in open water, 0 once SHORE_FADE metres inside the wall. Smoothstep either side of the rim. */
export function seaShore(x: number, z: number, halfX: number, halfZ: number): number {
  const inside = Math.min(halfX - Math.abs(x), halfZ - Math.abs(z));
  const t = inside <= 0 ? 0 : inside >= SHORE_FADE ? 1 : inside / SHORE_FADE;
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}

/** Vertical displacement in metres. x and z are mesh-local, origin at the map centre. */
export function seaHeight(x: number, z: number, time: number, shore: number): number {
  let y = 0;
  for (const w of SEA_WAVES) {
    const phase = w.k * (w.dirX * x + w.dirZ * z) - w.omega * time;
    const raw = Math.sin(phase);
    const shaped = raw > 0 ? raw ** CREST_POW : raw;
    y += shaped * w.amp;
  }
  return y * shore;
}

function num(n: number): string {
  return n.toFixed(5);
}

/** Gerstner displacement for every swell. One block per wave, names uniqued so GLSL can compile them in one scope. */
export function seaWaveGlsl(): string {
  return SEA_WAVES.map((w, i) => {
    const dx = num(w.dirX);
    const dz = num(w.dirZ);
    return [
      `float phase${i} = ${num(w.k)} * (${dx} * xz.x + ${dz} * xz.y) - ${num(w.omega)} * time;`,
      `float raw${i} = sin(phase${i});`,
      `float c${i} = cos(phase${i});`,
      `float s${i} = raw${i} > 0.0 ? pow(max(raw${i}, 0.0), ${num(CREST_POW)}) : raw${i};`,
      `float a${i} = ${num(w.amp)} * shore;`,
      `pos.x += ${num(w.steep)} * a${i} * ${dx} * c${i};`,
      `pos.z += ${num(w.steep)} * a${i} * ${dz} * c${i};`,
      `pos.y += a${i} * s${i};`,
      `nrm.x -= ${dx} * ${num(w.k)} * a${i} * c${i};`,
      `nrm.z -= ${dz} * ${num(w.k)} * a${i} * c${i};`,
      `nrm.y -= ${num(w.steep)} * ${num(w.k)} * a${i} * s${i};`,
      i === 0 ? `foam = max(foam, smoothstep(0.45, 0.9, s${i}) * shore);` : '',
    ].join('\n  ');
  }).join('\n  ');
}

export function seaVertexShader(): string {
  return `precision highp float;

attribute vec3 position;

uniform mat4 worldViewProjection;
uniform mat4 world;
uniform float time;
uniform vec2 mapHalf;
uniform float shoreFade;
uniform float crestScale;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vFoam;
varying float vHeight;
varying float vPhase;

void main() {
  vec2 xz = position.xz;
  float inside = min(mapHalf.x - abs(xz.x), mapHalf.y - abs(xz.y));
  float t = clamp(inside / shoreFade, 0.0, 1.0);
  float fade = t * t * (3.0 - 2.0 * t);
  float shore = 1.0 - fade;

  vec3 pos = vec3(xz.x, 0.0, xz.y);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  float foam = 0.0;
  ${seaWaveGlsl()}

  vec4 worldPos = world * vec4(pos, 1.0);
  vWorld = worldPos.xyz;
  vNormal = normalize(mat3(world) * nrm);
  vFoam = foam;
  vHeight = pos.y / crestScale;
  vPhase = phase0;
  gl_Position = worldViewProjection * vec4(pos, 1.0);
}
`;
}

export function seaFragmentShader(): string {
  return `precision highp float;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vFoam;
varying float vHeight;
varying float vPhase;

uniform vec3 cameraPosition;
uniform vec3 fogColor;
uniform float fogDensity;

void main() {
  vec3 n = normalize(vNormal);
  float h = clamp(vHeight, -1.0, 1.0);

  // Flat bands of indigo, the way a woodblock lays Prussian blue.
  vec3 sumi = vec3(0.02, 0.035, 0.08);
  vec3 indigo = vec3(0.05, 0.13, 0.34);
  vec3 ai = vec3(0.16, 0.36, 0.66);
  vec3 barrel = vec3(0.42, 0.64, 0.8);
  float band = floor(clamp(h * 0.5 + 0.5, 0.0, 0.999) * 3.0);
  vec3 col = band < 0.5 ? sumi : (band < 1.5 ? indigo : ai);
  col = mix(col, barrel, smoothstep(0.4, 0.78, h));
  col *= 0.84 + 0.16 * clamp(n.y, 0.0, 1.0);

  // The keyblock: a dark line just under the lip.
  float key = smoothstep(0.46, 0.6, h) * (1.0 - smoothstep(0.74, 0.88, h));
  col = mix(col, vec3(0.012, 0.02, 0.05), key);

  // Claws of foam hooking down the face, plus a solid white lip.
  float finger = sin(vPhase * 6.0 + h * 4.5);
  float finger2 = sin(vPhase * 11.0 + h * 6.0 + 1.7);
  float reach = smoothstep(0.22, 0.58, h) * (1.0 - smoothstep(0.9, 1.0, h));
  float claws = max(smoothstep(0.2, 0.75, finger), smoothstep(0.45, 0.92, finger2)) * reach;
  float lip = smoothstep(0.8, 0.95, h);
  vec3 paper = vec3(0.95, 0.93, 0.86);
  col = mix(col, paper, clamp(max(lip, max(claws, vFoam * lip)), 0.0, 1.0));

  float depth = length(cameraPosition - vWorld);
  float fog = 1.0 - exp(-fogDensity * fogDensity * depth * depth);
  vec3 haze = vec3(0.08, 0.16, 0.32);
  col = mix(col, mix(haze, fogColor, 0.25), clamp(fog, 0.0, 0.28));
  gl_FragColor = vec4(col, 1.0);
}
`;
}
