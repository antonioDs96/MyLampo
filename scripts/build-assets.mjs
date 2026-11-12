// Builds the game's 3D assets from the CC0 KayKit packs (https://github.com/KayKit-Game-Assets).
// Usage: node scripts/build-assets.mjs [sourceDir]
// The source dir must contain clones of:
//   KayKit-Character-Pack-Adventures-1.0, KayKit-Character-Pack-Skeletons-1.0, KayKit-Dungeon-Remastered-1.0
// When it is missing the packs are cloned into a temp folder.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'packages/client/public/assets');
const srcDir = resolve(process.argv[2] ?? join(tmpdir(), 'assets'));

const PACKS = [
  'KayKit-Character-Pack-Adventures-1.0',
  'KayKit-Character-Pack-Skeletons-1.0',
  'KayKit-Dungeon-Remastered-1.0',
];

const KEEP_ANIMATIONS = new Set([
  'Idle', 'Unarmed_Idle', '2H_Melee_Idle', 'Idle_Combat',
  'Running_A', 'Running_B', 'Running_C', 'Walking_A', 'Walking_Backwards', 'Walking_D_Skeletons',
  'Running_Strafe_Left', 'Running_Strafe_Right',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal',
  '1H_Melee_Attack_Stab', '1H_Melee_Attack_Jump_Chop',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin', '2H_Melee_Attack_Spinning',
  '2H_Melee_Attack_Stab',
  'Dualwield_Melee_Attack_Chop', 'Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab',
  'Unarmed_Melee_Attack_Kick', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B',
  '2H_Ranged_Aiming', '2H_Ranged_Shoot', '2H_Ranged_Reload', '1H_Ranged_Shoot',
  'Spellcast_Long', 'Spellcast_Raise', 'Spellcast_Shoot', 'Spellcasting', 'Spellcast_Summon',
  'Block', 'Block_Attack', 'Block_Hit', 'Blocking',
  'Dodge_Backward', 'Dodge_Forward', 'Dodge_Left', 'Dodge_Right',
  'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose', 'Death_B', 'Death_B_Pose', 'Death_C_Skeletons',
  'Cheer', 'Interact', 'PickUp', 'Throw', 'Use_Item', 'Taunt', 'Taunt_Longer',
  'Lie_Idle', 'Lie_StandUp', 'Sit_Chair_Idle',
  'Jump_Full_Short', 'Jump_Start', 'Jump_Idle', 'Jump_Land',
  'Spawn_Ground', 'Spawn_Ground_Skeletons', 'Spawn_Air', 'Skeletons_Awaken_Floor',
]);

const CHARACTERS = [
  ['KayKit-Character-Pack-Adventures-1.0', 'kaykit_character_pack_adventures', ['Barbarian', 'Knight', 'Mage', 'Rogue', 'Rogue_Hooded']],
  ['KayKit-Character-Pack-Skeletons-1.0', 'kaykit_character_pack_skeletons', ['Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior']],
];

const WEAPONS = [
  ['KayKit-Character-Pack-Adventures-1.0', 'kaykit_character_pack_adventures', ['sword_1handed', 'sword_2handed', 'axe_2handed', 'dagger', 'arrow', 'staff', 'wand']],
  ['KayKit-Character-Pack-Skeletons-1.0', 'kaykit_character_pack_skeletons', ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Arrow', 'Skeleton_Shield_Large_A']],
];

const ENV_PIECES = [
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_wood_large', 'floor_wood_large_dark', 'floor_dirt_large',
  'floor_dirt_large_rocky', 'floor_tile_big_grate',
  'wall', 'wall_cracked', 'wall_broken', 'wall_arched', 'wall_archedwindow_gated', 'wall_window_closed',
  'wall_gated', 'wall_pillar', 'wall_shelves', 'wall_scaffold', 'wall_doorway',
  'pillar', 'pillar_decorated', 'column', 'barrier', 'barrier_column',
  'barrel_large', 'barrel_large_decorated', 'barrel_small', 'barrel_small_stack', 'keg', 'keg_decorated',
  'box_large', 'box_stacked', 'crates_stacked', 'chest', 'chest_gold',
  'table_long', 'table_long_decorated_A', 'table_long_broken', 'table_medium', 'table_medium_decorated_A',
  'table_medium_broken', 'table_small', 'chair', 'stool', 'shelves', 'shelf_large',
  'torch_lit', 'torch_mounted', 'candle_triple', 'candle_lit',
  'banner_patternA_red', 'banner_patternB_blue', 'banner_patternC_white', 'banner_red', 'banner_blue',
  'banner_white', 'banner_yellow', 'banner_green', 'banner_shield_red', 'banner_triple_red',
  'rubble_large', 'rubble_half', 'sword_shield', 'sword_shield_broken', 'bed_floor', 'trunk_large_A',
  'bottle_A_green', 'plate_food_A', 'coin_stack_large', 'stairs',
];

function ensurePacks() {
  mkdirSync(srcDir, { recursive: true });
  for (const pack of PACKS) {
    const dir = join(srcDir, pack);
    if (!existsSync(dir)) {
      console.log(`cloning ${pack}...`);
      execSync(`git clone --depth 1 -q https://github.com/KayKit-Game-Assets/${pack}.git "${dir}"`, { stdio: 'inherit' });
    }
  }
}

const io = new NodeIO();

async function buildCharacter(file, out) {
  const doc = await io.read(file);
  for (const anim of doc.getRoot().listAnimations()) {
    if (!KEEP_ANIMATIONS.has(anim.getName())) anim.dispose();
  }
  stripRestChannels(doc);
  await doc.transform(resample(), prune(), dedup());
  await io.write(out, doc);
}

// Most channels in the packs hold the rest pose for the whole clip (scale, translation of
// non-root bones, IK helpers). A channel is dropped only when its (node, path) pair never
// leaves the rest pose in any kept clip, so switching clips cannot leave a stale value behind.
function stripRestChannels(doc) {
  const EPS = 1e-4;
  const restOf = (node, path) =>
    path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale();
  const moving = new Set();
  const keyOf = (channel) => `${channel.getTargetNode()?.getName()}|${channel.getTargetPath()}`;
  const animations = doc.getRoot().listAnimations();

  // IK/control helper bones deform nothing: they exist only for authoring in the source rig.
  const drivesSomething = (node) => !/IK|^control-/.test(node.getName());
  for (const anim of animations) {
    for (const channel of anim.listChannels()) {
      const node = channel.getTargetNode();
      if (node && !drivesSomething(node)) {
        const sampler = channel.getSampler();
        channel.dispose();
        if (sampler && sampler.listParents().every((p) => p === anim)) sampler.dispose();
      }
    }
  }
  for (const anim of animations) {
    for (const channel of anim.listChannels()) {
      const node = channel.getTargetNode();
      const path = channel.getTargetPath();
      const output = channel.getSampler()?.getOutput();
      if (!node || !output || path === 'weights') {
        moving.add(keyOf(channel));
        continue;
      }
      const rest = restOf(node, path);
      const values = output.getArray();
      const size = rest.length;
      for (let i = 0; i < values.length; i++) {
        if (Math.abs(values[i] - rest[i % size]) > EPS) {
          moving.add(keyOf(channel));
          break;
        }
      }
    }
  }
  let removed = 0;
  for (const anim of animations) {
    for (const channel of anim.listChannels()) {
      if (moving.has(keyOf(channel))) continue;
      const sampler = channel.getSampler();
      channel.dispose();
      if (sampler && sampler.listParents().every((p) => p === anim)) sampler.dispose();
      removed++;
    }
  }
  return removed;
}

async function convert(file, out) {
  const doc = await io.read(file);
  await doc.transform(prune(), dedup());
  await io.write(out, doc);
}

function kb(file) {
  return `${Math.round(statSync(file).size / 1024)} KB`;
}

async function main() {
  ensurePacks();
  for (const sub of ['chars', 'weapons', 'env']) mkdirSync(join(outDir, sub), { recursive: true });

  for (const [pack, addon, names] of CHARACTERS) {
    for (const name of names) {
      const src = join(srcDir, pack, 'addons', addon, 'Characters/gltf', `${name}.glb`);
      const out = join(outDir, 'chars', `${name}.glb`);
      await buildCharacter(src, out);
      console.log(`chars/${name}.glb  ${kb(src)} -> ${kb(out)}`);
    }
  }

  for (const [pack, addon, names] of WEAPONS) {
    for (const name of names) {
      const src = join(srcDir, pack, 'addons', addon, 'Assets/gltf', `${name}.gltf`);
      const out = join(outDir, 'weapons', `${name}.glb`);
      await convert(src, out);
      console.log(`weapons/${name}.glb  ${kb(out)}`);
    }
  }

  const envSrc = join(srcDir, 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf');
  const available = new Set(readdirSync(envSrc));
  let total = 0;
  for (const name of ENV_PIECES) {
    const file = available.has(`${name}.gltf.glb`) ? `${name}.gltf.glb` : `${name}.glb`;
    if (!available.has(file)) throw new Error(`missing env piece ${name}`);
    const out = join(outDir, 'env', `${name}.glb`);
    copyFileSync(join(envSrc, file), out);
    total += statSync(out).size;
  }
  console.log(`env: ${ENV_PIECES.length} pieces, ${Math.round(total / 1024)} KB`);

  writeFileSync(
    join(outDir, 'CREDITS.txt'),
    [
      '3D models: KayKit Adventurers, Skeletons and Dungeon Remastered packs by Kay Lousberg (www.kaylousberg.com).',
      'License: Creative Commons Zero (CC0) — http://creativecommons.org/publicdomain/zero/1.0/',
      'Sources: https://github.com/KayKit-Game-Assets',
      '',
    ].join('\n'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
