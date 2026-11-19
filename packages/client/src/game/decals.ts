/** Babylon alphaIndex: hero ground fills, then hero rings, then enemy tells. */
export const HERO_DECAL_ORDER = 1;
export const HERO_RING_ORDER = 2;
export const ENEMY_ALERT_ORDER = 8;

/** Hero ability marks sit this far above the floor slab. */
export const HERO_DECAL_LIFT = 0.1;

/**
 * Enemy tells sit above those marks, so a ground disc from a hero
 * cannot cover a red telegraph, a charge lane or a melee cone.
 */
export const ENEMY_ALERT_LIFT = 0.18;

export function enemyAlertY(floorY: number): number {
  return floorY + ENEMY_ALERT_LIFT;
}
