import { DOOR_INTERACT_DIST, TILE } from '../config.js';
import { tileCenter } from './grid.js';

// Door = { id, tiles, state: 'open' | 'closed' | 'locked', broken }. A broken door stays open for good.

const NEXT = { open: 'closed', closed: 'locked', locked: 'open' };

export function createDoors(groups) {
  return groups.map((tiles, id) => ({ id, tiles: tiles.map((t) => ({ ...t })), state: 'open', broken: false }));
}

export function isBlocking(door) {
  return !door.broken && door.state !== 'open';
}

export function doorCenter(door) {
  const centers = door.tiles.map((t) => tileCenter(t.tx, t.ty));
  return {
    x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
    y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
  };
}

/** True when any actor's square (pos ± radius) overlaps a door tile; touching an edge does not count. */
export function occupies(door, actors) {
  return actors.some(({ pos, radius }) => {
    const tx0 = Math.floor((pos.x - radius) / TILE);
    const tx1 = Math.ceil((pos.x + radius) / TILE) - 1;
    const ty0 = Math.floor((pos.y - radius) / TILE);
    const ty1 = Math.ceil((pos.y + radius) / TILE) - 1;
    return door.tiles.some((t) => t.tx >= tx0 && t.tx <= tx1 && t.ty >= ty0 && t.ty <= ty1);
  });
}

/** open -> closed -> locked -> open. A door someone stands in does not close; a broken door never changes. */
export function cycleDoor(door, occupied) {
  if (door.broken || (door.state === 'open' && occupied)) return door;
  return { ...door, state: NEXT[door.state] };
}

export function openDoor(door) {
  return { ...door, state: 'open' };
}

export function breakDoor(door) {
  return { ...door, state: 'open', broken: true };
}

export function nearestDoor(doors, pos, maxDist = DOOR_INTERACT_DIST) {
  let best = null;
  let bestDist = Infinity;
  for (const door of doors) {
    const c = doorCenter(door);
    const d = Math.hypot(c.x - pos.x, c.y - pos.y);
    if (d <= maxDist && d < bestDist) [best, bestDist] = [door, d];
  }
  return best;
}

/** A copy of the grid with every closed or locked door walled off. */
export function withDoors(grid, doors) {
  const out = grid.map((row) => [...row]);
  for (const door of doors) if (isBlocking(door)) for (const t of door.tiles) out[t.ty][t.tx] = true;
  return out;
}

export function doorAtTile(doors, tile) {
  return doors.find((d) => d.tiles.some((t) => t.tx === tile.tx && t.ty === tile.ty)) ?? null;
}
