import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { emptyInventory } from '@malampu/shared';
import { startApp, type RunningApp } from '../src/app';
import { FileGearStore } from '../src/gearStore';

const PROFILE = '33333333-3333-4333-8333-333333333333';

function sparePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const address = srv.address();
      srv.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

describe('file gear store', () => {
  it('keeps a hero sheet on disk across a new process view', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'malampu-')), 'profiles.json');
    const inv = emptyInventory('fabyorn', { starter: true });
    inv.bag.push({ uid: 'loot-sword', itemId: 'longsword', qty: 1 });
    inv.gold = 40;
    new FileGearStore(file).save(PROFILE, 'fabyorn', inv);

    const loaded = new FileGearStore(file).load(PROFILE).fabyorn;
    expect(loaded?.bag.map((i) => i.uid)).toEqual(['loot-sword']);
    expect(loaded?.gold).toBe(40);
    expect(loaded?.mainHand?.itemId).toBe('greatsword');
  });

  it('ignores an empty sheet and a bad profile id', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'malampu-')), 'profiles.json');
    const store = new FileGearStore(file);
    const inv = emptyInventory('fabyorn', { starter: true });
    store.save(PROFILE, 'fabyorn', inv);
    store.save(PROFILE, 'fabyorn', emptyInventory('fabyorn'));
    store.save('not-a-uuid', 'fabyorn', inv);
    expect(store.load(PROFILE).fabyorn?.mainHand?.itemId).toBe('greatsword');
    expect(store.load('not-a-uuid')).toEqual({});
  });
});

describe('profile http api', () => {
  let app: RunningApp;
  let port = 0;

  afterAll(async () => {
    await app?.stop();
  });

  it('round-trips a sheet and rejects a bad id', async () => {
    port = await sparePort();
    const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'malampu-')), 'profiles.json');
    app = await startApp({ port, quiet: true, dataFile });
    const put = await fetch(`http://127.0.0.1:${port}/api/profile/${PROFILE}/fabyorn`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gold: 40,
        bag: [{ uid: 'loot-sword', itemId: 'longsword', qty: 1 }],
      }),
    });
    expect(put.status).toBe(200);
    const got = await fetch(`http://127.0.0.1:${port}/api/profile/${PROFILE}`);
    const body = (await got.json()) as { heroes: { fabyorn: { gold: number; bag: { itemId: string }[] } } };
    expect(body.heroes.fabyorn.gold).toBe(40);
    expect(body.heroes.fabyorn.bag.map((i) => i.itemId)).toEqual(['longsword']);

    const bad = await fetch(`http://127.0.0.1:${port}/api/profile/nope`);
    expect(bad.status).toBe(400);
  });
});
