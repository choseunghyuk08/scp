import { SIDE_ROOM } from '../config.js';
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
  // A corridor may touch its own two rooms only at its 2-tile mouth; running along a room's wall would leave that
  // side open with no doorway to put a door in.
  const meetsRoomsHeadOn = (cells) => {
    const outside = new Map();
    for (const c of cells) if (!inRect(A, c.x, c.y) && !inRect(B, c.x, c.y)) outside.set(`${c.x},${c.y}`, c);
    for (const room of [A, B]) {
      let touching = 0;
      for (const c of outside.values()) if (DIRS.some(([dx, dy]) => inRect(room, c.x + dx, c.y + dy))) touching++;
      if (touching > 2) return false;
    }
    return true;
  };
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
    return meetsRoomsHeadOn(cells);
  };

  let best = null;
  for (let i = 0; i < WAYPOINT_SAMPLES; i++) {
    const w = { x: randInt(rng, 2, cols - 4), y: randInt(rng, 2, rows - 4) };
    const detour = manhattan(a, w) + manhattan(w, b) - straight;
    if (detour > DETOUR_MAX || (best && detour <= best.detour)) continue;
    const cells = [...lCells(a, w, rng() < 0.5), ...lCells(w, b, rng() < 0.5)];
    if (clean(cells)) best = { cells, detour };
  }
  if (best) return best.cells;
  const first = rng() < 0.5;
  const plain = [lCells(a, b, first), lCells(a, b, !first)];
  return plain.find(meetsRoomsHeadOn) ?? plain[0];
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

/**
 * Doorways: floor tiles just outside a room that touch one of its edge tiles, grouped 4-connected. Only two-tile
 * groups (a 2-wide corridor meeting the wall head-on) count; a corridor running along a wall is not a doorway.
 */
export function findDoorways(grid, rooms) {
  const inAnyRoom = (x, y) => rooms.some((r) => inRect(r, x, y));
  const out = [];
  for (const r of rooms) {
    const mouth = new Map();
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x !== r.x && x !== r.x + r.w - 1 && y !== r.y && y !== r.y + r.h - 1) continue;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (grid[ny]?.[nx] === false && !inAnyRoom(nx, ny)) mouth.set(`${nx},${ny}`, { tx: nx, ty: ny });
        }
      }
    }
    const seen = new Set();
    for (const [k, t] of mouth) {
      if (seen.has(k)) continue;
      const group = [];
      const stack = [t];
      seen.add(k);
      while (stack.length) {
        const cur = stack.pop();
        group.push(cur);
        for (const [dx, dy] of DIRS) {
          const nk = `${cur.tx + dx},${cur.ty + dy}`;
          if (mouth.has(nk) && !seen.has(nk)) {
            seen.add(nk);
            stack.push(mouth.get(nk));
          }
        }
      }
      if (group.length === 2) out.push(group.sort((a, b) => a.ty - b.ty || a.tx - b.tx));
    }
  }
  return out;
}

const SIDE_ROOM_TRIES = 200;

/**
 * A dead-end side room (D84) carved into empty wall space next to one chain room, joined to it by a straight 2-wide
 * corridor. Nothing within a tile of the new room or corridor is floor except the anchor room the corridor meets
 * head-on, so the side room opens no shortcut. Returns a new grid (the input is untouched), or null when no spot fits.
 */
export function carveSideRoom(rng, { grid, rooms }) {
  const rows = grid.length;
  const cols = grid[0].length;
  const interior = (x, y) => x >= 1 && y >= 1 && x <= cols - 2 && y <= rows - 2;
  for (let n = 0; n < SIDE_ROOM_TRIES; n++) {
    const anchor = randInt(rng, 0, rooms.length - 1);
    const A = rooms[anchor];
    const w = randInt(rng, SIDE_ROOM.minW, SIDE_ROOM.maxW);
    const h = randInt(rng, SIDE_ROOM.minH, SIDE_ROOM.maxH);
    const len = randInt(rng, SIDE_ROOM.corridor[0], SIDE_ROOM.corridor[1]);
    const side = randInt(rng, 0, 3); // 0 east, 1 west, 2 south, 3 north
    const horizontal = side < 2;
    if ((horizontal ? A.h : A.w) < 2) continue;
    // The corridor's two lanes lie inside the anchor's span on that side; the room covers both lanes.
    const lane = horizontal ? randInt(rng, A.y, A.y + A.h - 2) : randInt(rng, A.x, A.x + A.w - 2);
    const span = horizontal ? h : w;
    const offset = randInt(rng, lane + 2 - span, lane);
    let room;
    const corridor = [];
    if (horizontal) {
      const x0 = side === 0 ? A.x + A.w : A.x - len;
      room = { x: side === 0 ? x0 + len : x0 - w, y: offset, w, h };
      for (let x = x0; x < x0 + len; x++) corridor.push({ x, y: lane }, { x, y: lane + 1 });
    } else {
      const y0 = side === 2 ? A.y + A.h : A.y - len;
      room = { x: offset, y: side === 2 ? y0 + len : y0 - h, w, h };
      for (let y = y0; y < y0 + len; y++) corridor.push({ x: lane, y }, { x: lane + 1, y });
    }
    if (!interior(room.x, room.y) || !interior(room.x + room.w - 1, room.y + room.h - 1)) continue;
    // The room plus a one-tile margin must be solid wall today.
    let free = true;
    for (let y = room.y - 1; free && y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        if (grid[y]?.[x] !== true) {
          free = false;
          break;
        }
      }
    }
    if (!free) continue;
    const own = new Set(corridor.map((c) => `${c.x},${c.y}`));
    const clean = corridor.every((c) => {
      if (!interior(c.x, c.y) || grid[c.y][c.x] !== true) return false;
      return DIRS.every(([dx, dy]) => {
        const nx = c.x + dx;
        const ny = c.y + dy;
        return grid[ny]?.[nx] !== false || inRect(A, nx, ny) || own.has(`${nx},${ny}`);
      });
    });
    if (!clean) continue;
    const out = grid.map((row) => [...row]);
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) out[y][x] = false;
    for (const c of corridor) out[c.y][c.x] = false;
    return { grid: out, room, anchor };
  }
  return null;
}
