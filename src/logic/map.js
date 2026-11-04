import { tileCenter } from './grid.js';

// Legend: # wall, . floor, @ player start, K card key, X exit door (solid), S SCP-173 spawn,
// D door tile (starts open, so floor), ^ > v < SCP-096 spawn facing up/right/down/left.
const FACING_096 = { '>': 0, v: Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 };
const FLOOR_CHARS = new Set(['.', '@', 'K', 'S', 'D', ...Object.keys(FACING_096)]);

/** Groups 4-connected door tiles into doors, ordered by each door's first tile in reading order. */
function groupDoors(tiles) {
  const key = (t) => `${t.tx},${t.ty}`;
  const pending = new Map(tiles.map((t) => [key(t), t]));
  const doors = [];
  for (const t of tiles) {
    if (!pending.has(key(t))) continue;
    const door = [];
    const stack = [t];
    pending.delete(key(t));
    while (stack.length) {
      const cur = stack.pop();
      door.push(cur);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${cur.tx + dx},${cur.ty + dy}`;
        if (pending.has(k)) {
          stack.push(pending.get(k));
          pending.delete(k);
        }
      }
    }
    doors.push(door.sort((a, b) => a.ty - b.ty || a.tx - b.tx));
  }
  return doors;
}

/**
 * `requireKey` (default true) demands exactly one 'K'. With requireKey:false a map may have no card key
 * (cardKey is then null), but never two.
 */
export function parseMap(rows, { requireKey = true } = {}) {
  if (rows.length === 0 || rows[0].length === 0) throw new Error('map is empty');
  const cols = rows[0].length;
  if (rows.some((r) => r.length !== cols)) throw new Error('map rows are ragged (different lengths)');

  const found = { '@': [], K: [], X: [] };
  const spawns173 = [];
  const spawns096 = [];
  const doorTiles = [];
  const grid = rows.map((row, ty) =>
    [...row].map((ch, tx) => {
      if (ch === '#') return true;
      if (ch === 'X') {
        found.X.push({ tx, ty });
        return true;
      }
      if (!FLOOR_CHARS.has(ch)) throw new Error(`unknown map character '${ch}' at (${tx},${ty})`);
      if (ch === '@' || ch === 'K') found[ch].push({ tx, ty });
      if (ch === 'S') spawns173.push(tileCenter(tx, ty));
      if (ch === 'D') doorTiles.push({ tx, ty });
      if (ch in FACING_096) spawns096.push({ pos: tileCenter(tx, ty), facing: FACING_096[ch] });
      return false;
    }),
  );

  for (const marker of ['@', 'K', 'X']) {
    const count = found[marker].length;
    const allowed = marker === 'K' && !requireKey ? count <= 1 : count === 1;
    if (!allowed) throw new Error(`map needs exactly one '${marker}'${marker === 'K' && !requireKey ? ' (or none)' : ''}, found ${count}`);
  }
  const [start] = found['@'];
  const [key] = found.K;
  return {
    grid,
    cols,
    rows: rows.length,
    playerStart: tileCenter(start.tx, start.ty),
    cardKey: key ? tileCenter(key.tx, key.ty) : null,
    exit: found.X[0],
    spawns173,
    doors: groupDoors(doorTiles),
    spawns096,
  };
}
