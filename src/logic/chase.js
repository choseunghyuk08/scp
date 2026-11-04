import { findPath } from './pathfinding.js';
import { tileCenter, tileOf } from './grid.js';

/**
 * Moves up to `budget` pixels along the BFS path from pos to target: through tile centres, then onto the target
 * itself. Stops in front of the first path tile for which `blocked(tile)` is true and reports it. When the path is
 * longer than `maxTiles` it does not move at all.
 */
export function chaseStep(pos, target, grid, budget, blocked = () => false, maxTiles = Infinity) {
  const path = findPath(grid, { tx: tileOf(pos.x), ty: tileOf(pos.y) }, { tx: tileOf(target.x), ty: tileOf(target.y) });
  if (path === null) return { pos: { ...pos }, reachable: false, blockedTile: null };
  if (path.length > maxTiles) return { pos: { ...pos }, reachable: true, blockedTile: null };

  const stop = path.findIndex(blocked);
  const waypoints =
    stop === -1
      ? [...path.slice(0, -1).map((t) => tileCenter(t.tx, t.ty)), target]
      : path.slice(0, stop).map((t) => tileCenter(t.tx, t.ty));
  let { x, y } = pos;
  let left = budget;
  for (const wp of waypoints) {
    if (left <= 0) break;
    const d = Math.hypot(wp.x - x, wp.y - y);
    if (d <= left) {
      x = wp.x;
      y = wp.y;
      left -= d;
    } else {
      x += ((wp.x - x) / d) * left;
      y += ((wp.y - y) / d) * left;
      left = 0;
    }
  }
  return { pos: { x, y }, reachable: true, blockedTile: stop === -1 ? null : path[stop] };
}
