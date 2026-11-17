/**
 * The sea around Badiscar.
 * Waves are Gerstner swells: tall, fast, and pinched at the crest so the water breaks
 * instead of bobbing. They run at full height outside the walls and fade within
 * SHORE_FADE metres, so a crest never rises through the walkable abyss slabs.
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

/**
 * Four swells. The first comes in from the east, the way the Costa Est faces the open water.
 * Wavelengths stay long enough to read from the isometric camera; the short one is the chop on top.
 */
export const SEA_WAVES: readonly SeaWave[] = [
  // One long swell, tall enough to read from the isometric camera. The rest is chop on its back.
  wave(-0.93, 0.37, 0.22, 3.2, 2.6, 0.85),
  wave(-0.25, -0.97, 0.35, 1.1, 2.15, 0.4),
  wave(0.18, 0.98, 0.55, 0.45, 2.8, 0.28),
  wave(-0.72, -0.69, 0.9, 0.22, 4.2, 0.22),
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
    y += Math.sin(phase) * w.amp;
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
      `float s${i} = sin(phase${i});`,
      `float c${i} = cos(phase${i});`,
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

  float ripX = sin(xz.x * 1.6 + time * 3.1) * cos(xz.y * 1.15 - time * 2.4);
  float ripZ = cos(xz.x * 1.25 - time * 2.7) * sin(xz.y * 1.7 + time * 2.1);
  nrm.x += ripX * 0.08 * shore;
  nrm.z += ripZ * 0.08 * shore;

  vec4 worldPos = world * vec4(pos, 1.0);
  vWorld = worldPos.xyz;
  vNormal = normalize(mat3(world) * nrm);
  vFoam = foam;
  vHeight = pos.y / crestScale;
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

uniform vec3 cameraPosition;
uniform vec3 fogColor;
uniform float fogDensity;

void main() {
  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(-0.42, 1.0, -0.18));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float ndotl = clamp(dot(n, lightDir), 0.0, 1.0);
  float h = clamp(vHeight, -1.0, 1.0);

  vec3 deep = vec3(0.004, 0.045, 0.09);
  vec3 mid = vec3(0.02, 0.22, 0.38);
  vec3 peak = vec3(0.45, 0.78, 0.9);
  vec3 col = mix(deep, mid, smoothstep(-0.85, 0.05, h));
  col = mix(col, peak, smoothstep(0.2, 0.85, h));

  vec3 halfVec = normalize(lightDir + viewDir);
  float spec = pow(clamp(dot(n, halfVec), 0.0, 1.0), 24.0);
  col += vec3(0.75, 0.92, 1.0) * spec * smoothstep(0.0, 0.7, h);

  vec3 foam = vec3(0.94, 0.97, 0.96);
  float cap = max(vFoam * smoothstep(0.15, 0.8, h), smoothstep(0.72, 0.98, h));
  col = mix(col, foam, clamp(cap, 0.0, 1.0));
  col += vec3(ndotl * 0.02);

  float depth = length(cameraPosition - vWorld);
  float fog = 1.0 - exp(-fogDensity * fogDensity * depth * depth);
  col = mix(col, fogColor, clamp(fog, 0.0, 0.35));
  gl_FragColor = vec4(col, 1.0);
}
`;
}
