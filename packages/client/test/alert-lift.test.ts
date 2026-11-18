import { describe, expect, it } from 'vitest';
import { ENEMY_ALERT_LIFT, ENEMY_ALERT_ORDER, enemyAlertY, HERO_DECAL_LIFT, HERO_DECAL_ORDER } from '../src/game/decals';

describe('enemy tells above hero decals', () => {
  it('lifts a telegraph higher than an ability disc on the same floor', () => {
    const floor = 4;
    expect(ENEMY_ALERT_LIFT).toBeGreaterThan(HERO_DECAL_LIFT);
    expect(enemyAlertY(floor)).toBeGreaterThan(floor + HERO_DECAL_LIFT);
    expect(ENEMY_ALERT_ORDER).toBeGreaterThan(HERO_DECAL_ORDER);
  });
});
