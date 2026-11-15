import { describe, expect, it } from 'vitest';
import {
  Act,
  EState,
  GameHost,
  HEROES,
  HERO_IDS,
  MAX_PLAYERS,
  MISSIONS,
  MemoryGearArchive,
  type GroundDrop,
  type HeroId,
} from '@malampu/shared';
import { Party } from './party';

const TEAM: HeroId[] = ['alexios', 'jusef', 'rycard', 'fabyorn'];

describe('lobby', () => {
  it('the first player hosts, heroes are exclusive and the room holds the whole company', () => {
    const party = new Party();
    for (const hero of HERO_IDS) party.add(hero);
    expect(party.ids).toHaveLength(MAX_PLAYERS);
    expect(party.lobby.host).toBe('bot1');
    expect(party.lobby.players.map((p) => p.hero)).toEqual(HERO_IDS);

    expect(party.host.join('late', 'In più')).toBe(false);

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

  it('drops a late hero into a mission that has already started', () => {
    const party = new Party();
    party.add('alexios');
    party.host.onMessage(party.host.hostId, { t: 'start' });
    expect(party.host.phase).toBe('mission');

    expect(party.host.join('late', 'Nemo')).toBe(true);
    party.host.onMessage('late', { t: 'hero', hero: 'jusef' });
    party.run(0.2);

    expect(party.snap!.p.map((p) => p.id)).toContain('late');
    expect(party.lobby.players.find((p) => p.id === 'late')?.hero).toBe('jusef');
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

  it('every mission ends for a full company, and allies get revived along the way', () => {
    let revives = 0;
    for (const mission of MISSIONS) {
      // Imperfect bots so someone goes down and gets picked back up (roster is tankier after the arcade rebalance).
      const party = new Party(99, 0.55);
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

  it('reloads each hero from the server archive in a new session', () => {
    const archive = new MemoryGearArchive();
    const profile = '11111111-1111-4111-8111-111111111111';
    const io = { send() {}, broadcast() {} };
    const first = new GameHost(io, 'A', 1, archive);
    first.join('p', 'Ada');
    first.onMessage('p', { t: 'profile', id: profile });
    first.onMessage('p', { t: 'hero', hero: 'fabyorn' });
    const inv = first.world.getInventory('p')!;
    inv.bag.push({ uid: 'loot-sword', itemId: 'longsword', qty: 1 });
    inv.gold = 40;
    inv.tomes.push('fortuna');
    first.onMessage('p', { t: 'hero', hero: 'jusef' });
    first.leave('p');

    const second = new GameHost(io, 'B', 2, archive);
    second.join('p2', 'Ada');
    second.onMessage('p2', { t: 'profile', id: profile });
    second.onMessage('p2', { t: 'hero', hero: 'fabyorn' });
    const again = second.world.getInventory('p2')!;
    expect(again.mainHand?.itemId).toBe('greatsword');
    expect(again.bag.some((i) => i.uid === 'loot-sword')).toBe(true);
    expect(again.gold).toBe(40);
    expect(again.tomes).toContain('fortuna');

    second.onMessage('p2', { t: 'hero', hero: 'jusef' });
    const jusef = second.world.getInventory('p2')!;
    expect(jusef.mainHand?.itemId).toBe('rapier');
    expect(jusef.bag.some((i) => i.uid === 'loot-sword')).toBe(false);
    expect(jusef.gold).toBe(15);
  });

  it('keeps session loot when the server book is read again', () => {
    const archive = new MemoryGearArchive();
    const profile = '22222222-2222-4222-8222-222222222222';
    const io = { send() {}, broadcast() {} };
    const host = new GameHost(io, 'A', 3, archive);
    host.join('p', 'Ada');
    host.onMessage('p', { t: 'profile', id: profile });
    host.onMessage('p', { t: 'hero', hero: 'fabyorn' });
    const inv = host.world.getInventory('p')!;
    inv.bag.push({ uid: 'loot-sword', itemId: 'longsword', qty: 1 });
    inv.gold = 40;
    host.leave('p');

    const live = new GameHost(io, 'B', 4, archive);
    live.join('p2', 'Ada');
    live.onMessage('p2', { t: 'hero', hero: 'fabyorn' });
    live.onMessage('p2', { t: 'profile', id: profile });
    const restored = live.world.getInventory('p2')!;
    expect(restored.bag.some((i) => i.uid === 'loot-sword')).toBe(true);
    expect(restored.gold).toBe(40);
    restored.bag.push({ uid: 'session-mace', itemId: 'mace', qty: 1 });
    restored.gold = 90;
    live.onMessage('p2', { t: 'profile', id: profile });
    const after = live.world.getInventory('p2')!;
    expect(after.mainHand?.itemId).toBe('greatsword');
    expect(after.gold).toBe(90);
    expect(after.bag.map((i) => i.uid).sort()).toEqual(['loot-sword', 'session-mace']);
  });

  it('drops a boss relic into the hero who is already on the field', () => {
    const party = new Party(5);
    const id = party.add('fabyorn');
    party.host.world.relicGrants.push({
      hero: 'fabyorn',
      itemId: 'boss_urban_fabyorn',
      banner: 'Reliquia del Boss · Mannaia → fabyorn',
    });
    party.run(0.1);
    const inv = party.host.world.getInventory(id)!;
    expect(inv.bag.map((i) => i.itemId)).toContain('boss_urban_fabyorn');
    expect(inv.relic).toBeNull();
  });

  it('holds a boss relic until the named hero is chosen', () => {
    const party = new Party(5);
    const id = party.add('fabyorn');
    party.host.world.relicGrants.push({
      hero: 'jusef',
      itemId: 'boss_coastal_jusef',
      banner: 'Reliquia del Boss · Stocco → jusef',
    });
    party.run(0.1);
    expect(party.host.world.getInventory(id)!.bag.some((i) => i.itemId.startsWith('boss_'))).toBe(false);
    party.host.onMessage(id, { t: 'hero', hero: 'jusef' });
    const inv = party.host.world.getInventory(id)!;
    expect(inv.hero).toBe('jusef');
    expect(inv.bag.map((i) => i.itemId)).toContain('boss_coastal_jusef');
  });

  it('does not leave a boss relic on the ground for the next room to delete', () => {
    const party = new Party(9);
    const id = party.add('fabyorn');
    party.host.onMessage(id, { t: 'start' });
    const world = party.host.world;
    const p = world.players.get(id)!;
    world.spawnEnemy('klaus', p.x + 2, p.z);
    const boss = world.enemies.find((e) => e.type === 'klaus')!;
    let guard = 0;
    while (boss.state !== EState.Dead && guard++ < 40) world.damageEnemy(boss, 900, 0, p, { raw: true });
    expect(boss.state).toBe(EState.Dead);
    expect(world.loot.some((d) => d.itemId?.startsWith('boss_'))).toBe(false);
    const grant = world.relicGrants[0]!;
    expect(grant.itemId.startsWith('boss_')).toBe(true);
    party.run(0.2);
    if (grant.hero === 'fabyorn') {
      expect(party.host.world.getInventory(id)!.bag.map((i) => i.itemId)).toContain(grant.itemId);
    } else {
      party.host.onMessage(id, { t: 'hub' });
      party.host.onMessage(id, { t: 'hero', hero: grant.hero });
      expect(party.host.world.getInventory(id)!.bag.map((i) => i.itemId)).toContain(grant.itemId);
    }
  });
});
