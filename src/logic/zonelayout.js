import { randInt, shuffle } from './rng.js';

// Rect = {x, y, w, h} in tiles. ZoneLayout = {grid, rooms, edges}: grid[ty][tx] true = wall,
// rooms are the generated rooms, edges are the corridors as pairs of room indices (a single chain).

const LEAF_MIN = { w: 10, h: 8 };
const ROOM_W = [8, 16];
const ROOM_H = [6, 10];
const PILLAR_MIN_AREA = 80;
const DETOUR_MAX = 40; // extra corridor tiles a bend may add over the straight L
const WAYPOINT_SAMPLES = 24;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const centerOf = (r) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Splits along the longer side at 35..65%, keeping both halves at least LEAF_MIN. Null if it cannot split. */
function splitLeaf(rng, leaf) {
  const canW = leaf.w >= LEAF_MIN.w * 2;
  const canH = leaf.h >= LEAF_MIN.h * 2;
  if (!canW && !canH) return null;
  const vertical = canW && (!canH || leaf.w >= leaf.h);
  const size = vertical ? leaf.w : leaf.h;
  const min = vertical ? LEAF_MIN.w : LEAF_MIN.h;
  const at = randInt(rng, Math.max(min, Math.round(size * 0.35)), Math.min(size - min, Math.round(size * 0.65)));
  return vertical
    ? [{ ...leaf, w: at }, { ...leaf, x: leaf.x + at, w: leaf.w - at }]
    : [{ ...leaf, h: at }, { ...leaf, y: leaf.y + at, h: leaf.h - at }];
}

/** Exactly `count` leaves that tile the whole area, so the rooms end up spread across the zone. */
function bspLeaves(rng, area, count) {
  const leaves = [area];
  while (leaves.length < count) {
    const order = leaves.map((_, i) => i).sort((a, b) => leaves[b].w * leaves[b].h - leaves[a].w * leaves[a].h);
    const i = order.find((idx) => splitLeaf(rng, leaves[idx]) !== null);
    if (i === undefined) break;
    leaves.splice(i, 1, ...splitLeaf(rng, leaves[i]));
  }
  return leaves;
}

function roomIn(rng, leaf) {
  const w = randInt(rng, ROOM_W[0], Math.min(ROOM_W[1], leaf.w - 2));
  const h = randInt(rng, ROOM_H[0], Math.min(ROOM_H[1], leaf.h - 2));
  return {
    x: randInt(rng, leaf.x + 1, leaf.x + leaf.w - 1 - w),
    y: randInt(rng, leaf.y + 1, leaf.y + leaf.h - 1 - h),
    w,
    h,
  };
}

/** The room order whose consecutive centres are farthest apart in total (a long walk from end to end). */
function longestChain(rng, rooms) {
  const perms = (xs) =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
  let best = null;
  let bestLen = -1;
  for (const order of perms(rooms.map((_, i) => i))) {
    const len = order.slice(1).reduce((sum, r, k) => sum + manhattan(centerOf(rooms[order[k]]), centerOf(rooms[r])), 0);
    if (len > bestLen || (len === bestLen && rng() < 0.5)) [best, bestLen] = [order, len];
  }
  return best;
}

/** Tiles of a 2-wide L from a to b (horizontal leg first or vertical leg first). */
function lCells(a, b, horizontalFirst) {
  const cells = [];
  const run = (from, to, fn) => {
    for (let v = Math.min(from, to); v <= Math.max(from, to) + 1; v++) fn(v);
  };
  if (horizontalFirst) {
    run(a.x, b.x, (x) => cells.push({ x, y: a.y }, { x, y: a.y + 1 }));
    run(a.y, b.y, (y) => cells.push({ x: b.x, y }, { x: b.x + 1, y }));
  } else {
    run(a.y, b.y, (y) => cells.push({ x: a.x, y }, { x: a.x + 1, y }));
    run(a.x, b.x, (x) => cells.push({ x, y: b.y }, { x, y: b.y + 1 }));
  }
  return cells;
}

/**
 * A corridor from room A to room B that bends through a waypoint. Among sampled waypoints it keeps the longest
 * bend (up to DETOUR_MAX extra tiles) whose tiles never touch any floor except A, B and itself, so it cannot open a
 * shortcut into another room or corridor. Falls back to a plain L when no bend fits.
 */
function corridorCells(rng, grid, A, B) {
  const rows = grid.length;
  const cols = grid[0].length;
  const a = centerOf(A);
  const b = centerOf(B);
  const straight = manhattan(a, b);
  const clean = (cells) => {
    const own = new Set(cells.map((c) => `${c.x},${c.y}`));
    for (const c of cells) {
      if (inRect(A, c.x, c.y) || inRect(B, c.x, c.y)) continue;
      if (c.x < 1 || c.y < 1 || c.x > cols - 2 || c.y > rows - 2) return false;
      for (const [dx, dy] of [[0, 0], ...DIRS]) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (grid[ny]?.[nx] === false && !inRect(A, nx, ny) && !inRect(B, nx, ny) && !own.has(`${nx},${ny}`)) return false;
      }
    }
    return true;
  };

  let best = null;
  for (let i = 0; i < WAYPOINT_SAMPLES; i++) {
    const w = { x: randInt(rng, 2, cols - 4), y: randInt(rng, 2, rows - 4) };
    const detour = manhattan(a, w) + manhattan(w, b) - straight;
    if (detour > DETOUR_MAX || (best && detour <= best.detour)) continue;
    const cells = [...lCells(a, w, rng() < 0.5), ...lCells(w, b, rng() < 0.5)];
    if (clean(cells)) best = { cells, detour };
  }
  return best ? best.cells : lCells(a, b, rng() < 0.5);
}

export function layoutZone(rng, { cols, rows, roomCount }) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(true));
  const set = (x, y, wall) => {
    if (x >= 1 && y >= 1 && x <= cols - 2 && y <= rows - 2) grid[y][x] = wall;
  };

  const leaves = bspLeaves(rng, { x: 1, y: 1, w: cols - 2, h: rows - 2 }, roomCount);
  const rooms = shuffle(rng, leaves).map((leaf) => roomIn(rng, leaf));
  if (rooms.length < roomCount) throw new Error(`zone ${cols}x${rows} cannot hold ${roomCount} rooms`);

  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, false);

  // Pillars go in before corridors so a corridor always cuts through rather than being blocked.
  for (const r of rooms) {
    if (r.w * r.h < PILLAR_MIN_AREA) continue;
    for (let n = randInt(rng, 0, 2); n > 0; n--) {
      const px = randInt(rng, r.x + 2, r.x + r.w - 4);
      const py = randInt(rng, r.y + 2, r.y + r.h - 4);
      for (let y = py; y < py + 2; y++) for (let x = px; x < px + 2; x++) set(x, y, true);
    }
  }

  const order = longestChain(rng, rooms);
  const edges = [];
  for (let k = 1; k < order.length; k++) {
    const [i, j] = [order[k - 1], order[k]];
    edges.push([i, j]);
    for (const c of corridorCells(rng, grid, rooms[i], rooms[j])) set(c.x, c.y, false);
  }
  return { grid, rooms, edges };
}
