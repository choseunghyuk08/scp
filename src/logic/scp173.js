import { SCP173 } from '../config.js';
import { findPath } from './pathfinding.js';
import { tileCenter, tileOf } from './grid.js';

export function create173(pos) {
  return { pos: { x: pos.x, y: pos.y }, frozen: false };
}

/** Frozen while observed; otherwise walks the BFS path toward the player at SCP173.speed. */
export function step173(s, { dt, grid, player, observed }) {
  if (observed) return { pos: { ...s.pos }, frozen: true };

  const path = findPath(
    grid,
    { tx: tileOf(s.pos.x), ty: tileOf(s.pos.y) },
    { tx: tileOf(player.x), ty: tileOf(player.y) },
  );
  if (path === null) return { pos: { ...s.pos }, frozen: false };

  // Tile centers up to (not including) the player's tile, then the player's exact position.
  const waypoints = [...path.slice(0, -1).map((t) => tileCenter(t.tx, t.ty)), player];
  let { x, y } = s.pos;
  let budget = SCP173.speed * dt;
  for (const wp of waypoints) {
    if (budget <= 0) break;
    const d = Math.hypot(wp.x - x, wp.y - y);
    if (d <= budget) {
      x = wp.x;
      y = wp.y;
      budget -= d;
    } else {
      x += ((wp.x - x) / d) * budget;
      y += ((wp.y - y) / d) * budget;
      budget = 0;
    }
  }
  return { pos: { x, y }, frozen: false };
}

export function isLethal(s, player) {
  return !s.frozen && Math.hypot(s.pos.x - player.x, s.pos.y - player.y) < SCP173.touchDistance;
}
