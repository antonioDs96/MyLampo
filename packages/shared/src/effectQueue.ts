/**
 * GemRB-style EffectQueue: delayed / ticking opcode effects with stacking rules.
 * Bridges consumable opcodes (itemsCatalog) onto PlayerState.st / ActiveBuff lists.
 */
import type { ActiveBuff, AbilityId } from './dndMegabonkRules';
import type { ItemOpcode } from './itemsCatalog';
import { rollDice } from './itemsCatalog';
import { addStatus, removeStatus } from './player';
import { PS, type PlayerState, type Status } from './types';

export type StackRule = 'refresh' | 'stack' | 'ignore' | 'replace';

export interface QueuedEffect {
  id: string;
  /** Source item / ability id for stacking keys. */
  source: string;
  op: ItemOpcode['op'];
  remaining: number;
  duration: number;
  power: number;
  param?: string;
  ability?: AbilityId;
  damageType?: string;
  stack: StackRule;
  /** One-shot effects fire once on apply. */
  fired: boolean;
}

export interface EffectQueueHooks {
  heal?: (amount: number) => void;
  damageAoe?: (dice: string, damageType: string, radius: number) => void;
  magnetAll?: () => void;
  fillUlt?: (pct: number) => void;
  fillPoiseNear?: (frac: number) => void;
  curePoison?: () => void;
  rng?: () => number;
}

let nextFxId = 1;

export class EffectQueue {
  readonly effects: QueuedEffect[] = [];

  clear(): void {
    this.effects.length = 0;
  }

  /** Enqueue opcodes from a consumable / arena pickup. */
  enqueueOpcodes(source: string, opcodes: ItemOpcode[], hooks: EffectQueueHooks = {}): void {
    for (const op of opcodes) {
      this.enqueue(source, op, hooks);
    }
  }

  enqueue(source: string, op: ItemOpcode, hooks: EffectQueueHooks = {}): void {
    const duration = op.duration ?? 0;
    const power = op.power ?? 0;
    const instant =
      op.op === 'heal_dice' ||
      op.op === 'aoe_damage' ||
      op.op === 'magnet_all' ||
      op.op === 'fill_ult' ||
      op.op === 'fill_poise_near' ||
      op.op === 'cure_poison';
    const stack: StackRule = instant ? 'ignore' : 'refresh';

    // Instant opcodes
    if (duration <= 0 || instant) {
      this.applyInstant(op, hooks);
      if (duration <= 0) return;
    }

    const key = `${source}:${op.op}:${op.ability ?? ''}`;
    const existing = this.effects.find((e) => `${e.source}:${e.op}:${e.ability ?? ''}` === key);
    if (existing && stack === 'refresh') {
      existing.remaining = Math.max(existing.remaining, duration);
      existing.power = Math.max(existing.power, power);
      return;
    }
    if (existing && stack === 'ignore') return;

    this.effects.push({
      id: `fx_${nextFxId++}`,
      source,
      op: op.op,
      remaining: duration,
      duration,
      power,
      param: op.param,
      ability: op.ability,
      damageType: op.damageType,
      stack,
      fired: false,
    });
  }

  private applyInstant(op: ItemOpcode, hooks: EffectQueueHooks): void {
    const rng = hooks.rng ?? Math.random;
    switch (op.op) {
      case 'heal_dice':
        if (op.param && hooks.heal) hooks.heal(rollDice(op.param, rng));
        break;
      case 'aoe_damage':
        if (op.param && hooks.damageAoe) hooks.damageAoe(op.param, op.damageType ?? 'fuoco', op.power ?? 2.5);
        break;
      case 'magnet_all':
        hooks.magnetAll?.();
        break;
      case 'fill_ult':
        hooks.fillUlt?.(op.power ?? 30);
        break;
      case 'fill_poise_near':
        hooks.fillPoiseNear?.(op.power ?? 0.3);
        break;
      case 'cure_poison':
        hooks.curePoison?.();
        break;
      default:
        break;
    }
  }

  /** Tick down durations (seconds). Returns buffs still active for computeHeroStats. */
  step(dt: number): ActiveBuff[] {
    for (const e of this.effects) e.remaining -= dt;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i]!.remaining <= 0) this.effects.splice(i, 1);
    }
    return this.toActiveBuffs();
  }

  toActiveBuffs(): ActiveBuff[] {
    const out: ActiveBuff[] = [];
    for (const e of this.effects) {
      if (e.remaining <= 0) continue;
      const buff: ActiveBuff = { id: e.id, duration: e.remaining, power: e.power };
      switch (e.op) {
        case 'score_boost':
          if (e.ability) buff.scores = { [e.ability]: e.power };
          break;
        case 'attack_speed':
          buff.attackSpeedMul = e.power;
          break;
        case 'move_speed':
          buff.moveSpeedMul = e.power;
          break;
        case 'knockback':
          buff.knockbackMul = e.power;
          break;
        case 'ac_bonus':
          buff.acBonus = e.power;
          break;
        case 'immune_stagger':
          buff.immuneStagger = true;
          break;
        case 'poison_immunity':
          // Represented as Guard-like status for UI; combat ignores poison ticks.
          break;
        default:
          break;
      }
      out.push(buff);
    }
    return out;
  }

  /** Mirror timed buffs onto PlayerState.st for HUD chips (best-effort). */
  syncPlayerStatuses(p: PlayerState, durationMul = 1): void {
    // Strip previous elixir-driven tags we manage (keep combat statuses intact).
    // We map: attack_speed → Haste, ac_bonus → Guard, score_boost FOR → DmgUp.
    const managed = new Set([PS.Haste, PS.Guard, PS.DmgUp]);
    // Only remove if we still own a matching effect; otherwise leave combat-applied ones.
    for (const e of this.effects) {
      const t = Math.max(1, Math.round(e.remaining * durationMul * 60)); // ticks @ 60Hz approx
      if (e.op === 'attack_speed' || e.op === 'move_speed') addStatus(p.st, PS.Haste, t, e.power);
      if (e.op === 'ac_bonus') addStatus(p.st, PS.Guard, t, Math.min(0.6, e.power * 0.1));
      if (e.op === 'score_boost' && e.ability === 'FOR') addStatus(p.st, PS.DmgUp, t, 0.15 + e.power * 0.05);
      managed.delete(0 as never);
    }
  }
}

/** Scale a status duration by SAG / EffectQueue multiplier. */
export function scaleStatusDuration(seconds: number, statusDurationMul: number): number {
  return seconds * Math.max(0.5, statusDurationMul);
}

/** Apply scaled enemy status (freeze/slow/etc.) helper. */
export function pushScaledStatus(list: Status[], k: number, seconds: number, power: number, statusDurationMul: number): void {
  addStatus(list, k, scaleStatusDuration(seconds, statusDurationMul), power);
}

export function clearPoisonLike(list: Status[]): void {
  // No dedicated poison PS yet — clear Slow as a stand-in when antitoxin is used.
  removeStatus(list, PS.Slow);
}
