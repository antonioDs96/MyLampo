/** Screen-space stick deflection. +x is right, +y is down; the result's +y is forward. */
export function stickVector(dx: number, dy: number, radius: number, dead = 0.16): { x: number; y: number } {
  if (radius <= 0) return { x: 0, y: 0 };
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  const mag = Math.min(1, len / radius);
  if (mag <= dead) return { x: 0, y: 0 };
  const n = (mag - dead) / (1 - dead);
  return { x: (dx / len) * n, y: (-dy / len) * n };
}

/**
 * Screen-space movement: turns the stick (or WASD) into a direction on the ground for a
 * camera looking along `yaw`. Up on the stick is always the top of the screen.
 */
export function screenToWorld(moveX: number, moveY: number, yaw: number, out: { x: number; z: number }): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  out.x = sin * moveY + cos * moveX;
  out.z = cos * moveY - sin * moveX;
  return out;
}
