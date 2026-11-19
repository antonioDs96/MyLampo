import { describe, expect, it } from 'vitest';
import {
  Act,
  BOUNTY_BY_ID,
  CELL,
  CITIES,
  DEATH_TAX,
  ENEMIES,
  EState,
  HEROES,
  HUB_LAYOUT,
  MAX_PLAYERS,
  MemoryProfileArchive,
  TUNING,
  emptyProfile,
  nodeCost,
  packCmds,
  sanitizeName,
  type ClientMsg,
  type HeroId,
} from '@malampu/shared';
import { Party } from './party';

const ALL: HeroId[] = ['jusef', 'alexios', 'rycard', 'fabyorn', 'gabryel', 'anthon', 'vyncent', 'albereth', 'dalith'];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function company(heroes: HeroId[], seed = 7, archive?: MemoryProfileArchive): Party {
  const party = new Party(seed, 1, archive);
  for (const h of heroes) party.add(h);
  return party;
}

/** Kills the Mini-Boss, walks nobody anywhere and opens the Choice Terminal. */
function openPortal(party: Party): void {
  const world = party.host.world;
  const boss = world.enemies.find((e) => e.id === world.bossId)!;
  world.damageEnemy(boss, 999999, 0, null, { raw: true });
  // The boss loot would blur the arithmetic of the tests below.
  world.drops = [];
  world.portalBy = party.ids[0]!;
  party.run(0.2, undefined, false);
}

function wipe(party: Party): void {
  for (const p of party.host.world.players.values()) {
    p.hp = 0;
    p.act = Act.Downed;
  }
  party.run(4, () => party.host.phase === 'hub', false);
}

describe('hero selection', () => {
  it('nobody spawns until the whole lobby confirms, then everyone enters the tavern together', () => {
    const party = new Party();
    const a = party.add('jusef', 'Ada', false);
    const b = party.add('alexios', 'Bo', false);
    expect(party.host.phase).toBe('select');
    expect(party.lobby.players.map((p) => p.ready)).toEqual([false, false]);
    party.host.onMessage(a, { t: 'ready', on: true });
    party.run(1);
    expect(party.host.phase).toBe('select');
    expect(party.host.world.players.size).toBe(0);
    // Taking it back is allowed while the lobby gathers.
    party.host.onMessage(a, { t: 'ready', on: false });
    expect(party.lobby.players[0]!.ready).toBe(false);
    party.host.onMessage(a, { t: 'ready', on: true });
    party.host.onMessage(b, { t: 'ready', on: true });
    expect(party.host.phase).toBe('hub');
    expect([...party.host.world.players.keys()].sort()).toEqual([a, b]);
    expect(party.worlds.at(-1)).toMatchObject({ kind: 'hub', layoutId: HUB_LAYOUT.id, title: 'La Taverna di Carl' });
  });

  it('needs a hero to confirm, and heroes are exclusive', () => {
    const party = new Party();
    party.host.join('x', 'Ics');
    party.host.onMessage('x', { t: 'ready', on: true });
    expect(party.errors).toHaveLength(1);
    expect(party.host.phase).toBe('select');
    party.add('jusef', 'Ada', false);
    party.host.onMessage('x', { t: 'hero', hero: 'jusef' });
    expect(party.errors).toHaveLength(2);
    expect(party.lobby.players.find((p) => p.id === 'x')!.hero).toBe('');
  });

  it('the first player hosts and the room holds nine', () => {
    const party = company(ALL);
    expect(party.host.playerCount).toBe(MAX_PLAYERS);
    expect(party.host.hostId).toBe('bot1');
    expect(party.host.join('late', 'Tardi')).toBe(false);
    expect(new Set(party.lobby.players.map((p) => p.slot)).size).toBe(9);
    expect(party.host.world.players.size).toBe(9);
    party.host.leave('bot1');
    expect(party.host.hostId).toBe('bot2');
  });

  it('a late arrival picks, confirms and joins the company where it is', () => {
    const party = company(['jusef']);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    expect(party.host.phase).toBe('run');
    const late = party.add('alexios', 'Tardi', false);
    expect(party.host.world.players.has(late)).toBe(false);
    party.host.onMessage(late, { t: 'ready', on: true });
    expect(party.host.world.players.has(late)).toBe(true);
  });

  it('going back to Hero Selection is only possible in the tavern', () => {
    const party = company(['jusef', 'alexios']);
    party.host.onMessage('bot2', { t: 'reselect' });
    expect(party.host.world.players.has('bot2')).toBe(false);
    party.host.onMessage('bot2', { t: 'hero', hero: 'rycard' });
    party.host.onMessage('bot2', { t: 'ready', on: true });
    expect(party.host.world.players.get('bot2')!.hero).toBe('rycard');
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    party.host.onMessage('bot2', { t: 'reselect' });
    expect(party.host.world.players.has('bot2')).toBe(true);
  });

  it('strips markup and control characters from names', () => {
    expect(sanitizeName('  <b>Ada</b>\u0007 ')).toBe('bAda/b');
    expect(sanitizeName('')).toBe('Viandante');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(18);
  });
});

describe('map table', () => {
  it('only the Host starts a run, on a City of the Costa Est', () => {
    const party = company(['jusef', 'alexios']);
    party.host.onMessage('bot2', { t: 'run', city: 'badiscar' });
    expect(party.host.phase).toBe('hub');
    party.host.onMessage('bot1', { t: 'run', city: 'terre_rosse' });
    expect(party.host.phase).toBe('hub');
    expect(party.errors.at(-1)).toMatch(/sigillata/);
    party.host.onMessage('bot1', { t: 'run', city: 'kaza' });
    expect(party.host.phase).toBe('hub');
    expect(party.errors.at(-1)).toMatch(/Kaza-Massel/);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    expect(party.host.phase).toBe('run');
    expect(party.lobby.run).toMatchObject({ stage: { kind: 'env', city: 'badiscar', index: 0 }, streak: 0, fervor: 0 });
    expect(party.worlds.at(-1)).toMatchObject({ kind: 'run', layoutId: CITIES.badiscar.environments[0]!.layout.id });
    expect(party.lobby.run!.company).toBeCloseTo(0.1);
  });

  it('the Region Boss stays sealed until the three City Bosses have fallen', () => {
    const archive = new MemoryProfileArchive();
    const party = company(['jusef'], 3, archive);
    party.host.onMessage('bot1', { t: 'run', city: 'boss' });
    expect(party.host.phase).toBe('hub');
    expect(party.lobby.table.regionBoss).toBe(false);
    const p = emptyProfile();
    p.cleared = ['badiscar', 'ujian', 'kaza'];
    archive.save(uuid(1), p);
    party.host.onMessage('bot1', { t: 'profile', id: uuid(1) });
    expect(party.lobby.table.regionBoss).toBe(true);
    party.host.onMessage('bot1', { t: 'run', city: 'boss' });
    expect(party.lobby.run!.stage).toEqual({ kind: 'regionBoss' });
    expect(party.host.world.enemies.some((e) => e.type === 'leviatano')).toBe(true);
  });

  it('a run starts from the City checkpoint of the Host', () => {
    const archive = new MemoryProfileArchive();
    const p = emptyProfile();
    p.cleared = ['badiscar', 'kaza'];
    p.checkpoint.ujian = 2;
    archive.save(uuid(2), p);
    const party = company(['jusef'], 3, archive);
    party.host.onMessage('bot1', { t: 'profile', id: uuid(2) });
    party.host.onMessage('bot1', { t: 'run', city: 'ujian' });
    expect(party.lobby.run!.stage).toEqual({ kind: 'env', city: 'ujian', index: 2 });
  });
});

describe('extraction portal and push-your-luck', () => {
  it('both outcomes need unanimity', () => {
    const party = company(['jusef', 'alexios', 'rycard']);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    openPortal(party);
    expect(party.lobby.vote).not.toBeNull();
    expect(Object.keys(party.lobby.vote!.votes).sort()).toEqual(['bot1', 'bot2', 'bot3']);
    expect(party.lobby.vote!.nextFervor).toBeCloseTo(0.2);
    party.host.onMessage('bot1', { t: 'vote', choice: 'continue' });
    party.host.onMessage('bot2', { t: 'vote', choice: 'continue' });
    party.host.onMessage('bot3', { t: 'vote', choice: 'extract' });
    party.run(1, undefined, false);
    expect(party.lobby.run!.stage).toMatchObject({ index: 0 });
    expect(party.lobby.vote!.votes.bot3).toBe('extract');
    // The dissenter changes their mind.
    party.host.onMessage('bot3', { t: 'vote', choice: 'continue' });
    expect(party.lobby.run!.stage).toMatchObject({ kind: 'env', index: 1 });
    expect(party.lobby.vote).toBeNull();
  });

  it('going on keeps wounds and loot, resets buffs and grows the Fervor up to the City Boss', () => {
    const party = company(['jusef', 'alexios']);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    const fervor: number[] = [];
    for (let i = 0; i < 3; i++) {
      const world = party.host.world;
      const p = world.players.get('bot1')!;
      p.hp = 40 + i;
      p.fury = 90;
      world.synergy.push('might');
      world.satchelOf('bot1').gems += 10;
      world.players.get('bot2')!.hp = 0;
      world.players.get('bot2')!.act = Act.Downed;
      openPortal(party);
      party.voteAll('continue');
      const next = party.host.world;
      expect(next).not.toBe(world);
      const q = next.players.get('bot1')!;
      expect(q.hp).toBe(40 + i);
      expect(q.fury).toBe(0);
      expect(next.synergy).toHaveLength(0);
      // A hero who was down walks into the next stage on a fifth of their health.
      const down = next.players.get('bot2')!;
      expect(down.act).not.toBe(Act.Downed);
      expect(down.hp).toBe(Math.round(HEROES.alexios.hp * TUNING.carryDownedHp));
      expect(party.satchel.get('bot1')!.gems).toBe(10 * (i + 1));
      fervor.push(party.lobby.run!.fervor);
    }
    expect(fervor).toEqual([0.2, 0.5, 1]);
    expect(party.lobby.run!.stage).toEqual({ kind: 'cityBoss', city: 'badiscar' });
    expect(party.host.world.streak).toBe(3);
    expect(party.host.world.enemies.some((e) => e.type === CITIES.badiscar.boss.boss)).toBe(true);
  });

  it('extracting banks the satchel, saves the checkpoint and resets the Fervor', () => {
    const archive = new MemoryProfileArchive();
    const opened = emptyProfile();
    opened.cleared = ['badiscar'];
    archive.save(uuid(3), opened);
    const party = company(['jusef', 'alexios'], 3, archive);
    party.host.onMessage('bot1', { t: 'profile', id: uuid(3) });
    party.host.onMessage('bot1', { t: 'run', city: 'kaza' });
    party.host.world.satchelOf('bot1').gems += 30;
    openPortal(party);
    party.voteAll('continue');
    party.host.world.satchelOf('bot1').gems += 12;
    party.host.world.satchelOf('bot2').threads += 2;
    openPortal(party);
    party.voteAll('extract');
    expect(party.host.phase).toBe('hub');
    expect(party.profiles.get('bot1')!.gems).toBeGreaterThanOrEqual(42);
    expect(party.profiles.get('bot2')!.threads).toBeGreaterThanOrEqual(2);
    expect(party.profiles.get('bot1')!.checkpoint.kaza).toBe(2);
    expect(party.profiles.get('bot2')!.checkpoint.kaza).toBe(2);
    expect(party.lobby.report).toMatchObject({ kind: 'extract' });
    expect(party.lobby.report!.banked.bot1!.gems).toBe(party.profiles.get('bot1')!.gems);
    expect(party.lobby.table.checkpoint.kaza).toBe(2);
    // The next run starts from the next Environment, without Fervor.
    party.host.onMessage('bot1', { t: 'run', city: 'kaza' });
    expect(party.lobby.run).toMatchObject({ stage: { kind: 'env', city: 'kaza', index: 2 }, streak: 0, fervor: 0 });
  });

  it('a wipe burns 30% of the loot of the failed Environment only and restarts from it', () => {
    const party = company(['jusef', 'alexios']);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    party.host.world.satchelOf('bot1').gems += 100;
    openPortal(party);
    expect(party.profiles.get('bot1')!.gems).toBe(0);
    party.voteAll('continue');
    const carried = party.satchel.get('bot1')!.gems;
    expect(carried).toBe(100);
    const world = party.host.world;
    world.satchelOf('bot1').gems += 50;
    world.satchelOf('bot1').threads += 10;
    wipe(party);
    expect(party.host.phase).toBe('hub');
    const report = party.lobby.report!;
    expect(report.kind).toBe('wipe');
    expect(report.taxed.bot1).toEqual({ gems: Math.ceil(50 * DEATH_TAX), threads: Math.ceil(10 * DEATH_TAX) });
    expect(party.profiles.get('bot1')!.gems).toBe(carried + 50 - 15);
    expect(party.profiles.get('bot1')!.threads).toBe(7);
    expect(party.profiles.get('bot1')!.checkpoint.badiscar).toBe(1);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    expect(party.lobby.run).toMatchObject({ stage: { kind: 'env', index: 1 }, streak: 0 });
  });

  it('killing the City Boss clears the City, pays out and resets its checkpoint', () => {
    const archive = new MemoryProfileArchive();
    const p = emptyProfile();
    p.checkpoint.badiscar = 3;
    archive.save(uuid(3), p);
    const party = company(['jusef', 'alexios'], 5, archive);
    party.host.onMessage('bot1', { t: 'profile', id: uuid(3) });
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    expect(party.lobby.run!.stage).toEqual({ kind: 'cityBoss', city: 'badiscar' });
    const world = party.host.world;
    const boss = world.enemies.find((e) => e.id === world.bossId)!;
    expect(ENEMIES[boss.type].rank).toBe('city');
    world.damageEnemy(boss, 999999, 0, world.players.get('bot1')!, { raw: true });
    party.run(8, () => party.host.phase === 'hub');
    expect(party.host.phase).toBe('hub');
    expect(party.lobby.report).toMatchObject({ kind: 'city' });
    for (const id of ['bot1', 'bot2']) {
      const profile = party.profiles.get(id)!;
      expect(profile.cleared).toEqual(['badiscar']);
      expect(profile.checkpoint.badiscar).toBe(0);
      expect(profile.gems).toBeGreaterThanOrEqual(300);
      expect(profile.threads).toBeGreaterThanOrEqual(15);
    }
    expect(archive.load(uuid(3))!.cleared).toEqual(['badiscar']);
    expect(party.lobby.table.bounties).toBe(true);
  });

  it('walking out mid-run is taxed like a fall', () => {
    const archive = new MemoryProfileArchive();
    const party = company(['jusef', 'alexios'], 5, archive);
    party.host.onMessage('bot2', { t: 'profile', id: uuid(4) });
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    party.host.world.satchelOf('bot2').gems += 10;
    party.host.leave('bot2');
    expect(archive.load(uuid(4))!.gems).toBe(7);
    expect(party.host.phase).toBe('run');
  });
});

describe('instanced loot and the snapshot', () => {
  it('drops travel in private messages, never in the shared snapshot', () => {
    const party = company(['jusef', 'alexios']);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    const world = party.host.world;
    const p = world.players.get('bot1')!;
    const e = world.spawnEnemy('nostromo_senzocchi', p.x, p.z + 3);
    world.damageEnemy(e, 99999, 0, p, { raw: true });
    party.run(2, undefined, false);
    expect(party.seen.some((ev) => ev.e === 'drop' || ev.e === 'take')).toBe(false);
    for (const id of ['bot1', 'bot2']) {
      const mine = party.mine.get(id)!;
      expect(mine.some((ev) => ev.e === 'drop')).toBe(true);
      expect(mine.every((ev) => !('to' in ev) || ev.to === id)).toBe(true);
    }
    expect(party.satchel.get('bot1')!.gems).toBeGreaterThanOrEqual(10);
  });

  it('carries points of interest, flood level and Synergy buffs', () => {
    const party = company(['jusef']);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    party.run(0.2, undefined, false);
    const snap = party.snap!;
    expect(snap.poi.length).toBe(party.host.world.pois.length);
    expect(snap.poi.length).toBeGreaterThanOrEqual(3);
    expect(snap.flood).toBeLessThan(-2);
    expect(snap.syn).toEqual([]);
    expect(snap.left).toBeGreaterThan(10);
    party.host.world.synergy.push('regen');
    party.run(0.2, undefined, false);
    expect(party.snap!.syn).toEqual(['regen']);
  });

  it('pings reach everyone and are rate limited', () => {
    const party = company(['jusef', 'alexios']);
    const send = (kind: string) => party.host.onMessage('bot1', { t: 'mark', kind, x: 10, z: 12 } as ClientMsg);
    send('danger');
    send('danger');
    send('nonsense');
    party.run(0.2, undefined, false);
    const pings = party.seen.filter((ev) => ev.e === 'ping');
    expect(pings).toEqual([{ e: 'ping', by: 'bot1', kind: 'danger', x: 10, z: 12 }]);
  });
});

describe('the tavern services', () => {
  it('Iej sells nodes for banked Gemme, only in the tavern, and refunds every respec', () => {
    const archive = new MemoryProfileArchive();
    const p = emptyProfile();
    p.gems = 500;
    archive.save(uuid(5), p);
    const party = company(['jusef'], 5, archive);
    party.host.onMessage('bot1', { t: 'profile', id: uuid(5) });
    const base = party.host.world.players.get('bot1')!.cdMul;
    party.host.onMessage('bot1', { t: 'tree', op: 'buy', slot: 'e', path: '' });
    party.host.onMessage('bot1', { t: 'tree', op: 'buy', slot: 'e', path: '' });
    expect(party.profiles.get('bot1')!.gems).toBe(500 - nodeCost('e', 1) - nodeCost('e', 2));
    expect(party.host.world.players.get('bot1')!.cdMul).toBeLessThan(base);
    expect(archive.load(uuid(5))!.trees.jusef!.e).toEqual({ tier: 2, branch: '', wind: '' });
    party.host.onMessage('bot1', { t: 'tree', op: 'buy', slot: 'e', path: 'A' });
    party.host.onMessage('bot1', { t: 'tree', op: 'buy', slot: 'e', path: 'B' });
    expect(party.errors).toHaveLength(1);
    party.host.onMessage('bot1', { t: 'tree', op: 'respec', slot: '' });
    expect(party.profiles.get('bot1')!.gems).toBe(500);
    expect(party.host.world.players.get('bot1')!.cdMul).toBe(base);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    party.host.onMessage('bot1', { t: 'tree', op: 'buy', slot: 'e', path: 'potenza' });
    expect(party.profiles.get('bot1')!.gems).toBe(500);
  });

  it("Saraya's cosmetics show up in the lobby and change nothing in the simulation", () => {
    const archive = new MemoryProfileArchive();
    const p = emptyProfile();
    p.threads = 200;
    archive.save(uuid(6), p);
    const party = company(['jusef'], 5, archive);
    party.host.onMessage('bot1', { t: 'profile', id: uuid(6) });
    const before = JSON.stringify(party.host.world.players.get('bot1'));
    party.host.onMessage('bot1', { t: 'cosm', op: 'buy', id: 'pal_oro' });
    party.host.onMessage('bot1', { t: 'cosm', op: 'equip', id: 'pal_oro' });
    party.host.onMessage('bot1', { t: 'cosm', op: 'buy', id: 'title_naufrago' });
    party.host.onMessage('bot1', { t: 'cosm', op: 'equip', id: 'title_naufrago' });
    const me = party.lobby.players[0]!;
    expect(me.look.palette).toBe('pal_oro');
    expect(me.title).toBe('il Naufrago');
    expect(party.profiles.get('bot1')!.threads).toBe(200 - 18 - 10);
    expect(JSON.stringify(party.host.world.players.get('bot1'))).toBe(before);
  });

  it('Eleonora deals with the Host once a City is cleared, and pays everyone at extraction', () => {
    const archive = new MemoryProfileArchive();
    const p = emptyProfile();
    archive.save(uuid(7), p);
    const party = company(['jusef', 'alexios'], 5, archive);
    party.host.onMessage('bot1', { t: 'profile', id: uuid(7) });
    party.host.onMessage('bot1', { t: 'bounty', id: 'contro_il_tempo' });
    expect(party.lobby.table.bounty).toBe('');
    expect(party.errors).toHaveLength(1);

    const unlocked = emptyProfile();
    unlocked.cleared = ['ujian'];
    archive.save(uuid(8), unlocked);
    const second = company(['jusef', 'alexios'], 5, archive);
    second.host.onMessage('bot1', { t: 'profile', id: uuid(8) });
    second.host.onMessage('bot2', { t: 'bounty', id: 'contro_il_tempo' });
    expect(second.lobby.table.bounty).toBe('');
    second.host.onMessage('bot1', { t: 'bounty', id: 'contro_il_tempo' });
    expect(second.lobby.table.bounty).toBe('contro_il_tempo');
    second.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    expect(second.lobby.run!.bounty).toBe('contro_il_tempo');
    second.run(2, undefined, false);
    openPortal(second);
    second.voteAll('extract');
    const reward = BOUNTY_BY_ID.contro_il_tempo!.reward;
    expect(second.lobby.report).toMatchObject({ bounty: 'contro_il_tempo', bountyPaid: reward });
    expect(second.profiles.get('bot1')!.threads).toBeGreaterThanOrEqual(reward);
    expect(second.profiles.get('bot2')!.threads).toBeGreaterThanOrEqual(reward);
    expect(second.lobby.table.bounty).toBe('');
  });
});

describe('simulation', () => {
  it('acknowledges inputs and moves heroes at the speed the rules allow', () => {
    const party = company(['jusef']);
    const id = party.ids[0]!;
    const start = { ...party.host.world.players.get(id)! };
    let seq = 0;
    for (let t = 0; t < 20; t++) {
      const cmds = [0, 1, 2].map(() => ({ seq: ++seq, mx: 1, mz: 0, buttons: 0, aim: 0, lock: 0 }));
      party.host.onMessage(id, { t: 'i', c: packCmds(cmds) });
      party.now += 50;
      party.host.update(party.now);
    }
    const p = party.host.world.players.get(id)!;
    expect(party.snap!.ack[id]).toBe(seq);
    expect(p.x - start.x).toBeGreaterThan(HEROES.jusef.speed * 0.8);
    expect(p.x - start.x).toBeLessThan(HEROES.jusef.speed * 1.25);
    // Flooding the host with inputs does not make the hero faster.
    const flood = Array.from({ length: 300 }, () => ({ seq: ++seq, mx: 1, mz: 0, buttons: 0, aim: 0, lock: 0 }));
    const x = p.x;
    party.host.onMessage(id, { t: 'i', c: packCmds(flood) });
    party.now += 50;
    party.host.update(party.now);
    expect(p.x - x).toBeLessThan(HEROES.jusef.speed * 0.3);
  });

  it('ignores malformed messages', () => {
    const party = company(['jusef']);
    const id = party.ids[0]!;
    const junk = [null, 5, {}, { t: 'i', c: 'x' }, { t: 'hero', hero: 42 }, { t: 'run' }, { t: 'vote' }, { t: 'tree' }, { t: 'cosm' }, { t: 'mark' }];
    for (const j of junk) expect(() => party.host.onMessage(id, j as unknown as ClientMsg)).not.toThrow();
    party.run(1);
    expect(party.host.phase).toBe('hub');
  });

  it('nobody can be downed in the tavern', () => {
    const party = company(['jusef']);
    const world = party.host.world;
    expect(world.safe).toBe(true);
    expect(world.enemies.every((e) => ENEMIES[e.type].dummy)).toBe(true);
    party.run(20);
    expect(world.players.get('bot1')!.act).not.toBe(Act.Downed);
  });
});

describe('expeditions played by bots', () => {
  it('a party of four fights through the first Environment and reaches the Choice Terminal', () => {
    const party = company(['alexios', 'jusef', 'rycard', 'fabyorn'], 21);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    const done = party.run(600, () => party.lobby.vote !== null || party.host.phase === 'hub');
    expect(done).toBe(true);
    expect(party.host.phase).toBe('run');
    expect(party.host.world.bossDead).toBe(true);
    expect(party.seen.some((ev) => ev.e === 'clear')).toBe(true);
    party.voteAll('extract');
    expect(party.host.phase).toBe('hub');
    // Whatever was still on the ground is swept into the satchel when the company leaves.
    for (const id of party.ids) expect(party.profiles.get(id)!.gems).toBeGreaterThanOrEqual(50);
    expect(party.profiles.get('bot1')!.checkpoint.badiscar).toBe(1);
    expect(party.errors).toEqual([]);
  });

  it('a lone hero who stands still falls, pays the Death Tax and wakes up in the tavern', () => {
    const party = company(['gabryel'], 4);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    const world = party.host.world;
    const p = world.players.get('bot1')!;
    const foe = world.enemies.find((e) => e.state === EState.Idle && !ENEMIES[e.type].ranged)!;
    p.x = foe.x;
    p.z = foe.z - CELL;
    const ended = party.run(120, () => party.host.phase === 'hub', false);
    expect(ended).toBe(true);
    expect(party.lobby.report!.kind).toBe('wipe');
    expect(party.host.world.safe).toBe(true);
    expect(party.host.world.players.get('bot1')!.hp).toBe(HEROES.gabryel.hp);
  });

  it('nine heroes wake the shadow spawns', () => {
    const party = company(ALL, 9);
    party.host.onMessage('bot1', { t: 'run', city: 'badiscar' });
    const before = party.host.world.enemies.length;
    party.run(40);
    expect(party.seen.filter((ev) => ev.e === 'spawn').length).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(10);
  });
});
