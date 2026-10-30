import { tileCenter } from './grid.js';

// Legend: # wall, . floor, @ player start, K card key, X exit door (solid), S SCP-173 spawn.
const FLOOR_CHARS = new Set(['.', '@', 'K', 'S']);

export function parseMap(rows) {
  if (rows.length === 0 || rows[0].length === 0) throw new Error('map is empty');
  const cols = rows[0].length;
  if (rows.some((r) => r.length !== cols)) throw new Error('map rows are ragged (different lengths)');

  const found = { '@': [], K: [], X: [] };
  const spawns173 = [];
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
      return false;
    }),
  );

  for (const marker of ['@', 'K', 'X']) {
    if (found[marker].length !== 1) {
      throw new Error(`map needs exactly one '${marker}', found ${found[marker].length}`);
    }
  }
  const [start] = found['@'];
  const [key] = found.K;
  return {
    grid,
    cols,
    rows: rows.length,
    playerStart: tileCenter(start.tx, start.ty),
    cardKey: tileCenter(key.tx, key.ty),
    exit: found.X[0],
    spawns173,
  };
}
