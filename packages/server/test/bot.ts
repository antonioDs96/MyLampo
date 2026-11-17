/**
 * A simple but competent player used by the tests: it walks to the nearest enemy, attacks,
 * dodges or parries telegraphed strikes, executes broken enemies and revives fallen allies.
 */
import {
  Act,
  Btn,
  buildFlow,
  enemyHas,
  ENEMIES,
  ES,
  EState,
  flowDirection,
  HEROES,
  losClear,
  yawOf,
  type EnemySnap,
  type InputCmd,
  type Layout,
  type PlayerState,
  type ProjSnap,
} from '@malampu/shared';

export interface BotView {
  me: PlayerState;
  players: PlayerState[];
  enemies: EnemySnap[];
  projectiles: ProjSnap[];
  /** The fixed map: with it the bot walks around walls and up the stairs. */
  layout?: Layout;
  /** Where to go when nothing is left to fight (the Extraction Portal). */
  goal?: { x: number; z: number };
  /** Ground hazards: the bot walks out of toxic clouds and shockwaves. */
  zones?: { kind: string; x: number; z: number; r: number }[];
}

export class BotBrain {
  private seq = 0;
  private step = 0;
  /** Lets every button be released between presses, as the rules act on fresh presses. */
  private lastButtons = 0;
  private flow: Int16Array | null = null;
  private flowKey = '';
  private flowAge = 0;
  private readonly dir = { x: 0, z: 0 };
  private stuck = 0;
  private lastX = 0;
  private lastZ = 0;
  /**
   * `skill` is the share of telegraphed attacks the bot reacts to (1 = all of them);
   * `react` is how long before a strike lands the bot starts defending, in seconds.
   */
  constructor(
    private readonly skill = 1,
    private readonly react = 0.26,
  ) {}

  idle(): InputCmd {
    this.lastButtons = 0;
    return { seq: ++this.seq, mx: 0, mz: 0, buttons: 0, aim: 0, lock: 0 };
  }

  think(view: BotView): InputCmd {
    this.step++;
    const { me } = view;
    const hero = HEROES[me.hero];
    const cmd: InputCmd = { seq: ++this.seq, mx: 0, mz: 0, buttons: 0, aim: me.yaw, lock: 0 };
    if (me.act === Act.Downed) return this.finish(cmd);

    const alive = view.enemies.filter(
      (e) => e.state !== EState.Dead && !ENEMIES[e.type].dummy && !enemyHas(e.st, ES.Burrow),
    );
    let target: EnemySnap | undefined;
    let best = Infinity;
    for (const e of alive) {
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      // Broken enemies first: executing them is the fastest way through a fight.
      const score = e.state === EState.Broken ? d - 6 : d;
      if (score < best) {
        best = score;
        target = e;
      }
    }

    for (const zone of view.zones ?? []) {
      if (zone.kind !== 'toxic' && zone.kind !== 'shock') continue;
      const zx = me.x - zone.x;
      const zz = me.z - zone.z;
      const zd = Math.hypot(zx, zz);
      if (zd > zone.r + 0.6) continue;
      // Out by the shortest way; from the dead centre, any way.
      cmd.mx = zd > 0.1 ? zx / zd : 1;
      cmd.mz = zd > 0.1 ? zz / zd : 0;
      if (zone.kind === 'shock' && me.stamina >= hero.dodge.cost && me.act !== Act.Dodge) cmd.buttons = Btn.Dodge;
      return this.finish(cmd);
    }

    const danger = this.danger(view, alive);
    if (danger) {
      // Parry what can be parried when facing it, roll away from everything else.
      if (danger.parry && me.stamina > 25) {
        cmd.aim = yawOf(danger.x - me.x, danger.z - me.z);
        cmd.lock = danger.id;
        cmd.buttons = Btn.Block;
        return this.finish(cmd, true);
      }
      if (me.stamina >= hero.dodge.cost && me.act !== Act.Dodge) {
        const dx = me.x - danger.x;
        const dz = me.z - danger.z;
        const len = Math.hypot(dx, dz) || 1;
        // Sideways and back, so a line of enemies does not all follow the same path.
        const side = this.seq % 2 === 0 ? 1 : -1;
        cmd.mx = dx / len + (-dz / len) * 0.6 * side;
        cmd.mz = dz / len + (dx / len) * 0.6 * side;
        cmd.buttons = Btn.Dodge;
        return this.finish(cmd);
      }
    }

    const fallen = view.players.find((p) => p.id !== me.id && p.act === Act.Downed);
    const crowded = alive.some((e) => Math.hypot(e.x - me.x, e.z - me.z) < 4);
    if (fallen && (!crowded || me.act === Act.Revive)) {
      const dx = fallen.x - me.x;
      const dz = fallen.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.6) {
        cmd.mx = dx / d;
        cmd.mz = dz / d;
      } else {
        cmd.buttons = Btn.Interact;
        return this.finish(cmd, true);
      }
      return this.finish(cmd);
    }

    if (!target) {
      const goal = view.goal;
      if (!goal) return this.finish(cmd);
      const gd = Math.hypot(goal.x - me.x, goal.z - me.z);
      if (gd > 2.2) {
        this.walk(view, cmd, goal.x, goal.z);
        return this.finish(cmd);
      }
      cmd.aim = yawOf(goal.x - me.x, goal.z - me.z);
      cmd.buttons = Btn.Interact;
      return this.finish(cmd, true);
    }

    const dx = target.x - me.x;
    const dz = target.z - me.z;
    const d = Math.hypot(dx, dz) || 1;
    cmd.aim = yawOf(dx, dz);
    cmd.lock = target.id;
    const reach = hero.ranged ? 11 : hero.light[0]!.range + ENEMIES[target.type].radius - 0.4;

    if (target.state === EState.Broken && d < 5) {
      cmd.buttons = Btn.Interact;
      return this.finish(cmd);
    }
    const sees = !view.layout || losClear(view.layout, me.x, me.z, target.x, target.z);
    if (d > reach || !sees) {
      this.walk(view, cmd, target.x, target.z);
    } else if (hero.ranged && d < 5) {
      cmd.mx = -dx / d;
      cmd.mz = -dz / d;
    }
    if (d <= reach + 1 && sees) {
      const lightCost = hero.light[me.combo % hero.light.length]!.cost;
      if (me.ult >= 100) cmd.buttons = Btn.Ult;
      else if (me.cd <= 0 && this.step % 7 === 0) cmd.buttons = Btn.Ability;
      else if (me.stamina >= lightCost) cmd.buttons = Btn.Light;
    }
    return this.finish(cmd);
  }

  /** Steers along the flow field toward a point, or straight at it on an open map. */
  private walk(view: BotView, cmd: InputCmd, x: number, z: number): void {
    const { me, layout } = view;
    const dx = x - me.x;
    const dz = z - me.z;
    const d = Math.hypot(dx, dz) || 1;
    cmd.mx = dx / d;
    cmd.mz = dz / d;
    if (!layout) return;
    const key = `${layout.def.id}:${Math.floor(x / 4)}:${Math.floor(z / 4)}`;
    if (!this.flow || key !== this.flowKey || ++this.flowAge > 90) {
      this.flow = buildFlow(layout, x, z, this.flow && this.flow.length === layout.w * layout.h ? this.flow : undefined);
      this.flowKey = key;
      this.flowAge = 0;
    }
    if (d > 3 && flowDirection(layout, this.flow, me.x, me.z, this.dir)) {
      cmd.mx = this.dir.x;
      cmd.mz = this.dir.z;
    }
    // Props are not in the flow field: when a barrel or a pile of rubble blocks the way, slide around it.
    if (me.act === Act.Idle && Math.hypot(me.x - this.lastX, me.z - this.lastZ) < 0.02) this.stuck++;
    else this.stuck = Math.max(0, this.stuck - 2);
    this.lastX = me.x;
    this.lastZ = me.z;
    if (this.stuck > 20) {
      const side = Math.floor(this.step / 90) % 2 === 0 ? 1 : -1;
      const fx = cmd.mx;
      const fz = cmd.mz;
      cmd.mx = fx * 0.3 - fz * side;
      cmd.mz = fz * 0.3 + fx * side;
      if (this.stuck > 80) this.stuck = 0;
    }
  }

  /** Returns the strike about to land on this bot, if any. */
  private danger(view: BotView, alive: EnemySnap[]): { x: number; z: number; id: number; parry: boolean } | null {
    const { me } = view;
    const react = this.react;
    for (const e of alive) {
      if (e.state !== EState.Windup) continue;
      if (!this.notices(e.id * 7919 + Math.round(e.ax * 13 + e.az * 31))) continue;
      const def = ENEMIES[e.type];
      const atk = def.attacks[e.atk];
      if (!atk) continue;
      const left = atk.windup - e.t;
      if (left > react || left < -0.05) continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      const hitsMe = atk.aoe
        ? Math.hypot(e.ax - me.x, e.az - me.z) < atk.aoe + 1.2
        : atk.proj
          ? d < atk.proj.range
          : d < atk.reach + atk.lunge + def.radius + 0.8;
      if (!hitsMe) continue;
      return { x: e.x, z: e.z, id: e.id, parry: atk.kind === 'blue' && !atk.proj && !atk.aoe };
    }
    for (const p of view.projectiles) {
      if (p.owner || !this.notices(p.id * 104729)) continue;
      const rx = me.x - p.x;
      const rz = me.z - p.z;
      const along = rx * p.dx + rz * p.dz;
      if (along < 0 || along > p.speed * react) continue;
      const off = Math.abs(rx * -p.dz + rz * p.dx);
      if (off < 1.4) return { x: p.x, z: p.z, id: 0, parry: false };
    }
    return null;
  }

  /** A bot with skill below 1 misses a fixed share of the telegraphs, like a distracted player. */
  private notices(key: number): boolean {
    if (this.skill >= 1) return true;
    let h = Math.imul(key | 0, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 1000 < this.skill;
  }

  private finish(cmd: InputCmd, hold = false): InputCmd {
    // Taps alternate with a released step; holds (guard, revive) stay down.
    if (!hold && cmd.buttons !== 0 && cmd.buttons === this.lastButtons) cmd.buttons = 0;
    this.lastButtons = cmd.buttons;
    return cmd;
  }
}
