// Generates a game-ready weapon GLB with the Meshy API and fits it to the KayKit hand slot.
// The key stays in MESHY_API_KEY or the gitignored .env. It is never printed.
//
//   node scripts/meshy.mjs --name harpoon --prompt "a low poly harpoon"
//   node scripts/meshy.mjs --fit in.glb --out packages/client/public/assets/weapons/harpoon.glb
//
// Preview uses Smart Topology (meshy-t2.5) at a few hundred faces. Refine writes one albedo,
// which is the only map the client reads. The mesh is then scaled so its length and thickness
// match the other weapons parented to handslot.r.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';

// Staff-like reach, dagger-like thickness. Uniform scale leaves Meshy shafts hair-thin.
const TARGET_LENGTH = 2.15;
const TARGET_THICKNESS = 0.26;

function loadKey() {
  if (process.env.MESHY_API_KEY?.trim()) return process.env.MESHY_API_KEY.trim();
  const path = join(root, '.env');
  if (!existsSync(path)) return '';
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*MESHY_API_KEY\s*=\s*(.*?)\s*$/);
    if (match) return match[1].replace(/^["']|["']$/g, '');
  }
  return '';
}

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function api(key, path, body) {
  const res = await fetch(path ? `${API}/${path}` : API, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meshy ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function waitFor(key, id) {
  const deadline = Date.now() + 8 * 60 * 1000;
  for (;;) {
    const task = await api(key, id);
    process.stdout.write(`\r${id} ${task.status} ${task.progress ?? 0}%   `);
    if (task.status === 'SUCCEEDED') {
      process.stdout.write('\n');
      return task;
    }
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(task.task_error?.message ?? `task ${task.status}`);
    }
    if (Date.now() > deadline) throw new Error(`task ${id} timed out`);
    await new Promise((r) => setTimeout(r, 8000));
  }
}

function readGlb(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHeader = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeader);
  const bin = Buffer.from(buf.subarray(binHeader + 8, binHeader + 8 + binLen));
  return { json, bin };
}

function viewBytes(bin, json, viewIndex) {
  const view = json.bufferViews[viewIndex];
  return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
}

function fitWeapon(src, dest, { length = TARGET_LENGTH, thickness = TARGET_THICKNESS } = {}) {
  let { json, bin } = readGlb(src);
  const mesh = json.meshes[0];
  const prim = mesh.primitives[0];
  const posAcc = json.accessors[prim.attributes.POSITION];
  const nrmAcc = json.accessors[prim.attributes.NORMAL];
  const pos = new Float32Array(
    viewBytes(bin, json, posAcc.bufferView).buffer,
    viewBytes(bin, json, posAcc.bufferView).byteOffset,
    posAcc.count * 3,
  );
  const nrm = new Float32Array(
    viewBytes(bin, json, nrmAcc.bufferView).buffer,
    viewBytes(bin, json, nrmAcc.bufferView).byteOffset,
    nrmAcc.count * 3,
  );

  // Float32Array views alias `bin` only when the slice is aligned. Copy to be sure.
  const positions = Float32Array.from(pos);
  const normals = Float32Array.from(nrm);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  // Meshy picks its own up axis. Turn the long axis to +Y, head (the thicker end) upward.
  const size = min.map((v, k) => max[k] - v);
  const long = size.indexOf(Math.max(...size));
  const turn = (x, y, z) => {
    if (long === 0) return [-y, x, z];
    if (long === 2) return [x, z, -y];
    return [x, y, z];
  };
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = turn(positions[i], positions[i + 1], positions[i + 2]);
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    const [nx, ny, nz] = turn(normals[i], normals[i + 1], normals[i + 2]);
    normals[i] = nx;
    normals[i + 1] = ny;
    normals[i + 2] = nz;
  }
  min = [Infinity, Infinity, Infinity];
  max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  const height = max[1] - min[1];
  const endRadius = (from, to) => {
    let r = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const t = (positions[i + 1] - min[1]) / height;
      if (t < from || t > to) continue;
      r = Math.max(r, Math.hypot(positions[i], positions[i + 2]));
    }
    return r;
  };
  if (endRadius(0, 0.18) > endRadius(0.82, 1)) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = -positions[i + 1];
      positions[i + 2] = -positions[i + 2];
      normals[i + 1] = -normals[i + 1];
      normals[i + 2] = -normals[i + 2];
    }
    const lo = min[1];
    min[1] = -max[1];
    max[1] = -lo;
    const z0 = min[2];
    min[2] = -max[2];
    max[2] = -z0;
  }

  // The grip is the thickest band on the lower half, above the butt spike.
  const fitted = min.map((v, k) => max[k] - v);
  const bins = 24;
  const radius = Array.from({ length: bins }, () => 0);
  for (let i = 0; i < positions.length; i += 3) {
    const t = (positions[i + 1] - min[1]) / fitted[1];
    const b = Math.min(bins - 1, Math.max(0, Math.floor(t * bins)));
    radius[b] = Math.max(radius[b], Math.hypot(positions[i], positions[i + 2]));
  }
  let gripBin = 2;
  for (let b = 2; b < bins * 0.45; b++) if (radius[b] > radius[gripBin]) gripBin = b;
  const gripT = (gripBin + 0.5) / bins;
  const gripY = min[1] + gripT * fitted[1];
  const sy = length / fitted[1];
  const wide = Math.max(fitted[0], fitted[2]);
  const sxz = thickness / wide;

  let nMin = [Infinity, Infinity, Infinity];
  let nMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - (min[0] + max[0]) / 2) * sxz;
    positions[i + 1] = (positions[i + 1] - gripY) * sy;
    positions[i + 2] = (positions[i + 2] - (min[2] + max[2]) / 2) * sxz;
    normals[i] /= sxz;
    normals[i + 1] /= sy;
    normals[i + 2] /= sxz;
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
    for (let k = 0; k < 3; k++) {
      nMin[k] = Math.min(nMin[k], normals[i + k]);
      nMax[k] = Math.max(nMax[k], normals[i + k]);
    }
  }

  const posView = viewBytes(bin, json, posAcc.bufferView);
  const nrmView = viewBytes(bin, json, nrmAcc.bufferView);
  Buffer.from(positions.buffer).copy(posView);
  Buffer.from(normals.buffer).copy(nrmView);
  posAcc.min = [Infinity, Infinity, Infinity];
  posAcc.max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      posAcc.min[k] = Math.min(posAcc.min[k], positions[i + k]);
      posAcc.max[k] = Math.max(posAcc.max[k], positions[i + k]);
    }
  }
  nrmAcc.min = nMin;
  nrmAcc.max = nMax;

  const image = json.images?.[0];
  if (image?.bufferView !== undefined && image.mimeType === 'image/jpeg') {
    const dir = mkdtempSync(join(tmpdir(), 'meshy-'));
    const srcJpg = join(dir, 'src.jpg');
    const outJpg = join(dir, 'out.jpg');
    writeFileSync(srcJpg, viewBytes(bin, json, image.bufferView));
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', srcJpg,
      '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease",
      '-q:v', '4', outJpg,
    ]);
    const jpg = readFileSync(outJpg);
    const view = json.bufferViews[image.bufferView];
    const offset = view.byteOffset ?? 0;
    const next = Buffer.concat([bin.subarray(0, offset), jpg]);
    bin = next;
    view.byteLength = jpg.length;
    json.buffers[0].byteLength = next.length;
  }

  if (json.nodes?.[0]) {
    json.nodes[0].name = dest.split('/').pop()?.replace(/\.glb$/, '') ?? 'weapon';
    delete json.nodes[0].matrix;
  }
  writeGlb(dest, json, bin);
  const span = posAcc.max.map((v, k) => +(v - posAcc.min[k]).toFixed(3));
  console.log(
    `${dest}  grip ${(gripT * 100).toFixed(0)}% from the butt  size ${span.join(' x ')}  ${Math.round(readFileSync(dest).length / 1024)} KB`,
  );
}

function writeGlb(path, json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
  const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4, 0);
  const jsonChunk = Buffer.concat([jsonBuf, jsonPad]);
  const binChunk = Buffer.concat([bin, binPad]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  writeFileSync(path, out);
}

async function generate(key, { name, prompt, texture, polys }) {
  const preview = await api(key, '', {
    mode: 'preview',
    prompt,
    model_type: 'smart-topology',
    ai_model: 'meshy-t2.5',
    target_polycount: Number(polys ?? 900),
    target_formats: ['glb'],
  });
  const mesh = await waitFor(key, preview.result);
  const refine = await api(key, '', {
    mode: 'refine',
    preview_task_id: preview.result,
    enable_pbr: false,
    target_formats: ['glb'],
    texture_prompt: texture ?? 'Flat hand-painted stylized game texture. Even color, no photorealism, no text.',
  });
  const textured = await waitFor(key, refine.result);
  const glb = await fetch(textured.model_urls.glb);
  if (!glb.ok) throw new Error(`download ${glb.status}`);
  const dir = mkdtempSync(join(tmpdir(), 'meshy-'));
  const raw = join(dir, 'raw.glb');
  writeFileSync(raw, Buffer.from(await glb.arrayBuffer()));
  const dest = join(root, 'packages/client/public/assets/weapons', `${name}.glb`);
  fitWeapon(raw, dest);
  console.log(`credits preview ${mesh.consumed_credits ?? '?'} + refine ${textured.consumed_credits ?? '?'}`);
}

const flags = argsOf(process.argv.slice(2));
try {
  if (flags.fit) {
    if (!flags.out) throw new Error('--fit needs --out');
    fitWeapon(flags.fit, resolve(flags.out), {
      length: flags.length ? Number(flags.length) : TARGET_LENGTH,
      thickness: flags.thickness ? Number(flags.thickness) : TARGET_THICKNESS,
    });
  } else {
    if (!flags.name || !flags.prompt) {
      throw new Error('usage: node scripts/meshy.mjs --name <id> --prompt "..." [--texture "..."]');
    }
    const key = loadKey();
    if (!key) throw new Error('MESHY_API_KEY is missing. Put it in .env (gitignored).');
    await generate(key, flags);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
