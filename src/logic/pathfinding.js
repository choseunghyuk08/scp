import { isSolid } from './grid.js';

const NEIGHBORS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/** 4-neighbor BFS. Returns tiles after `from` up to and including `to`, or null if unreachable. */
export function findPath(grid, from, to) {
  if (isSolid(grid, to.tx, to.ty)) return null;
  if (from.tx === to.tx && from.ty === to.ty) return [];

  const key = (tx, ty) => `${tx},${ty}`;
  const cameFrom = new Map([[key(from.tx, from.ty), null]]);
  const queue = [from];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const { dx, dy } of NEIGHBORS) {
      const tx = cur.tx + dx;
      const ty = cur.ty + dy;
      const k = key(tx, ty);
      if (cameFrom.has(k) || isSolid(grid, tx, ty)) continue;
      cameFrom.set(k, cur);
      if (tx === to.tx && ty === to.ty) return rebuild(cameFrom, key, to, from);
      queue.push({ tx, ty });
    }
  }
  return null;
}

function rebuild(cameFrom, key, to, from) {
  const path = [];
  let cur = to;
  while (cur && !(cur.tx === from.tx && cur.ty === from.ty)) {
    path.push({ tx: cur.tx, ty: cur.ty });
    cur = cameFrom.get(key(cur.tx, cur.ty));
  }
  return path.reverse();
}
