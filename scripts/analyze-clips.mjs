// Lists the animation clips of a character GLB with their duration and the moment each hand
// moves fastest — the impact time used to align hits with the swing in the attack tables.
// Usage: node scripts/analyze-clips.mjs packages/client/public/assets/chars/Knight.glb [filter]
import { NodeIO } from '@gltf-transform/core';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/analyze-clips.mjs <character.glb> [name filter]');
  process.exit(1);
}
const filter = new RegExp(process.argv[3] ?? '.', 'i');

const doc = await new NodeIO().read(file);
const nodes = doc.getRoot().listNodes();
const parent = new Map();
for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);

function rotate(q, v) {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

function sample(channel, t) {
  const sampler = channel.getSampler();
  const times = sampler.getInput().getArray();
  const values = sampler.getOutput().getArray();
  const n = times.length;
  const size = values.length / n;
  let i = 0;
  while (i < n - 1 && times[i + 1] < t) i++;
  const j = Math.min(i + 1, n - 1);
  const f = times[j] > times[i] ? Math.min(1, Math.max(0, (t - times[i]) / (times[j] - times[i]))) : 0;
  const out = [];
  for (let k = 0; k < size; k++) out.push(values[i * size + k] * (1 - f) + values[j * size + k] * f);
  if (size === 4) {
    const len = Math.hypot(...out);
    return out.map((v) => v / len);
  }
  return out;
}

function worldPosition(node, channels, t) {
  let p = [0, 0, 0];
  for (let n = node; n; n = parent.get(n)) {
    const c = channels.get(n) ?? {};
    const tr = c.translation ? sample(c.translation, t) : n.getTranslation();
    const ro = c.rotation ? sample(c.rotation, t) : n.getRotation();
    const sc = c.scale ? sample(c.scale, t) : n.getScale();
    p = rotate(ro, [p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]]);
    p = [p[0] + tr[0], p[1] + tr[1], p[2] + tr[2]];
  }
  return p;
}

const find = (name) => nodes.find((n) => n.getName() === name);
const handR = find('handslot.r');
const handL = find('handslot.l');
const hips = find('hips');

console.log('clip'.padEnd(34), 'dur ', 'R peak', 'L peak', 'hips travel (x,y,z)');
for (const anim of doc.getRoot().listAnimations()) {
  if (!filter.test(anim.getName())) continue;
  const channels = new Map();
  let dur = 0;
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    if (!channels.has(node)) channels.set(node, {});
    channels.get(node)[ch.getTargetPath()] = ch;
    const times = ch.getSampler().getInput().getArray();
    dur = Math.max(dur, times[times.length - 1]);
  }
  const dt = 1 / 60;
  const peak = { r: [0, 0], l: [0, 0] };
  const start = worldPosition(hips, channels, 0);
  const travel = [0, 0, 0];
  let prev = null;
  for (let t = 0; t <= dur + 1e-6; t += dt) {
    const r = worldPosition(handR, channels, t);
    const l = worldPosition(handL, channels, t);
    const h = worldPosition(hips, channels, t);
    if (prev) {
      const sr = Math.hypot(r[0] - prev.r[0], r[1] - prev.r[1], r[2] - prev.r[2]) / dt;
      const sl = Math.hypot(l[0] - prev.l[0], l[1] - prev.l[1], l[2] - prev.l[2]) / dt;
      if (sr > peak.r[0]) peak.r = [sr, t];
      if (sl > peak.l[0]) peak.l = [sl, t];
    }
    for (let k = 0; k < 3; k++) if (Math.abs(h[k] - start[k]) > Math.abs(travel[k])) travel[k] = h[k] - start[k];
    prev = { r, l };
  }
  console.log(
    anim.getName().padEnd(34),
    dur.toFixed(2),
    peak.r[1].toFixed(2).padStart(6),
    peak.l[1].toFixed(2).padStart(6),
    ' ',
    travel.map((v) => v.toFixed(2)).join(', '),
  );
}
