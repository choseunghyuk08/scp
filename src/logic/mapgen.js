import { AGGRO_TILES, MAX_GEN_ATTEMPTS, SPAWN_KEY_MIN_TILES, SPAWN_MIN_PATH, TILE, ZONE_COLS, ZONE_ROWS } from '../config.js';
import { TEST_MAP_ROWS } from '../data/testmap.js';
import { tileCenter, tileOf } from './grid.js';
import { parseMap } from './map.js';
import { createRng, hashSeed, randInt, shuffle } from './rng.js';
import { hasLineOfSight } from './vision.js';
import { layoutZone } from './zonelayout.js';

// ZoneBuild = { map: ParsedMap, info: { zoneIndex, tries, usedFallback, rooms, pathLength } }.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Two 173s this many path tiles apart can never both be within AGGRO_TILES of the player, so they cannot pincer.
const SPAWN_GAP = 2 * AGGRO_TILES + 1;
const TUTORIAL_SPAWN_RADIUS = 4; // tiles from the middle room's centre

const tileOfPoint = (p) => ({ tx: tileOf(p.x), ty: tileOf(p.y) });
const centerTile = (r) => ({ tx: r.x + Math.floor(r.w / 2), ty: r.y + Math.floor(r.h / 2) });

/** BFS step counts from (tx, ty) over floor tiles, flat-indexed by ty * cols + tx; -1 = unreachable. */
function distanceField(grid, tx, ty) {
  const rows = grid.length;
  const cols = grid[0].length;
  const dist = new Int32Array(rows * cols).fill(-1);
  if (grid[ty]?.[tx] !== false) return dist;
  const queue = new Int32Array(rows * cols);
  let head = 0;
  let tail = 0;
  dist[ty * cols + tx] = 0;
  queue[tail++] = ty * cols + tx;
  while (head < tail) {
    const i = queue[head++];
    const x = i % cols;
    const y = (i - x) / cols;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || grid[ny][nx]) continue;
      const j = ny * cols + nx;
      if (dist[j] !== -1) continue;
      dist[j] = dist[i] + 1;
      queue[tail++] = j;
    }
  }
  return dist;
}

function withExitOpen(map) {
  const open = map.grid.map((row) => [...row]);
  open[map.exit.ty][map.exit.tx] = false;
  return open;
}

/** Shared by validation and the builder: the rule problems plus the start->(key)->exit route length. */
function inspect(map, spec) {
  const problems = [];
  if (spec.hasKey && !map.cardKey) problems.push('card key missing');
  if (!spec.hasKey && map.cardKey) problems.push('unexpected card key');
  if (map.spawns173.length !== spec.scp173Count) {
    problems.push(`expected ${spec.scp173Count} scp173 spawns, found ${map.spawns173.length}`);
  }

  const open = withExitOpen(map);
  const at = (field, t) => field[t.ty * map.cols + t.tx];
  const start = tileOfPoint(map.playerStart);
  const fromStart = distanceField(open, start.tx, start.ty);

  let length = null;
  if (map.cardKey) {
    const key = tileOfPoint(map.cardKey);
    const toKey = at(fromStart, key);
    const keyToExit = toKey < 0 ? -1 : at(distanceField(open, key.tx, key.ty), map.exit);
    if (toKey < 0) problems.push('card key unreachable');
    else if (keyToExit < 0) problems.push('exit unreachable');
    else length = toKey + keyToExit;
  } else {
    const toExit = at(fromStart, map.exit);
    if (toExit < 0) problems.push('exit unreachable');
    else length = toExit;
  }
  if (length !== null && length < spec.minPath) problems.push(`route ${length} shorter than minPath ${spec.minPath}`);

  const spawnTiles = map.spawns173.map(tileOfPoint);
  for (let i = 0; i < spawnTiles.length - 1; i++) {
    const field = distanceField(open, spawnTiles[i].tx, spawnTiles[i].ty);
    for (let j = i + 1; j < spawnTiles.length; j++) {
      const d = at(field, spawnTiles[j]);
      if (d >= 0 && d < SPAWN_GAP) problems.push(`spawns ${i} and ${j} are ${d} path tiles apart and can hunt at once`);
    }
  }

  map.spawns173.forEach((s, i) => {
    const d = at(fromStart, tileOfPoint(s));
    if (d < 0) problems.push(`spawn ${i} unreachable from the start`);
    else if (d < SPAWN_MIN_PATH) problems.push(`spawn ${i} only ${d} path tiles from the start`);
    if (hasLineOfSight(map.grid, map.playerStart, s)) problems.push(`spawn ${i} visible from the start`);
    if (map.cardKey && Math.hypot(s.x - map.cardKey.x, s.y - map.cardKey.y) / TILE < SPAWN_KEY_MIN_TILES) {
      problems.push(`spawn ${i} within ${SPAWN_KEY_MIN_TILES} tiles of the card key`);
    }
  });
  return { problems, length };
}

export function validateZoneMap(map, spec) {
  return inspect(map, spec).problems;
}

function floorTiles(grid, room, inset) {
  const tiles = [];
  for (let y = room.y + inset; y < room.y + room.h - inset; y++) {
    for (let x = room.x + inset; x < room.x + room.w - inset; x++) if (!grid[y][x]) tiles.push({ tx: x, ty: y });
  }
  return tiles;
}

function nearestFloor(grid, room) {
  const c = centerTile(room);
  if (!grid[c.ty][c.tx]) return c;
  const tiles = floorTiles(grid, room, 0);
  tiles.sort((a, b) => Math.hypot(a.tx - c.tx, a.ty - c.ty) - Math.hypot(b.tx - c.tx, b.ty - c.ty));
  return tiles[0] ?? null;
}

const inRoom = (room, x, y) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;

/** A wall just outside the room's edge whose only floor neighbour is that edge tile (so it is not a corridor mouth). */
function pickDoor(rng, grid, room) {
  const rows = grid.length;
  const cols = grid[0].length;
  const doors = [];
  for (const { tx, ty } of floorTiles(grid, room, 0)) {
    const onEdge = tx === room.x || tx === room.x + room.w - 1 || ty === room.y || ty === room.y + room.h - 1;
    if (!onEdge) continue;
    for (const [dx, dy] of DIRS) {
      const wx = tx + dx;
      const wy = ty + dy;
      if (inRoom(room, wx, wy) || wx < 1 || wy < 1 || wx > cols - 2 || wy > rows - 2 || !grid[wy][wx]) continue;
      const floors = DIRS.filter(([ex, ey]) => grid[wy + ey][wx + ex] === false).length;
      if (floors === 1) doors.push({ tx: wx, ty: wy });
    }
  }
  return doors.length ? doors[randInt(rng, 0, doors.length - 1)] : null;
}

function tryBuild(rng, spec) {
  const { grid, rooms, edges } = layoutZone(rng, { cols: ZONE_COLS, rows: ZONE_ROWS, roomCount: spec.roomCount });
  const idx = (t) => t.ty * ZONE_COLS + t.tx;
  const anchors = rooms.map((r) => nearestFloor(grid, r));
  if (anchors.some((a) => !a)) return null;

  // Entrance and exit rooms: the pair farthest apart on foot.
  const fields = anchors.map((a) => distanceField(grid, a.tx, a.ty));
  let pairs = [];
  let far = -1;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const d = fields[i][idx(anchors[j])];
      if (d > far) [far, pairs] = [d, [[i, j]]];
      else if (d === far) pairs.push([i, j]);
    }
  }
  const [a, b] = pairs[randInt(rng, 0, pairs.length - 1)];
  const [entrance, exitRoom] = rng() < 0.5 ? [a, b] : [b, a];
  const start = anchors[entrance];

  const door = pickDoor(rng, grid, rooms[exitRoom]);
  if (!door) return null;
  const open = grid.map((row) => [...row]);
  open[door.ty][door.tx] = false;
  const fromStart = distanceField(open, start.tx, start.ty);
  const fromDoor = distanceField(open, door.tx, door.ty);
  const others = rooms.map((_, i) => i).filter((i) => i !== entrance && i !== exitRoom);

  let key = null;
  if (spec.hasKey) {
    if (!others.length) return null;
    const degree = rooms.map((_, i) => edges.filter((e) => e.includes(i)).length);
    const leaves = others.filter((i) => degree[i] === 1);
    const pool = leaves.length ? leaves : others;
    const detour = (i) => fromStart[idx(anchors[i])] + fromDoor[idx(anchors[i])];
    const keyRoom = pool.reduce((best, i) => (detour(i) > detour(best) ? i : best), pool[0]);
    const spots = floorTiles(grid, rooms[keyRoom], 2);
    if (!spots.length) return null;
    key = spots[randInt(rng, 0, spots.length - 1)];
  }

  const spawnRooms = spec.isTutorial ? others : rooms.map((_, i) => i).filter((i) => i !== entrance);
  const startPoint = tileCenter(start.tx, start.ty);
  const candidates = [];
  for (const i of spawnRooms) {
    const c = centerTile(rooms[i]);
    for (const t of floorTiles(grid, rooms[i], 0)) {
      if (spec.isTutorial && Math.hypot(t.tx - c.tx, t.ty - c.ty) > TUTORIAL_SPAWN_RADIUS) continue;
      if (fromStart[idx(t)] < SPAWN_MIN_PATH) continue;
      if (key && Math.hypot(t.tx - key.tx, t.ty - key.ty) < SPAWN_KEY_MIN_TILES) continue;
      if (hasLineOfSight(grid, startPoint, tileCenter(t.tx, t.ty))) continue;
      candidates.push(t);
    }
  }
  const spawns = [];
  const spawnFields = [];
  for (const t of shuffle(rng, candidates)) {
    if (spawns.length === spec.scp173Count) break;
    if (spawnFields.every((field) => field[idx(t)] >= SPAWN_GAP)) {
      spawns.push(t);
      spawnFields.push(distanceField(open, t.tx, t.ty));
    }
  }
  if (spawns.length < spec.scp173Count) return null;

  const chars = grid.map((row) => row.map((wall) => (wall ? '#' : '.')));
  chars[start.ty][start.tx] = '@';
  chars[door.ty][door.tx] = 'X';
  if (key) chars[key.ty][key.tx] = 'K';
  for (const s of spawns) chars[s.ty][s.tx] = 'S';
  return { map: parseMap(chars.map((row) => row.join('')), { requireKey: spec.hasKey }), rooms };
}

/** Tries seeds hashSeed(runSeed, zone, attempt, t) until one validates; after maxAttempts uses the fixed map. */
export function buildZone(runSeed, spec, attempt, { maxAttempts = MAX_GEN_ATTEMPTS } = {}) {
  for (let t = 0; t < maxAttempts; t++) {
    const built = tryBuild(createRng(hashSeed(runSeed, spec.index, attempt, t)), spec);
    if (!built) continue;
    const { problems, length } = inspect(built.map, spec);
    if (problems.length) continue;
    return {
      map: built.map,
      info: { zoneIndex: spec.index, tries: t + 1, usedFallback: false, rooms: built.rooms, pathLength: length },
    };
  }
  const fallback = fallbackZone(spec);
  return { ...fallback, info: { ...fallback.info, tries: maxAttempts } };
}

/** The hand-made v0.1 map, minus its card key when this zone has none. Always playable. */
export function fallbackZone(spec) {
  const rows = spec.hasKey ? TEST_MAP_ROWS : TEST_MAP_ROWS.map((row) => row.replace('K', '.'));
  const map = parseMap(rows, { requireKey: spec.hasKey });
  return {
    map,
    info: { zoneIndex: spec.index, tries: 0, usedFallback: true, rooms: [], pathLength: inspect(map, spec).length ?? 0 },
  };
}
