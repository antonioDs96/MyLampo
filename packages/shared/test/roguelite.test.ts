import { describe, expect, it } from 'vitest';
import {
  abilityMods,
  abilityTooltip,
  applyBlueprintBuild,
  catalogEffects,
  Act,
  afterWipe,
  bountiesUnlocked,
  BOUNTIES,
  buyCosmetic,
  buyNode,
  CELL,
  channelTime,
  REGION,
  companyBonus,
  cooldownAccel,
  COSMETICS,
  deathTax,
  DROP_TABLE,
  emptyProfile,
  emptyTree,
  ENEMIES,
  equipCosmetic,
  ES,
  EState,
  getStatus,
  fairShare,
  fervorBonus,
  FLOOD_DRY,
  hasStatus,
  HEROES,
  HERO_STATS,
  heroStatLines,
  judgeBounty,
  MemoryProfileArchive,
  naturalArmor,
  nodeCost,
  parseLayout,
  PS,
  regionBossUnlocked,
  respecTree,
  rollDrops,
  sanitizeProfile,
  shadowSpawnCount,
  statIframeBonus,
  statSpeedMul,
  TICK_HZ,
  TUNING,
  treeSpent,
  World,
  yawOf,
  zergDamage,
  type EnemyState,
  type GameEvent,
  type HeroId,
  type LayoutDef,
  type StageLog,
} from '../src';
import { Btn, cmd, makeWorld, run, tap } from './helpers';

const T = (s: number) => Math.ceil(s * TICK_HZ);
const ALL_HEROES = Object.keys(HEROES) as HeroId[];

function events<K extends GameEvent['e']>(world: World, kind: K): Extract<GameEvent, { e: K }>[] {
  return world.events.filter((e) => e.e === kind) as Extract<GameEvent, { e: K }>[];
}

function passive(world: World, type: EnemyState['type'], x: number, z: number): EnemyState {
  const e = world.spawnEnemy(type, x, z);
  e.state = EState.Chase;
  e.cool = 999;
  return e;
}

/** A small Environment: landing, a shrine in a basin, a chest on a tower, a Mini-Boss and its portal. */
const MINI: LayoutDef = {
  id: 'mini',
  name: 'Mini',
  theme: 'alley',
  rows: [
    '#############',
    '#PPPPPPPPP..#',
    '#...........#',
    '#.___....^+.#',
    '#._S_....^C.#',
    '#.___....^+.#',
    '#....s......#',
    '#...........#',
    '#.....B.....#',
    '#...........#',
    '#.....X.....#',
    '#############',
  ],
  roster: { mobs: ['predone_sahuagin'], elites: ['nostromo_senzocchi'], boss: 'quartiermastro' },
};

function miniWorld(heroes: HeroId[] = ['jusef'], streak = 0): World {
  const world = new World({ layout: parseLayout(MINI), seed: 5, streak });
  heroes.forEach((h, i) => world.addPlayer(`p${i}`, h, i));
  return world;
}

function hold(world: World, id: string, seconds: number, buttons: number): void {
  for (let i = 0; i < T(seconds); i++) {
    world.applyCommand(id, cmd({ buttons }));
    if (i % 3 === 2) world.step(1 / 20);
  }
}

describe('fixed hero hardware', () => {
  it('heroes have no level or XP: only fixed base stats', () => {
    const p = makeWorld().addPlayer('a', 'jusef', 0) as unknown as Record<string, unknown>;
    expect(p.level).toBeUndefined();
    expect(p.xp).toBeUndefined();
    for (const h of ALL_HEROES) {
      expect(HERO_STATS[h], h).toBeDefined();
      expect(heroStatLines(h).length, h).toBeGreaterThanOrEqual(3);
    }
  });

  it('Destrezza gives speed and dodge i-frames', () => {
    expect(statSpeedMul('albereth')).toBeGreaterThan(statSpeedMul('alexios'));
    expect(statIframeBonus('rycard')).toBeGreaterThan(statIframeBonus('alexios'));
  });

  it('Costituzione gives Natural Armor against melee only', () => {
    expect(naturalArmor('alexios')).toBeGreaterThan(naturalArmor('gabryel'));
    const hit = (hero: HeroId, attack: string, type: EnemyState['type']) => {
      const world = makeWorld();
      const p = world.addPlayer('a', hero, 0);
      const e = passive(world, type, p.x, p.z + 2.4);
      const def = ENEMIES[type];
      e.state = EState.Windup;
      e.t = 0;
      e.atk = def.attacks.findIndex((a) => a.id === attack);
      e.struck = 0;
      e.n = 1;
      e.target = p.id;
      e.yaw = yawOf(p.x - e.x, p.z - e.z);
      e.ax = p.x;
      e.az = p.z;
      const hp = p.hp;
      for (let i = 0; i < 60 && p.hp === hp; i++) world.step(0.05);
      return hp - p.hp;
    };
    const steel = ENEMIES.predone_sahuagin.attacks[0]!.dmg * TUNING.threatMul;
    expect(hit('alexios', 'tridente', 'predone_sahuagin')).toBe(Math.round(steel * (1 - naturalArmor('alexios'))));
    // A spell goes straight through the stone.
    const ink = ENEMIES.sciame_polpi.attacks[1]!.dmg * TUNING.threatMul;
    expect(hit('alexios', 'inchiostro', 'sciame_polpi')).toBe(Math.round(ink));
  });

  it('Intelligenza speeds up [E] and [R]', () => {
    expect(cooldownAccel('gabryel')).toBeGreaterThan(cooldownAccel('vyncent'));
    const world = makeWorld();
    const mage = world.addPlayer('a', 'gabryel', 0);
    const wolf = world.addPlayer('b', 'vyncent', 1);
    expect(mage.cdMul).toBeLessThan(wolf.cdMul);
    expect(mage.ultMul).toBeGreaterThan(wolf.ultMul);
  });

  it('the Ultimate recharges with time, not with damage', () => {
    const world = makeWorld();
    const p = world.addPlayer('a', 'jusef', 0);
    expect(p.ult).toBe(0);
    run(world, 'a', T(5));
    const expected = (100 / HEROES.jusef.ult.cd) * 5 * p.ultMul;
    expect(p.ult).toBeGreaterThan(expected * 0.9);
    expect(p.ult).toBeLessThan(expected * 1.1);
    const before = p.ult;
    const e = passive(world, 'predone_sahuagin', p.x, p.z + 2);
    world.damageEnemy(e, 30, 0, p, {});
    expect(p.ult).toBe(before);
  });
});

describe('skill tree', () => {
  it('uses the handoff gem tables', () => {
    expect(nodeCost('e', 1)).toBe(30);
    expect(nodeCost('e', 7)).toBe(180);
    expect(nodeCost('r', 1)).toBe(80);
    expect(nodeCost('r', 7)).toBe(950);
    expect(nodeCost('r', 7)).toBeGreaterThan(nodeCost('r', 1));
  });

  it('locks the branch at tier 3 and a respec refunds everything', () => {
    const profile = emptyProfile();
    profile.gems = 5000;
    expect(buyNode(profile, 'jusef', 'e', '').ok).toBe(true);
    expect(buyNode(profile, 'jusef', 'e', '').ok).toBe(true);
    expect(buyNode(profile, 'jusef', 'e', 'A').ok).toBe(true);
    expect(buyNode(profile, 'jusef', 'e', 'B').ok).toBe(false);
    expect(buyNode(profile, 'jusef', 'r', '').ok).toBe(true);
    const spent = treeSpent('jusef', profile.trees.jusef!);
    expect(profile.gems).toBe(5000 - spent);
    expect(respecTree(profile, 'jusef')).toBe(spent);
    expect(profile.gems).toBe(5000);
    expect(profile.trees.jusef).toEqual(emptyTree());
  });

  it('lets Iej sell a wind after the branch, and the next grade of that wind', () => {
    const profile = emptyProfile();
    profile.gems = 5000;
    expect(buyNode(profile, 'jusef', 'e', '').ok).toBe(true);
    expect(buyNode(profile, 'jusef', 'e', '').ok).toBe(true);
    expect(buyNode(profile, 'jusef', 'e', 'A').ok).toBe(true);
    expect(buyNode(profile, 'jusef', 'e', 'A').ok).toBe(true);
    expect(buyNode(profile, 'jusef', 'e', 'SCIROCCO').ok).toBe(true);
    expect(profile.trees.jusef!.e).toEqual({ tier: 5, branch: 'A', wind: 'SCIROCCO' });
    expect(buyNode(profile, 'jusef', 'e', 'TRAMONTANA').ok).toBe(false);
    expect(buyNode(profile, 'jusef', 'e', 'SCIROCCO').ok).toBe(true);
    expect(profile.trees.jusef!.e.tier).toBe(6);
  });

  it('names the ability bound to each key', () => {
    const bare = emptyTree();
    expect(abilityTooltip('albereth', 'e', bare).name).toBe("Passo d'Ombra");
    expect(abilityTooltip('albereth', 'r', bare).name).toBe("Melodia dell'Inganno");
    expect(abilityTooltip('jusef', 'e', bare).name).toBe('Canto di Ristoro');
    expect(abilityTooltip('dalith', 'e', bare).name).toBe('Rotazione dei Veli');
    expect(abilityTooltip('dalith', 'r', bare).name).toBe('Danza della Memoria');
  });

  it('applies the blueprint without stopping on the wind', () => {
    const profile = emptyProfile();
    profile.gems = 5000;
    expect(applyBlueprintBuild(profile, 'jusef').ok).toBe(true);
    expect(profile.trees.jusef!.e).toMatchObject({ tier: 5, branch: 'A', wind: 'SCIROCCO' });
    expect(profile.trees.jusef!.r).toMatchObject({ tier: 4, branch: 'A' });
    expect(profile.trees.jusef!.passive).toBe(2);
    expect(profile.trees.jusef!.keystone).toBe(true);
  });

  it('cannot buy without Gems', () => {
    const profile = emptyProfile();
    profile.gems = 0;
    expect(buyNode(profile, 'jusef', 'r', '').ok).toBe(false);
    expect(profile.trees.jusef).toBeUndefined();
  });

  it('folds catalog statuses into the effects a cast will apply', () => {
    const haste = abilityMods('jusef', 'e', { tier: 2, branch: '', wind: '' });
    const bleed = catalogEffects('jusef', 'e', { tier: 5, branch: 'A', wind: 'SCIROCCO' });
    const shield = catalogEffects('jusef', 'e', { tier: 3, branch: 'C', wind: '' });
    expect(haste.haste).toBeGreaterThan(1);
    expect(bleed.enemy.bleedDps).toBe(3);
    expect(bleed.enemy.vulnerable).toBeGreaterThan(0);
    expect(shield.party.shieldHp).toBe(6);
    expect(catalogEffects('jusef', 'e', { tier: 5, branch: 'A', wind: 'SCIROCCO' }).enemy.vulnerable).toBeLessThanOrEqual(0.15);
  });

  it('lands the bought branch on the fight', () => {
    const tree = {
      passive: 0,
      keystone: false,
      e: { tier: 5, branch: 'A' as const, wind: 'SCIROCCO' },
      r: { tier: 0, branch: '' as const, wind: '' },
    };
    const world = makeWorld();
    const p = world.addPlayer('a', 'jusef', 0, { tree });
    const enemy = world.spawnEnemy('corsaro_annegato', p.x + 2, p.z);
    enemy.state = EState.Chase;
    enemy.cool = 999;
    tap(world, 'a', Btn.Ability);
    run(world, 'a', Math.ceil(HEROES.jusef.ability.dur * 60) + 4);
    expect(getStatus(enemy.st, ES.Bleed)?.p).toBe(3);
    expect(getStatus(enemy.st, ES.Vulnerable)?.p).toBeCloseTo(0.08);
  });

  it('raises the catalog barrier on the party', () => {
    const tree = {
      passive: 0,
      keystone: false,
      e: { tier: 3, branch: 'C' as const, wind: '' },
      r: { tier: 0, branch: '' as const, wind: '' },
    };
    const world = makeWorld();
    const p = world.addPlayer('a', 'jusef', 0, { tree });
    tap(world, 'a', Btn.Ability);
    run(world, 'a', Math.ceil(HEROES.jusef.ability.dur * 60) + 4);
    expect(getStatus(p.st, PS.Barrier)?.p).toBe(6);
    expect(getStatus(p.st, PS.Stamina)?.p).toBe(12);
  });

  it('equipped nodes shorten the cooldown in the world and show in the tooltip', () => {
    const tree = { passive: 0, keystone: false, e: { tier: 2, branch: '' as const, wind: '' }, r: { tier: 0, branch: '' as const, wind: '' } };
    const world = makeWorld();
    const plain = world.addPlayer('a', 'jusef', 0);
    const tuned = world.addPlayer('b', 'jusef', 1, { tree });
    expect(tuned.cdMul).toBeLessThan(plain.cdMul);
    const base = abilityTooltip('jusef', 'e', emptyTree());
    const tip = abilityTooltip('jusef', 'e', tree);
    expect(tip.cooldown).toBeLessThan(base.cooldown);
    expect(tip.recap.length).toBeGreaterThan(0);
    for (const h of ALL_HEROES) {
      for (const slot of ['e', 'r'] as const) {
        const t = abilityTooltip(h, slot, emptyTree());
        expect(t.cooldown, `${h} ${slot}`).toBeGreaterThan(0);
        expect(t.name.length, `${h} ${slot}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('economy', () => {
  const always = () => 0;
  const never = () => 0.999;

  it('follows the GDD drop tables', () => {
    expect(DROP_TABLE.base.gemChance).toEqual([0.05, 0.1]);
    expect(DROP_TABLE.base.gems).toEqual([1, 3]);
    expect(DROP_TABLE.base.threadChance).toBe(0);
    expect(DROP_TABLE.elite.gemChance).toEqual([1, 1]);
    expect(DROP_TABLE.elite.gems).toEqual([10, 20]);
    expect(DROP_TABLE.elite.threadChance).toBe(0.05);
    expect(DROP_TABLE.mini.gems).toEqual([50, 80]);
    expect(DROP_TABLE.mini.threadChance).toBe(0.15);
    expect(DROP_TABLE.mini.threads).toEqual([1, 3]);
    expect(DROP_TABLE.city.gems[0]).toBeGreaterThanOrEqual(300);
    expect(DROP_TABLE.city.threadChance).toBe(1);
    expect(DROP_TABLE.city.threads).toEqual([15, 30]);
    expect(DROP_TABLE.region.gems[0]).toBeGreaterThanOrEqual(1000);
  });

  it('base mobs never drop Fili, elites always drop Gemme', () => {
    expect(rollDrops('base', { humans: 9, streak: 3 }, always).threads).toBe(0);
    expect(rollDrops('base', { humans: 1, streak: 0 }, never).gems).toBe(0);
    const e = rollDrops('elite', { humans: 1, streak: 0 }, never);
    expect(e.gems).toBeGreaterThanOrEqual(10);
    expect(e.gems).toBeLessThanOrEqual(20);
  });

  it('the company bonus is +10% per extra human, capped at +30%', () => {
    expect(companyBonus(1)).toBe(0);
    expect(companyBonus(2)).toBeCloseTo(0.1);
    expect(companyBonus(4)).toBeCloseTo(0.3);
    expect(companyBonus(9)).toBeCloseTo(0.3);
  });

  it('Fervor multiplies loot by +20%, +50%, +100%', () => {
    expect([0, 1, 2, 3, 7].map(fervorBonus)).toEqual([0, 0.2, 0.5, 1, 1]);
    const plain = rollDrops('mini', { humans: 1, streak: 0 }, always).gems;
    expect(rollDrops('mini', { humans: 1, streak: 1 }, always).gems).toBe(Math.round(plain * 1.2));
    expect(rollDrops('mini', { humans: 1, streak: 3 }, always).gems).toBe(plain * 2);
  });

  it('the Death Tax burns 30% of the failed Environment only', () => {
    expect(deathTax({ gems: 100, threads: 10 })).toEqual({ gems: 30, threads: 3 });
    expect(afterWipe({ gems: 200, threads: 4 }, { gems: 100, threads: 10 })).toEqual({ gems: 270, threads: 11 });
  });
});

describe('instanced loot', () => {
  it('every hero gets a private drop that only they can pick up', () => {
    const world = miniWorld(['jusef', 'alexios']);
    const [a, b] = [world.players.get('p0')!, world.players.get('p1')!];
    a.x = 3 * CELL;
    a.z = 7 * CELL;
    b.x = 10 * CELL;
    b.z = 7 * CELL;
    const e = passive(world, 'nostromo_senzocchi', 9.5 * CELL, 7 * CELL);
    world.damageEnemy(e, 9999, 0, a, { raw: true });
    const drops = events(world, 'drop');
    expect(drops.filter((d) => d.kind === 'gem').map((d) => d.to).sort()).toEqual(['p0', 'p1']);
    // Alexios stands on the loot; Jusef is far away.
    for (let i = 0; i < 40; i++) world.step(0.05);
    expect(world.satchelOf('p1').gems).toBeGreaterThanOrEqual(10);
    expect(world.satchelOf('p0').gems).toBe(0);
    expect(world.drops.every((d) => d.owner === 'p0')).toBe(true);
    expect(events(world, 'take').every((t) => t.to === 'p1')).toBe(true);
  });

  it('a Mini-Boss always leaves a healing orb worth 25% of max HP', () => {
    const world = miniWorld(['alexios']);
    const p = world.players.get('p0')!;
    const boss = world.enemies.find((e) => e.id === world.bossId)!;
    p.x = boss.x;
    p.z = boss.z - 2;
    p.hp = 20;
    world.damageEnemy(boss, 99999, 0, p, { raw: true });
    expect(events(world, 'drop').some((d) => d.kind === 'orb')).toBe(true);
    for (let i = 0; i < 40; i++) world.step(0.05);
    expect(p.hp).toBeGreaterThanOrEqual(20 + Math.floor(p.maxHp * 0.25));
    expect(world.satchelOf('p0').gems).toBeGreaterThanOrEqual(50);
  });
});

describe('points of interest', () => {
  it('the portal is sealed until the Mini-Boss falls, then one channel opens the Choice Terminal', () => {
    const world = miniWorld();
    const p = world.players.get('p0')!;
    const portal = world.pois.find((o) => o.kind === 'portal')!;
    expect(portal.state).toBe(0);
    p.x = portal.x;
    p.z = portal.z - 1.5;
    hold(world, 'p0', 1.5, Btn.Interact);
    expect(world.portalBy).toBe('');
    hold(world, 'p0', 0.1, 0);
    const boss = world.enemies.find((e) => e.id === world.bossId)!;
    world.damageEnemy(boss, 99999, 0, null, { raw: true });
    expect(world.bossDead).toBe(true);
    expect(portal.state).toBe(1);
    expect(events(world, 'clear')).toHaveLength(1);
    hold(world, 'p0', channelTime('portal') + 0.3, Btn.Interact);
    expect(world.portalBy).toBe('p0');
    world.reopenPortal();
    expect(world.portalBy).toBe('');
    expect(portal.state).toBe(1);
  });

  it('a Synergy Chest needs a full defenceless channel and buffs the whole party', () => {
    const world = miniWorld(['jusef', 'alexios']);
    const p = world.players.get('p0')!;
    const chest = world.pois.find((o) => o.kind === 'chest')!;
    p.x = chest.x - 2;
    p.z = chest.z;
    // Letting go early opens nothing.
    hold(world, 'p0', channelTime('chest') * 0.5, Btn.Interact);
    expect(p.act).toBe(Act.Channel);
    hold(world, 'p0', 0.2, 0);
    expect(p.act).not.toBe(Act.Channel);
    expect(world.synergy).toHaveLength(0);
    // A blow breaks the channel.
    hold(world, 'p0', 1, Btn.Interact);
    expect(p.act).toBe(Act.Channel);
    const e = passive(world, 'predone_sahuagin', p.x, p.z + 2.2);
    e.state = EState.Windup;
    e.t = 0;
    e.atk = 0;
    e.struck = 0;
    e.n = 1;
    e.target = p.id;
    e.ax = p.x;
    e.az = p.z;
    e.yaw = Math.PI;
    for (let i = 0; i < 30 && p.act === Act.Channel; i++) world.step(0.05);
    expect(p.act).not.toBe(Act.Channel);
    expect(world.synergy).toHaveLength(0);
    world.damageEnemy(e, 9999, 0, null, { raw: true });
    hold(world, 'p0', 1, 0);
    p.x = chest.x - 2;
    p.z = chest.z;
    hold(world, 'p0', channelTime('chest') + 0.4, Btn.Interact);
    expect(world.synergy).toHaveLength(1);
    expect(chest.state).toBe(2);
    expect(events(world, 'synergy')).toHaveLength(1);
  });

  it('a Sanctuary lights a healing circle in its basin', () => {
    const world = miniWorld();
    const p = world.players.get('p0')!;
    const shrine = world.pois.find((o) => o.kind === 'shrine')!;
    p.x = shrine.x + 1.5;
    p.z = shrine.z;
    p.hp = 10;
    hold(world, 'p0', channelTime('shrine') + 0.3, Btn.Interact);
    expect(world.zones.some((z) => z.kind === 'shrine')).toBe(true);
    for (let i = 0; i < 60; i++) world.step(0.05);
    expect(p.hp).toBeGreaterThan(10);
    expect(shrine.state).toBe(2);
  });
});

describe('momentum', () => {
  it('repeated hits fill the meter and thresholds grant buffs', () => {
    const world = makeWorld();
    const p = world.addPlayer('a', 'jusef', 0);
    const e = passive(world, 'idra_carsica', p.x, p.z + 3);
    for (let i = 0; i < 40; i++) world.damageEnemy(e, 1, 0, p, { basic: true });
    world.step(0.05);
    expect(p.fury).toBe(TUNING.furyMax);
    expect(hasStatus(p.st, PS.Frenzy)).toBe(true);
    expect(hasStatus(p.st, PS.Keen)).toBe(true);
    expect(hasStatus(p.st, PS.Surge)).toBe(true);
    expect(hasStatus(p.st, PS.Leech)).toBe(true);
    expect(events(world, 'fury').map((f) => f.tier)).toEqual([1, 2, 3, 4]);
  });

  it('the meter decays when the fight stops', () => {
    const world = makeWorld();
    const p = world.addPlayer('a', 'jusef', 0);
    const e = passive(world, 'idra_carsica', p.x, p.z + 3);
    for (let i = 0; i < 10; i++) world.damageEnemy(e, 1, 0, p, { basic: true });
    const full = p.fury;
    for (let i = 0; i < 20 * (TUNING.furyHold + 2); i++) world.step(0.05);
    expect(p.fury).toBeLessThan(full);
  });

  it('a new Environment starts from zero: no meter, no Synergy', () => {
    const first = miniWorld();
    const p = first.players.get('p0')!;
    p.fury = 80;
    first.synergy.push('might');
    const next = miniWorld();
    const q = next.addPlayer('p0', 'jusef', 0, { hp: 33 });
    expect(q.fury).toBe(0);
    expect(next.synergy).toHaveLength(0);
    expect(q.st).toHaveLength(0);
    // Wounds persist.
    expect(q.hp).toBe(33);
  });
});

describe('nine-player scaling', () => {
  it('shadow spawns stay dormant for four heroes and wake for five or more', () => {
    expect(shadowSpawnCount(4)).toBe(0);
    expect(shadowSpawnCount(5)).toBeGreaterThan(0);
    expect(shadowSpawnCount(9)).toBeGreaterThanOrEqual(shadowSpawnCount(5));
    const count = (heroes: HeroId[]) => {
      const world = miniWorld(heroes);
      world.players.get('p0')!.z = 6 * CELL;
      const before = world.enemies.length;
      for (let i = 0; i < 40; i++) world.step(0.05);
      return world.enemies.length - before;
    };
    expect(count(['jusef', 'alexios', 'rycard', 'fabyorn'])).toBe(0);
    expect(count(['jusef', 'alexios', 'rycard', 'fabyorn', 'gabryel'])).toBeGreaterThan(0);
  });

  it('aggro fragments: a fair share of the pack per hero', () => {
    expect(fairShare(9, 9)).toBe(1);
    expect(fairShare(12, 3)).toBe(4);
    const world = makeWorld();
    const heroes: HeroId[] = ['jusef', 'alexios', 'rycard'];
    heroes.forEach((h, i) => {
      const p = world.addPlayer(`p${i}`, h, i);
      p.x = (2 + i * 3) * CELL;
      p.z = 3 * CELL;
    });
    const foes: EnemyState[] = [];
    for (let i = 0; i < 6; i++) {
      const e = world.spawnEnemy('predone_sahuagin', (2 + i) * CELL, 7 * CELL);
      e.state = EState.Chase;
      e.cool = 99;
      e.retarget = 0;
      foes.push(e);
    }
    for (let i = 0; i < 10; i++) world.step(0.05);
    const targets = new Set(foes.map((e) => e.target));
    expect(targets.size).toBe(3);
  });

  it('a boss answers a knot of heroes with a shockwave that grows exponentially', () => {
    expect(zergDamage(10, 2) / zergDamage(10, 1)).toBeCloseTo(TUNING.zergGrowth);
    expect(zergDamage(10, 6)).toBeGreaterThan(zergDamage(10, 3) * 2);
    const blast = (n: number) => {
      const world = makeWorld();
      const heroes: HeroId[] = ['alexios', 'vyncent', 'fabyorn', 'jusef', 'dalith', 'albereth'];
      const boss = passive(world, 'quartiermastro', 5 * CELL, 5 * CELL);
      for (let i = 0; i < n; i++) {
        const p = world.addPlayer(`p${i}`, heroes[i]!, i);
        p.x = boss.x + Math.sin(i) * 3;
        p.z = boss.z + Math.cos(i) * 3;
      }
      const first = world.players.get('p0')!;
      const hp = first.hp;
      for (let i = 0; i < 160 && first.hp === hp; i++) world.step(0.05);
      return { lost: hp - first.hp, shock: events(world, 'ecast').some((e) => e.what === 'shock') };
    };
    expect(blast(2).shock).toBe(false);
    const three = blast(3);
    const six = blast(6);
    expect(three.shock).toBe(true);
    expect(three.lost).toBeGreaterThan(0);
    expect(six.lost).toBeGreaterThan(three.lost * 2);
  });

  it('bosses become immune to crowd control after the first one lands', () => {
    const world = makeWorld();
    const p = world.addPlayer('a', 'fabyorn', 0);
    const boss = passive(world, 'quartiermastro', p.x, p.z + 3);
    world.damageEnemy(boss, 1, 0, p, { effect: 'freeze' });
    expect(hasStatus(boss.st, ES.Ward)).toBe(true);
    world.damageEnemy(boss, 1, 0, p, { effect: 'freeze' });
    expect(events(world, 'immune')).toHaveLength(1);
  });
});

describe('Costa Est bestiary', () => {
  it('Corsari Annegati shrug off physical blows from the front, not spells', () => {
    const world = makeWorld();
    const p = world.addPlayer('a', 'alexios', 0);
    const front = passive(world, 'corsaro_annegato', p.x, p.z + 2);
    front.yaw = Math.PI;
    world.damageEnemy(front, 40, 0, p, { raw: false, basic: true });
    const physical = front.maxHp - front.hp;
    const other = passive(world, 'corsaro_annegato', p.x + 3, p.z + 2);
    other.yaw = Math.PI;
    world.damageEnemy(other, 40, 0, p, { magic: true });
    const magic = other.maxHp - other.hp;
    expect(physical).toBeLessThan(magic);
  });

  it('Granchi di Pietra burrow only in the low channels', () => {
    const world = miniWorld();
    const p = world.players.get('p0')!;
    p.x = 7 * CELL;
    p.z = 2 * CELL;
    const low = passive(world, 'granchio_pietra', 2.5 * CELL, 3.5 * CELL);
    const flat = passive(world, 'granchio_pietra', 6.5 * CELL, 6.5 * CELL);
    low.target = p.id;
    flat.target = p.id;
    for (let i = 0; i < 6; i++) world.step(0.05);
    expect(hasStatus(low.st, ES.Burrow)).toBe(true);
    expect(hasStatus(flat.st, ES.Burrow)).toBe(false);
  });

  it("the Nostromo's harpoon drags a hero camping at +2 down to elevation 0", () => {
    const world = miniWorld();
    const p = world.players.get('p0')!;
    const chest = world.pois.find((o) => o.kind === 'chest')!;
    p.x = chest.x;
    p.z = chest.z - CELL;
    const e = passive(world, 'nostromo_senzocchi', 5.5 * CELL, 6.5 * CELL);
    e.cool = 0;
    e.target = p.id;
    for (let i = 0; i < 120 && events(world, 'hook').length === 0; i++) world.step(0.05);
    expect(events(world, 'hook')).toHaveLength(1);
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    expect(world.layout.elev[cz * world.layout.w + cx]).toBe(0);
  });

  it('the Madre delle Spore leaves persistent toxic clouds', () => {
    const world = makeWorld();
    const p = world.addPlayer('a', 'jusef', 0);
    const e = passive(world, 'madre_spore', p.x, p.z + 12);
    const idx = ENEMIES.madre_spore.attacks.findIndex((a) => a.special === 'spores');
    e.state = EState.Windup;
    e.t = 0;
    e.atk = idx;
    e.struck = 0;
    e.n = 1;
    e.target = p.id;
    e.ax = p.x;
    e.az = p.z;
    for (let i = 0; i < 60 && !world.zones.some((z) => z.kind === 'toxic'); i++) world.step(0.05);
    const cloud = world.zones.find((z) => z.kind === 'toxic')!;
    expect(cloud).toBeDefined();
    expect(cloud.dur).toBeGreaterThanOrEqual(6);
    const hp = p.hp;
    p.x = cloud.x;
    p.z = cloud.z;
    for (let i = 0; i < 40; i++) world.step(0.05);
    expect(p.hp).toBeLessThan(hp);
  });

  it('the Leviathan floods -1, then 0, and the water recedes when it dies', () => {
    const layout = parseLayout(REGION.boss.layout);
    const world = new World({ layout, seed: 9 });
    const p = world.addPlayer('a', 'alexios', 0);
    const boss = world.enemies.find((e) => e.id === world.bossId)!;
    expect(boss.type).toBe('leviatano');
    boss.state = EState.Chase;
    boss.cool = 999;
    expect(world.flood).toBe(FLOOD_DRY);
    world.damageEnemy(boss, boss.maxHp * 0.4, 0, null, { raw: true });
    for (let i = 0; i < 60; i++) world.step(0.05);
    expect(world.flood).toBe(-1);
    world.damageEnemy(boss, boss.maxHp * 0.3, 0, null, { raw: true });
    for (let i = 0; i < 60; i++) world.step(0.05);
    expect(world.flood).toBe(0);
    // Standing at elevation 0 in the water hurts.
    for (const o of world.enemies) if (o !== boss) world.damageEnemy(o, 99999, 0, null, { raw: true });
    world.zones.length = 0;
    boss.cool = 999;
    boss.zerg = 999;
    p.x = layout.playerSpawns[0]!.x;
    p.z = layout.playerSpawns[0]!.z;
    p.iframes = 0;
    const hp = p.hp;
    for (let i = 0; i < 30; i++) {
      boss.state = EState.Chase;
      boss.cool = 999;
      world.step(0.05);
    }
    expect(p.hp).toBeLessThan(hp);
    world.damageEnemy(boss, 999999, 0, null, { raw: true });
    expect(world.flood).toBe(FLOOD_DRY);
  });

  it('the Leviathan is a multi-phase Region Boss that does not move', () => {
    const def = ENEMIES.leviatano;
    expect(def.rank).toBe('region');
    expect(def.speed).toBe(0);
    expect(def.floods).toBe(true);
    expect(def.taunts?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('profile, cosmetics and bounties', () => {
  it('sanitizes untrusted profiles', () => {
    const p = sanitizeProfile({
      gems: -5,
      threads: 12.7,
      owned: ['pal_oro', 'nope', 'pal_oro'],
      looks: { jusef: { palette: 'pal_oro', skin: 'pal_oro', vfx: 'vfx_viola' } },
      title: 'title_naufrago',
      checkpoint: { badiscar: 9, ujian: 2, atlantide: 1 },
      cleared: ['kaza', 'atlantide'],
      trees: { jusef: { e: { path: 'potenza', tier: 99 }, r: { path: 'x', tier: 1 } } },
      bounty: 'nope',
    });
    expect(p.gems).toBe(0);
    expect(p.threads).toBe(12);
    expect(p.owned).toEqual(['pal_oro']);
    expect(p.looks.jusef).toEqual({ palette: 'pal_oro', skin: '', vfx: '', pose: '' });
    expect(p.title).toBe('');
    expect(p.checkpoint).toEqual({ badiscar: 3, ujian: 2 });
    expect(p.cleared).toEqual(['kaza']);
    expect(p.trees.jusef!.e).toEqual({ tier: 4, branch: 'A', wind: '' });
    expect(p.trees.jusef!.r).toEqual({ tier: 1, branch: '', wind: '' });
    expect(p.bounty).toBe('');
  });

  it('the archive round-trips a profile', () => {
    const archive = new MemoryProfileArchive();
    const id = '11111111-2222-3333-4444-555555555555';
    expect(archive.load(id)).toBeNull();
    const p = emptyProfile();
    p.gems = 77;
    archive.save(id, p);
    p.gems = 0;
    expect(archive.load(id)!.gems).toBe(77);
    archive.save('not-an-id', p);
    expect(archive.load('not-an-id')).toBeNull();
  });

  it("Saraya sells cosmetics for Fili d'Ombra and they never carry stats", () => {
    const kinds = new Set(COSMETICS.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(['palette', 'pose', 'skin', 'title', 'vfx']);
    for (const c of COSMETICS) {
      expect(c.cost, c.id).toBeGreaterThan(0);
      expect(Object.keys(c).some((k) => ['dmg', 'hp', 'speed', 'armor'].includes(k)), c.id).toBe(false);
    }
    const profile = emptyProfile();
    expect(buyCosmetic(profile, 'pal_oro').ok).toBe(false);
    profile.threads = 100;
    expect(buyCosmetic(profile, 'pal_oro').ok).toBe(true);
    expect(buyCosmetic(profile, 'pal_oro').ok).toBe(false);
    expect(equipCosmetic(profile, 'jusef', 'skin', 'pal_oro').ok).toBe(false);
    expect(equipCosmetic(profile, 'jusef', 'palette', 'pal_oro').ok).toBe(true);
    expect(equipCosmetic(profile, 'jusef', 'palette', 'pal_abisso').ok).toBe(false);
    expect(profile.looks.jusef!.palette).toBe('pal_oro');
    expect(equipCosmetic(profile, 'jusef', 'palette', '').ok).toBe(true);
    expect(profile.looks.jusef!.palette).toBe('');
  });

  it('Eleonora opens after the first City and the Leviathan after all three', () => {
    const profile = emptyProfile();
    expect(bountiesUnlocked(profile)).toBe(false);
    profile.cleared.push('badiscar');
    expect(bountiesUnlocked(profile)).toBe(true);
    expect(regionBossUnlocked(profile)).toBe(false);
    profile.cleared.push('ujian', 'kaza');
    expect(regionBossUnlocked(profile)).toBe(true);
  });

  const stage = (index: number, over: Partial<StageLog> = {}): StageLog => ({
    index,
    cleared: true,
    taken: 100,
    ults: 0,
    downs: 0,
    revives: 0,
    bossTime: 300,
    ...over,
  });

  it('offers the four GDD contracts', () => {
    expect(BOUNTIES.map((b) => b.id).sort()).toEqual(['contro_il_tempo', 'incolumi', 'nessun_caduto', 'senza_ultimate']);
    for (const b of BOUNTIES) expect(b.reward).toBeGreaterThanOrEqual(100);
  });

  it('Incolumi: Environments 2 and 3 in a row under 1000 damage', () => {
    expect(judgeBounty('incolumi', [stage(1)])).toBe('open');
    expect(judgeBounty('incolumi', [stage(1, { taken: 400 }), stage(2, { taken: 500 })])).toBe('done');
    expect(judgeBounty('incolumi', [stage(1, { taken: 600 }), stage(2, { taken: 400 })])).toBe('failed');
    // Starting from Environment 3 skips Environment 2: never complete.
    expect(judgeBounty('incolumi', [stage(2)])).toBe('open');
  });

  it('A Mani Nude: the City Boss dies without a single Ultimate', () => {
    expect(judgeBounty('senza_ultimate', [stage(2, { ults: 4 })])).toBe('open');
    expect(judgeBounty('senza_ultimate', [stage(3)])).toBe('done');
    expect(judgeBounty('senza_ultimate', [stage(3, { ults: 1, cleared: false })])).toBe('failed');
  });

  it('Contro il Tempo: a Mini-Boss within eight minutes', () => {
    expect(judgeBounty('contro_il_tempo', [stage(0, { bossTime: 481 })])).toBe('open');
    expect(judgeBounty('contro_il_tempo', [stage(0, { bossTime: 479 })])).toBe('done');
    expect(judgeBounty('contro_il_tempo', [stage(3, { bossTime: 60 })])).toBe('open');
  });

  it('Nessuno a Terra: the whole City with no downs and no revives', () => {
    const clean = [stage(0), stage(1), stage(2), stage(3)];
    expect(judgeBounty('nessun_caduto', clean)).toBe('done');
    expect(judgeBounty('nessun_caduto', clean.slice(0, 3))).toBe('open');
    expect(judgeBounty('nessun_caduto', [stage(0), stage(1, { downs: 1 })])).toBe('failed');
    expect(judgeBounty('nessun_caduto', [stage(0), stage(1, { revives: 1 })])).toBe('failed');
    expect(judgeBounty('nessun_caduto', [stage(1), stage(2), stage(3)])).toBe('failed');
  });
});
