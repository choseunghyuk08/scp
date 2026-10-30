import { TILE } from '../config.js';
import { isSolid } from './grid.js';

// Moves are applied in steps smaller than a tile so a big delta cannot tunnel through a wall.
const MAX_STEP = 4;

export function overlapsSolid(grid, pos, radius) {
  const tx0 = Math.floor((pos.x - radius) / TILE);
  const tx1 = Math.ceil((pos.x + radius) / TILE) - 1;
  const ty0 = Math.floor((pos.y - radius) / TILE);
  const ty1 = Math.ceil((pos.y + radius) / TILE) - 1;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolid(grid, tx, ty)) return true;
    }
  }
  return false;
}

function moveAxis(grid, pos, axis, delta, radius) {
  const sign = Math.sign(delta);
  let remaining = Math.abs(delta);
  let p = pos[axis];
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_STEP);
    const next = p + sign * step;
    const probe = axis === 'x' ? { x: next, y: pos.y } : { x: pos.x, y: next };
    if (overlapsSolid(grid, probe, radius)) {
      // Put the leading edge flush against the blocking tile.
      const edge = next + sign * radius;
      const tile = sign > 0 ? Math.ceil(edge / TILE) - 1 : Math.floor(edge / TILE);
      const flush = sign > 0 ? tile * TILE - radius : (tile + 1) * TILE + radius;
      return Math.min(Math.max(p, next), Math.max(Math.min(p, next), flush));
    }
    p = next;
    remaining -= step;
  }
  return p;
}

export function moveWithCollision(grid, pos, dx, dy, radius) {
  const x = moveAxis(grid, pos, 'x', dx, radius);
  const y = moveAxis(grid, { x, y: pos.y }, 'y', dy, radius);
  return { x, y };
}
