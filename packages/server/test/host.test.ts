import { describe, expect, it } from 'vitest';
import { Act, HEROES, HERO_IDS, MAX_PLAYERS, MISSIONS, type GroundDrop, type HeroId } from '@malampu/shared';
import { Party } from './party';

const TEAM: HeroId[] = ['alexios', 'jusef', 'rycard', 'fabyorn'];

describe('lobby', () => {
  it('the first player hosts, heroes are exclusive and the room holds eight', () => {
    const party = new Party();
    for (const hero of HERO_IDS) party.add(hero);
    expect(party.ids).toHaveLength(MAX_PLAYERS);
    expect(party.lobby.host).toBe('bot1');
    expect(party.lobby.players.map((p) => p.hero)).toEqual(HERO_IDS);

    expect(party.host.join('late', 'Nono')).toBe(false);

    party.host.onMessage('bot2', { t: 'hero', hero: HERO_IDS[0]! });
    expect(party.errors.at(-1)).toMatch(/già stato scelto/);
    expect(party.lobby.players[1]!.hero).toBe(HERO_IDS[1]);
  });

  it('only the host starts a mission, and everyone needs a hero first', () => {
    const party = new Party();
    party.add('alexios');
    party.add('jusef');
    party.host.join('undecided', 'Indeciso');

    party.host.onMessage('bot2', { t: 'start' });
    expect(party.host.phase).toBe('hub');

    party.host.onMessage('bot1', { t: 'start' });
    expect(party.host.phase).toBe('hub');
    expect(party.errors.at(-1)).toMatch(/Indeciso/);

    party.host.leave('undecided');
    party.host.onMessage('bot1', { t: 'start' });
    expect(party.host.phase).toBe('mission');
  });

  it('hands the room to the next player when the host leaves', () => {
    const party = new Party();
    party.add('alexios');
    party.add('jusef');
    party.host.leave('bot1');
    expect(party.lobby.host).toBe('bot2');
    expect(party.lobby.players).toHaveLength(1);
    party.host.onMessage('bot2', { t: 'start' });
    expect(party.host.phase).toBe('mission');
  });

  it('strips markup and control characters from names', () => {
    const party = new Party();
    party.host.join('x', '  <b>Carl</b>\u0007 il Taverniere davvero troppo lungo ');
    const name = party.lobby.players[0]!.name;
    expect(name).not.toMatch(/[<>\u0000-\u001f]/);
    expect(name.length).toBeLessThanOrEqual(18);
    party.host.join('y', '   ');
    expect(party.lobby.players[1]!.name).toBe('Viandante');
  });
});

describe('simulation', () => {
  it('acknowledges inputs and moves heroes at the speed the rules allow', () => {
    const party = new Party();
    const id = party.add('alexios');
    party.run(0.5);
    const before = party.snap!.p.find((p) => p.id === id)!;
    const x0 = before.x;
    for (let i = 0; i < 20; i++) {
      // Far more input than one tick may carry: the surplus must not turn into speed.
      const cmds = [];
      for (let k = 0; k < 30; k++) cmds.push(1000 + i * 30 + k, 1000, 0, 0, 0, 0);
      party.host.onMessage(id, { t: 'i', c: cmds });
      party.now += 50;
      party.host.update(party.now);
    }
    const after = party.snap!.p.find((p) => p.id === id)!;
    const moved = after.x - x0;
    expect(moved).toBeGreaterThan(1);
    // One second of real time: nobody outruns twice their top speed, however much they send.
    expect(moved).toBeLessThan(8.5 * 2);
    expect(party.snap!.ack[id]).toBeGreaterThan(1000);
  });

  it('ignores malformed messages', () => {
    const party = new Party();
    const id = party.add('alexios');
    const bad: unknown[] = [null, 42, 'ciao', {}, { t: 'i', c: 'x' }, { t: 'i', c: [NaN, 1, 2] }, { t: 'hero', hero: 'drago' }, { t: 'mission', id: 7 }, { t: 'rtt', ms: 'molto' }];
    for (const msg of bad) party.host.onMessage(id, msg as never);
    party.run(0.3);
    expect(party.host.phase).toBe('hub');
    expect(party.snap!.p).toHaveLength(1);
  });
});

describe('missions played by bots', () => {
  it('a party of four clears the first mission, stage after stage', () => {
    const party = new Party(2024);
    for (const hero of TEAM) party.add(hero);
    const result = party.playMission('kaza', 900);
    expect(result.phase).toBe('victory');
    const mission = MISSIONS.find((m) => m.id === 'kaza')!;
    expect(result.worlds.filter((w) => w.kind === 'mission').map((w) => w.stage)).toEqual(mission.stages.map((_, i) => i));
    expect(Object.keys(result.lobby.stats)).toHaveLength(TEAM.length);
    for (const st of Object.values(result.lobby.stats)) expect(st.dmg).toBeGreaterThan(0);

    party.host.onMessage(party.host.hostId, { t: 'hub' });
    expect(party.host.phase).toBe('hub');
    expect(party.host.info.kind).toBe('hub');
  });

  it('a lone hero who stands still is defeated and may retry the stage', () => {
    const party = new Party(7);
    const id = party.add('gabryel');
    party.host.onMessage(id, { t: 'start' });
    for (let i = 0; i < 20 * 240 && party.host.phase === 'mission'; i++) party.tick(false);
    expect(party.host.phase).toBe('defeat');
    expect(party.downs).toBeGreaterThan(0);

    party.host.onMessage(id, { t: 'retry' });
    expect(party.host.phase).toBe('mission');
    party.run(0.2);
    const me = party.snap!.p.find((p) => p.id === id)!;
    expect(me.hp).toBeGreaterThan(0);
  });

  it('every mission ends for a full party of eight, and allies get revived along the way', () => {
    let revives = 0;
    for (const mission of MISSIONS) {
      // Slightly imperfect bots so someone goes down and gets picked back up.
      const party = new Party(99, 0.7);
      for (const hero of HERO_IDS) party.add(hero);
      const result = party.playMission(mission.id, 1500);
      expect(['victory', 'defeat'], mission.id).toContain(result.phase);
      expect(result.errors).toEqual([]);
      revives += result.revives;
    }
    expect(revives).toBeGreaterThan(0);
  });

  it('refuses last-standing arenas with a single hero', () => {
    const party = new Party();
    party.add('alexios');
    party.host.onMessage('bot1', { t: 'mission', id: 'arena_fossa' });
    party.host.onMessage('bot1', { t: 'start' });
    expect(party.host.phase).toBe('hub');
    expect(party.errors.at(-1)).toMatch(/almeno due eroi/);
  });

  it('ends an arena when only one hero is still standing', () => {
    const party = new Party(42);
    party.add('alexios');
    party.add('jusef');
    party.host.onMessage('bot1', { t: 'mission', id: 'arena_fossa' });
    party.host.onMessage('bot1', { t: 'start' });
    expect(party.host.phase).toBe('mission');
    expect(party.host.world.pvp).toBe(true);
    expect(party.host.world.noRevive).toBe(true);

    const victim = party.host.world.players.get('bot2')!;
    victim.hp = 0;
    victim.act = Act.Downed;
    for (let i = 0; i < 80 && party.host.phase === 'mission'; i++) party.tick(false);
    expect(party.host.phase).toBe('victory');
  });

  it('a boss arena starts with its champion wave', () => {
    const party = new Party(5);
    for (const hero of TEAM) party.add(hero);
    party.host.onMessage('bot1', { t: 'mission', id: 'boss_klaus' });
    party.host.onMessage('bot1', { t: 'start' });
    expect(party.host.phase).toBe('mission');
    expect(party.host.info.layoutId).toBe('boss_tamburo');
    expect(party.host.world.pvp).toBe(false);
    party.run(5);
    expect(party.host.world.enemies.some((e) => e.type === 'klaus')).toBe(true);
  });

  it('lets a player release and change hero in the hub', () => {
    const party = new Party(3);
    party.add('alexios');
    party.add('jusef');
    party.host.onMessage('bot1', { t: 'progress', xp: { alexios: 0 } });
    expect(party.lobby.players[0]!.level).toBe(1);

    party.host.onMessage('bot1', { t: 'hero', hero: '' });
    expect(party.lobby.players[0]!.hero).toBe('');
    party.host.onMessage('bot1', { t: 'hero', hero: 'anthon' });
    expect(party.lobby.players[0]!.hero).toBe('anthon');
    expect(party.host.world.players.get('bot1')!.hero).toBe('anthon');
    expect(party.host.world.players.get('bot1')!.maxHp).toBeGreaterThanOrEqual(HEROES.anthon.hp);

    // Mid-mission swaps stay blocked.
    party.host.onMessage('bot1', { t: 'start' });
    expect(party.host.phase).toBe('mission');
    party.host.onMessage('bot1', { t: 'hero', hero: 'rycard' });
    expect(party.errors.at(-1)).toMatch(/taverna/);
    expect(party.lobby.players[0]!.hero).toBe('anthon');
  });
});

describe('loot stays in the inventory', () => {
  it('keeps picked-up gear across the next stage, the hub and a hero swap', () => {
    const party = new Party(7);
    const id = party.add('fabyorn');
    party.host.onMessage(id, { t: 'mission', id: 'kaza' });
    party.host.onMessage(id, { t: 'start' });
    expect(party.host.phase).toBe('mission');

    const world = party.host.world;
    const hero = world.players.get(id)!;
    const drop: GroundDrop = {
      dropId: 'd-loot',
      kind: 'equipment',
      x: hero.x,
      z: hero.z,
      vx: 0,
      vz: 0,
      vy: 0,
      amount: 1,
      itemId: 'longsword',
      age: 0,
      ttl: 120,
    };
    world.loot.push(drop);
    for (let i = 0; i < 3; i++) party.tick(false);

    const looted = world.getInventory(id)!;
    expect(looted.bag.some((i) => i.itemId === 'longsword')).toBe(true);
    looted.gold = 55;
    looted.tomes.push('fortuna');

    world.waveState = 'done';
    party.run(5);
    expect(party.host.stage).toBe(1);
    expect(party.host.phase).toBe('mission');

    const staged = party.host.world.getInventory(id)!;
    expect(staged.bag.some((i) => i.itemId === 'longsword')).toBe(true);
    expect(staged.gold).toBe(55);
    expect(staged.tomes).toContain('fortuna');
    expect(staged.mainHand?.itemId).toBe('greatsword');

    party.host.onMessage(id, { t: 'hub' });
    expect(party.host.phase).toBe('hub');
    const hub = party.host.world.getInventory(id)!;
    expect(hub.bag.some((i) => i.itemId === 'longsword')).toBe(true);
    expect(hub.gold).toBe(55);
    expect(hub.tomes).toContain('fortuna');

    party.host.onMessage(id, { t: 'hero', hero: 'anthon' });
    expect(party.host.world.getInventory(id)!.hero).toBe('anthon');
    expect(party.host.world.getInventory(id)!.bag.some((i) => i.itemId === 'longsword')).toBe(false);
    party.host.onMessage(id, { t: 'hero', hero: 'fabyorn' });
    const back = party.host.world.getInventory(id)!;
    expect(back.hero).toBe('fabyorn');
    expect(back.bag.some((i) => i.itemId === 'longsword')).toBe(true);
    expect(back.gold).toBe(55);
    expect(back.tomes).toContain('fortuna');
  });

  it('restores a saved sheet onto the starter kit and will not drop session loot', () => {
    const party = new Party(3);
    const id = party.add('fabyorn');
    party.host.onMessage(id, {
      t: 'progress',
      xp: { fabyorn: 0 },
      gear: {
        fabyorn: {
          gold: 40,
          bag: [{ uid: 'loot-sword', itemId: 'longsword', qty: 1 }],
        },
      },
    });
    const restored = party.host.world.getInventory(id)!;
    expect(restored.mainHand?.itemId).toBe('greatsword');
    expect(restored.bag.some((i) => i.uid === 'loot-sword')).toBe(true);
    expect(restored.gold).toBe(40);

    restored.bag.push({ uid: 'session-mace', itemId: 'mace', qty: 1 });
    restored.gold = 90;
    party.host.onMessage(id, {
      t: 'progress',
      xp: { fabyorn: 0 },
      gear: {
        fabyorn: {
          gold: 10,
          mainHand: { uid: 'old-axe', itemId: 'greataxe', qty: 1 },
          bag: [{ uid: 'old-dagger', itemId: 'dagger', qty: 1 }],
        },
      },
    });
    const live = party.host.world.getInventory(id)!;
    expect(live.mainHand?.itemId).toBe('greatsword');
    expect(live.gold).toBe(90);
    expect(live.bag.map((i) => i.uid).sort()).toEqual(['loot-sword', 'old-dagger', 'session-mace']);
  });

  it('applies a saved sheet received before the hero is chosen, and ignores an empty one', () => {
    const party = new Party(11);
    expect(party.host.join('late', 'Late')).toBe(true);
    party.host.onMessage('late', {
      t: 'progress',
      xp: { fabyorn: 0 },
      gear: {
        fabyorn: { gold: 40, bag: [{ uid: 'loot-sword', itemId: 'longsword', qty: 1 }] },
        jusef: {},
      },
    });
    party.host.onMessage('late', { t: 'hero', hero: 'fabyorn' });
    const inv = party.host.world.getInventory('late')!;
    expect(inv.mainHand?.itemId).toBe('greatsword');
    expect(inv.armor?.itemId).toBe('hide');
    expect(inv.bag.some((i) => i.uid === 'loot-sword')).toBe(true);
    expect(inv.gold).toBe(40);

    party.host.onMessage('late', { t: 'hero', hero: '' });
    party.host.onMessage('late', { t: 'hero', hero: 'jusef' });
    const jusef = party.host.world.getInventory('late')!;
    expect(jusef.hero).toBe('jusef');
    expect(jusef.mainHand?.itemId).toBe('rapier');
    expect(jusef.gold).toBe(15);
  });
});
