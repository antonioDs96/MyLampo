/**
 * Visual clips for the Mixamo rigs. Combat timings stay in the shared hero data;
 * this only chooses which frames to show. Loop is idle, walk, run and the one
 * guard clip. Attacks, dodges and hit reactions play once.
 *
 * A few Mixamo exports kept a hash instead of a name. Those are called out below.
 */

export type PoseKind =
  | 'idle'
  | 'walk'
  | 'run'
  | 'light'
  | 'heavy'
  | 'charge'
  | 'ability'
  | 'ult'
  | 'block'
  | 'dodge'
  | 'hit'
  | 'death';

export interface HeldProp {
  model: string;
  bone: 'mixamorig:RightHand' | 'mixamorig:LeftHand';
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
}

export interface ClipSel {
  clip: string;
  loop: boolean;
  /** Window of the clip, as fractions of its length. */
  from: number;
  to: number;
  /**
   * Incoming seconds that reach `to`. Zero means the incoming clock is already
   * in seconds (death, and any clip we do not want to squash).
   */
  span: number;
}

export interface HeroRig {
  idle: ClipSel;
  walk: ClipSel;
  run: ClipSel;
  lights: ClipSel[];
  heavy: ClipSel;
  charge: ClipSel;
  ability: ClipSel;
  ult: ClipSel;
  block: ClipSel;
  dodge: ClipSel;
  hit: ClipSel;
  death: ClipSel;
  props: HeldProp[];
}

const loop = (clip: string, from = 0, to = 1): ClipSel => ({ clip, loop: true, from, to, span: 1 });
const once = (clip: string, span = 0.8, from = 0, to = 1): ClipSel => ({ clip, loop: false, from, to, span });
/** Charge meter 0..1 scrubs the opening of the strike, then the release plays the rest. */
const windup = (clip: string, to = 0.34): ClipSel => ({ clip, loop: false, from: 0, to, span: 1 });

// Vyncent's file has no clip named crouch or lycan-walk. The low held pose is the crouch.
const V_CROUCH = '_01a1f398_cc11_71f4_a318_055cca8780de';
// Hunched stalking gait (arms low, long stride). Hip travel is pinned off, so the legs stay in place.
const V_LYCAN_WALK = '_01a1f0f6_9d22_7029_90cf_92057e7fab48';
const V_SWING = '_01a1f39a_ee87_755c_9fc2_515a0762cb6a';
const V_LUNGE = '_01a1f39e_1b42_7301_b1c5_ecf29bc77830';
// Alexios drops onto his knuckles and steps. The file left the clip unnamed.
const A_KNUCKLE = '_01a1f3d4_2285_7269_862b_c951a9500653';
// Rycard holds one arm high with the cape. The file left the clip unnamed.
const R_RAISE = '_01a1f109_7fcb_7149_9c09_8905e1622964';
// Dalìth's dance walk. The file left the clip unnamed: arms rise in turn and the hips travel.
const D_DANCE = '_01a1f12a_2272_746c_a3d1_2ac1ece8f4c0';

const DAGGERS: HeldProp[] = [
  { model: 'satyr_dagger', bone: 'mixamorig:RightHand', scale: 0.42, rotation: [Math.PI, 0, 0], position: [0, 0.22, 0] },
  { model: 'satyr_dagger', bone: 'mixamorig:LeftHand', scale: 0.42, rotation: [Math.PI, 0, 0], position: [0, 0.22, 0] },
];

const RIGS: Record<string, HeroRig> = {
  albereth: {
    // No Idle clip in the file. The walk cycle is the resting loop.
    idle: loop('Walking'),
    walk: loop('Walking'),
    run: loop('Running'),
    lights: [once('Punch_Combo', 0.7), once('Punch_Combo_1', 0.7), once('Punch_Combo_2', 0.85), once('Punch_Combo', 0.7)],
    heavy: once('Axe_Spin_Attack', 0.9),
    charge: windup('Axe_Spin_Attack'),
    // Same spiral as the charged strike. The hash clip is the old ocarina pose, not a strike.
    ability: once('Axe_Spin_Attack', 0.9),
    ult: once('Punch_Combo_2', 0.9),
    block: loop('Sword_Parry_Backward_2'),
    dodge: once('Roll_Dodge_1', 0.4),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: DAGGERS,
  },
  vyncent: {
    idle: loop(V_CROUCH, 0.4, 0.85),
    walk: loop(V_LYCAN_WALK),
    run: loop('Running'),
    lights: [once(V_SWING, 0.7), once(V_LUNGE, 0.75), once('Shield_Push_Left', 0.7), once(V_SWING, 0.7)],
    heavy: once('Charged_Upward_Slash', 0.9),
    charge: windup('Charged_Upward_Slash'),
    ability: once('Jumping_Punch', 0.9),
    ult: once('Zombie_Scream', 0.95),
    block: loop('Two_Handed_Parry'),
    dodge: once('Roll_Dodge', 0.4),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: [],
  },
  jusef: {
    idle: loop('Walking'),
    walk: loop('Walking'),
    run: loop('Running'),
    lights: [once('Attack', 0.75), once('Double_Combo_Attack', 0.8), once('Triple_Combo_Attack', 0.9)],
    heavy: once('Thrust_Slash', 0.9),
    charge: windup('Thrust_Slash', 0.4),
    ability: once('Axe_Spin_Attack', 0.85),
    ult: once('Charged_Spell_Cast', 0.9),
    block: loop('Sword_Parry_Backward_1'),
    dodge: once('Roll_Dodge', 0.4),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: [
      { model: 'stocco', bone: 'mixamorig:RightHand', scale: 0.48, rotation: [Math.PI / 2, 0, 0], position: [0, 0.04, 0.32] },
    ],
  },
  alexios: {
    idle: loop('Walking'),
    walk: loop('Slow_Orc_Walk'),
    run: loop('Running'),
    lights: [once('Punch_Combo_1', 0.7), once('Punch_Combo_2', 0.75), once('Punch_Combo_3', 0.8)],
    heavy: once('Spartan_Kick', 0.75),
    charge: windup('Spartan_Kick', 0.45),
    ability: once(A_KNUCKLE, 0.9),
    ult: once('Show_Both_Arm_Muscles', 1.1),
    block: loop('Two_Handed_Parry'),
    dodge: once('Roll_Dodge', 0.4),
    hit: once('Hit_Reaction_1', 0.45),
    death: once('dying_backwards', 0),
    props: [],
  },
  rycard: {
    idle: loop('Walking'),
    walk: loop('Walking'),
    run: loop('Running'),
    lights: [once('Archery_Shot_3', 0.45), once('Archery_Shot_3', 0.45), once('Archery_Shot_1', 0.6)],
    // Draw lives in the first half. The release is the second half of the same clip.
    // The ability plays that whole flourish; the ult is the held cape raise.
    heavy: { clip: 'Archery_Shot', loop: false, from: 0.5, to: 1, span: 0.7 },
    charge: { clip: 'Archery_Shot', loop: false, from: 0.08, to: 0.5, span: 1 },
    ability: once('Archery_Shot', 0.7),
    ult: once(R_RAISE, 1.0),
    block: loop('Sword_Parry_Backward'),
    dodge: once('Roll_Dodge', 0.4),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: [
      { model: 'hungaria_bow', bone: 'mixamorig:LeftHand', scale: 0.42, rotation: [0, 0, Math.PI / 2], position: [0, 0.02, 0] },
    ],
  },
  fabyorn: {
    idle: loop('Walking'),
    walk: loop('Walking'),
    run: loop('Running'),
    lights: [once('Double_Combo_Attack', 0.75), once('Triple_Combo_Attack', 0.85), once('Weapon_Combo', 0.85)],
    heavy: once('Charged_Upward_Slash', 0.9),
    charge: windup('Charged_Upward_Slash'),
    ability: once('Axe_Spin_Attack', 0.85),
    ult: once('Heavy_Hammer_Swing', 0.8),
    block: loop('Sword_Parry_Backward_2'),
    dodge: once('Roll_Dodge', 0.4),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: [
      { model: 'battle_axe', bone: 'mixamorig:RightHand', scale: 0.42, rotation: [Math.PI / 2, 0, 0], position: [0, 0.08, 0] },
      { model: 'oak_shield', bone: 'mixamorig:LeftHand', scale: 0.38, rotation: [0, Math.PI / 2, 0], position: [0, 0.06, 0.02] },
    ],
  },
  gabryel: {
    idle: loop('Walking'),
    walk: loop('Walking'),
    run: loop('Running'),
    lights: [once('mage_soell_cast', 0.7), once('mage_soell_cast', 0.7), once('mage_soell_cast', 0.75)],
    heavy: once('Charged_Spell_Cast_1', 0.95),
    charge: windup('Charged_Spell_Cast_1', 0.4),
    ability: once('mage_soell_cast_4', 0.85),
    ult: once('mage_soell_cast_2', 0.95),
    block: loop('mage_soell_cast_3'),
    dodge: once('mage_soell_cast_6', 0.45),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: [
      { model: 'light_staff', bone: 'mixamorig:RightHand', scale: 0.95, rotation: [Math.PI, 0, 0], position: [0, 0.42, 0] },
    ],
  },
  anthon: {
    idle: loop('Walking'),
    walk: loop('Walking'),
    run: loop('Running'),
    lights: [once('mage_soell_cast', 0.7), once('mage_soell_cast', 0.7), once('mage_soell_cast', 0.75)],
    // The charged strike is cast 4, not the clip named Charged_Spell_Cast_1.
    heavy: once('mage_soell_cast_4', 0.85),
    charge: windup('mage_soell_cast_4', 0.4),
    ability: once('mage_soell_cast_2', 0.9),
    ult: once('mage_soell_cast_2', 0.95),
    block: loop('mage_soell_cast_3'),
    dodge: once('mage_soell_cast_6', 0.45),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: [
      { model: 'chaos_staff', bone: 'mixamorig:RightHand', scale: 0.95, rotation: [Math.PI, 0, 0], position: [0, 0.42, 0] },
    ],
  },
  dalith: {
    idle: loop('Walking'),
    walk: loop(D_DANCE),
    run: loop('Running'),
    lights: [
      once('Boxing_Guard_Right_Straight_Kick', 0.7),
      once('High_Kick', 0.75),
      once('Boxing_Guard_Step_Knee_Strike', 0.8),
      once('Sweeping_Kick', 0.8),
    ],
    heavy: once('Sweep_Kick', 0.9),
    charge: windup('Sweep_Kick', 0.35),
    ability: once('Lunge_Spin_Kick', 0.85),
    ult: once('jazz_danc', 1.0),
    // No clip is only a boxing guard. This one holds both hands up; the Boxing_Guard clips are strikes.
    block: loop('Two_Handed_Parry'),
    // The backflip stays unused. The two dodges cannot take turns, so only the quick step plays.
    dodge: once('Quick_Step_and_Spin_Dodge', 0.45),
    hit: once('Hit_Reaction_to_Waist', 0.45),
    death: once('Dead', 0),
    props: [],
  },
};

export function heroRig(id: string | undefined): HeroRig | undefined {
  return id ? RIGS[id] : undefined;
}

/** How long the selection pedestal walks before the first attack. */
export const MENU_WALK_HOLD = 2.8;
/** Each attack plays through once, slower than combat, so the move reads. */
export const MENU_ATTACK_PLAY = 1.7;
/** Last frame of an attack, held before the next clip. */
export const MENU_ATTACK_TAIL = 0.35;

export interface MenuBeat {
  kind: PoseKind;
  index: number;
}

/** Walk, then every attack, then back to the walk. The pedestal loops this. */
export function selectMenuReel(rig: HeroRig): MenuBeat[] {
  return [
    { kind: 'walk', index: 0 },
    ...rig.lights.map((_, index) => ({ kind: 'light' as const, index })),
    { kind: 'heavy', index: 0 },
    { kind: 'ability', index: 0 },
    { kind: 'ult', index: 0 },
  ];
}

export function menuBeatHold(kind: PoseKind): number {
  return kind === 'walk' ? MENU_WALK_HOLD : MENU_ATTACK_PLAY + MENU_ATTACK_TAIL;
}

/** Clock passed to the clip. Walk loops in real time. An attack fills its window, then holds. */
export function menuBeatTime(kind: PoseKind, elapsed: number, span: number): number {
  if (kind === 'walk') return elapsed;
  const u = Math.min(1, Math.max(0, elapsed / MENU_ATTACK_PLAY));
  return u * span;
}

export function selectClip(rig: HeroRig, kind: PoseKind, index = 0): ClipSel {
  switch (kind) {
    case 'walk':
      return rig.walk;
    case 'run':
      return rig.run;
    case 'light':
      return rig.lights[index % rig.lights.length] ?? rig.lights[0]!;
    case 'heavy':
      return rig.heavy;
    case 'charge':
      return rig.charge;
    case 'ability':
      return rig.ability;
    case 'ult':
      return rig.ult;
    case 'block':
      return rig.block;
    case 'dodge':
      return rig.dodge;
    case 'hit':
      return rig.hit;
    case 'death':
      return rig.death;
    default:
      return rig.idle;
  }
}

/** Seconds into the clip for this incoming clock. */
export function clipSeconds(sel: ClipSel, time: number, dur: number): number {
  const a = sel.from * dur;
  const b = Math.max(a + 0.001, sel.to * dur);
  if (sel.loop) {
    const span = b - a;
    const wrapped = ((time % span) + span) % span;
    return a + wrapped;
  }
  if (sel.span <= 0) return Math.min(Math.max(time, a), b);
  const u = Math.min(1, Math.max(0, time / sel.span));
  return a + (b - a) * u;
}

/** KayKit names the stage and the fallback path still pass, when no pose cue came with them. */
export function kindFromClip(clip: string): PoseKind {
  const c = clip.toLowerCase();
  if (c.includes('death') || c.startsWith('lie')) return 'death';
  if (c.includes('hit')) return 'hit';
  if (c.includes('block')) return 'block';
  if (c.includes('dodge')) return 'dodge';
  if (c.includes('run') || c.includes('strafe')) return 'run';
  if (c.includes('walk')) return 'walk';
  return 'idle';
}
