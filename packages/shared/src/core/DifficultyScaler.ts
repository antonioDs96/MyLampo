/**
 * Lobby scaling for 1–9 players.
 * Hit points grow with the company. Body count grows only at 4 and at 7.
 * Spin attacks grow with how many players are standing inside 6 m, not with the lobby size.
 */

export type MinPlayers = 1 | 4 | 7;
export type LobbyBand = 'solo' | 'small' | 'mid' | 'raid';

export function clampPlayers(players: number): number {
  if (!Number.isFinite(players)) return 1;
  return Math.min(9, Math.max(1, Math.floor(players)));
}

/** Solo 1, small co-op 2–3, mid 4–6, full raid 7–9. */
export function lobbyBand(players: number): LobbyBand {
  const n = clampPlayers(players);
  if (n <= 1) return 'solo';
  if (n <= 3) return 'small';
  if (n <= 6) return 'mid';
  return 'raid';
}

/** HP_effettivi = HP_base * (1 + 0.45 * (activePlayers - 1)). */
export function scaledHp(base: number, activePlayers: number): number {
  const n = clampPlayers(activePlayers);
  return base * (1 + 0.45 * (n - 1));
}

/** minPlayers 1 is always live, 4 from a mid lobby, 7 from a full raid. */
export function spawnEnabled(minPlayers: MinPlayers, activePlayers: number): boolean {
  return clampPlayers(activePlayers) >= minPlayers;
}

/**
 * Danno = base * (1 + 0.35 * max(0, meleePlayersWithin6m - 1)).
 * `meleePlayersWithin6m` is every living player inside the 6 m band, the cluster the spin punishes.
 */
export function antiZergDamage(base: number, meleePlayersWithin6m: number): number {
  const clustered = Math.max(0, Math.floor(meleePlayersWithin6m));
  return base * (1 + 0.35 * Math.max(0, clustered - 1));
}

export function antiZergMultiplier(meleePlayersWithin6m: number): number {
  const clustered = Math.max(0, Math.floor(meleePlayersWithin6m));
  return 1 + 0.35 * Math.max(0, clustered - 1);
}

/**
 * Salting nets. The brief gives the three lobby anchors (1 / 4 / 9).
 * 2–3 stay on the solo count, 5–6 on the mid count, 7–8 on the raid count.
 */
export function netTargetCount(activePlayers: number): number {
  const n = clampPlayers(activePlayers);
  if (n >= 7) return 5;
  if (n >= 4) return 3;
  return 1;
}

/** Drowned corsairs released at the 75% shield. Same anchor rule as the nets. */
export function drownedCorsairCount(activePlayers: number): number {
  const n = clampPlayers(activePlayers);
  if (n >= 7) return 10;
  if (n >= 4) return 7;
  return 4;
}

/** Charge tell. 2.5 s only in a 9-player lobby; 7 and 8 keep the 3 s laser. */
export function chargeTelegraphSeconds(activePlayers: number): number {
  return clampPlayers(activePlayers) >= 9 ? 2.5 : 3;
}
