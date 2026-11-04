import { randInt, shuffle } from './rng.js';

// Rect = {x, y, w, h} in tiles. ZoneLayout = {grid, rooms, edges}: grid[ty][tx] true = wall,
// rooms are the generated rooms, edges are the corridor tree as pairs of room indices.

const LEAF_MIN = { w: 10, h: 8 };
const ROOM_W = [8, 16];
const ROOM_H = [6, 10];
const PILLAR_MIN_AREA = 80;

const centerOf = (r) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

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

function bspLeaves(rng, area, target) {
  const leaves = [area];
  while (leaves.length < target) {
    const order = leaves.map((leaf, i) => i).sort((a, b) => leaves[b].w * leaves[b].h - leaves[a].w * leaves[a].h);
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

export function layoutZone(rng, { cols, rows, roomCount }) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(true));
  const set = (x, y, wall) => {
    if (x >= 1 && y >= 1 && x <= cols - 2 && y <= rows - 2) grid[y][x] = wall;
  };

  const leaves = bspLeaves(rng, { x: 1, y: 1, w: cols - 2, h: rows - 2 }, roomCount + randInt(rng, 0, 2));
  const rooms = shuffle(rng, leaves).slice(0, roomCount).map((leaf) => roomIn(rng, leaf));
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

  // Prim: repeatedly join the closest unconnected room to the connected set with a 2-wide L corridor.
  const edges = [];
  const connected = [randInt(rng, 0, rooms.length - 1)];
  while (connected.length < rooms.length) {
    let best = null;
    for (const a of connected) {
      for (let b = 0; b < rooms.length; b++) {
        if (connected.includes(b)) continue;
        const ca = centerOf(rooms[a]);
        const cb = centerOf(rooms[b]);
        const d = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    edges.push([best.a, best.b]);
    connected.push(best.b);
    carveCorridor(set, centerOf(rooms[best.a]), centerOf(rooms[best.b]), rng() < 0.5);
  }

  return { grid, rooms, edges };
}

function carveCorridor(set, a, b, horizontalFirst) {
  const run = (from, to, fn) => {
    for (let v = Math.min(from, to); v <= Math.max(from, to) + 1; v++) fn(v);
  };
  if (horizontalFirst) {
    run(a.x, b.x, (x) => (set(x, a.y, false), set(x, a.y + 1, false)));
    run(a.y, b.y, (y) => (set(b.x, y, false), set(b.x + 1, y, false)));
  } else {
    run(a.y, b.y, (y) => (set(a.x, y, false), set(a.x + 1, y, false)));
    run(a.x, b.x, (x) => (set(x, b.y, false), set(x, b.y + 1, false)));
  }
}
