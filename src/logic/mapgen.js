import { AGGRO_TILES, MAX_GEN_ATTEMPTS, SPAWN_KEY_MIN_TILES, SPAWN_MIN_PATH, TILE, ZONE_COLS, ZONE_ROWS } from '../config.js';
import { TEST_MAP_ROWS } from '../data/testmap.js';
import { tileCenter, tileOf } from './grid.js';
import { parseMap } from './map.js';
import { createRng, hashSeed, randInt, shuffle } from './rng.js';
import { hasLineOfSight } from './vision.js';
import { findPath } from './pathfinding.js';
import { carveSideRoom, findDoorways, layoutZone } from './zonelayout.js';

// ZoneBuild = { map: ParsedMap, info: { zoneIndex, tries, usedFallback, rooms, pathLength } }.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Two 173s this many path tiles apart can never both be within AGGRO_TILES of the player, so they cannot pincer.
const SPAWN_GAP = 2 * AGGRO_TILES + 1;
const TUTORIAL_SPAWN_RADIUS = 4; // tiles from the middle room's centre
const SCP096_CENTER_RADIUS = 3; // tiles from its room's centre
const CARDINALS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const ARROW = new Map([[0, '>'], [Math.PI / 2, 'v'], [Math.PI, '<'], [-Math.PI / 2, '^']]);
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const tileOfPoint = (p) => ({ tx: tileOf(p.x), ty: tileOf(p.y) });
const ITEM_CHAR = { eyedrops: 'a', stim: 'g' };
const key = (t) => `${t.tx},${t.ty}`;

/**
 * Every floor tile behind the side-room door: the room itself plus anything standing in it. The fill starts from the
 * side-room tiles touching that door, so a stray item tile elsewhere on the map does not drag the main rooms in.
 */
function sideRegion(map) {
  const doorTiles = map.doors[map.sideRoom.doorId];
  const door = new Set(doorTiles.map(key));
  const touchesDoor = (t) => doorTiles.some((d) => Math.abs(d.tx - t.tx) + Math.abs(d.ty - t.ty) === 1);
  const region = new Set();
  const stack = map.sideRoom.tiles.filter(touchesDoor);
  while (stack.length) {
    const t = stack.pop();
    const k = key(t);
    if (region.has(k) || door.has(k) || map.grid[t.ty]?.[t.tx] !== false) continue;
    region.add(k);
    for (const [dx, dy] of DIRS) stack.push({ tx: t.tx + dx, ty: t.ty + dy });
  }
  return region;
}

/** Side-room rules (D84): it exists, has a door, is reachable, holds nothing but the promised item, and no 173 is near. */
function inspectSideRoom(map, spec, open, fromStart, problems) {
  const at = (field, t) => field[t.ty * map.cols + t.tx];
  if (!map.sideRoom) {
    problems.push('side room missing');
    return;
  }
  const { tiles, doorId } = map.sideRoom;
  if (tiles.every((t) => at(fromStart, t) < 0)) problems.push('side room unreachable');
  map.spawns173.forEach((s, i) => {
    const field = distanceField(open, tileOf(s.x), tileOf(s.y));
    const d = Math.min(...tiles.map((t) => at(field, t)).filter((v) => v >= 0));
    if (d < SPAWN_GAP) problems.push(`scp173 ${i} only ${d} path tiles from the side room`);
  });
  if (doorId === null) {
    problems.push('side room has no door');
    return;
  }
  const region = sideRegion(map);
  const inside = (p) => region.has(key(tileOfPoint(p)));
  if (inside(map.playerStart)) problems.push('player start inside the side room');
  if (map.cardKey && inside(map.cardKey)) problems.push('card key inside the side room');
  map.spawns173.forEach((s, i) => inside(s) && problems.push(`scp173 ${i} inside the side room`));
  map.spawns096.forEach(({ pos }, i) => inside(pos) && problems.push(`scp096 ${i} inside the side room`));
  const kept = map.items.filter((it) => inside(it.pos));
  for (const it of map.items) if (!inside(it.pos)) problems.push('item outside the side room');
  const { truthful, item } = spec.instruction;
  if (truthful) {
    const n = kept.filter((it) => it.kind === item).length;
    if (n !== 1) problems.push(`expected 1 ${item} in the side room, found ${n}`);
    for (const it of kept) if (it.kind !== item) problems.push(`unexpected ${it.kind} in the side room`);
  } else if (kept.length) {
    problems.push(`expected no item in the side room, found ${kept.length}`);
  }
}
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

  const want096 = spec.scp096Count ?? 0;
  if (map.spawns096.length !== want096) problems.push(`expected ${want096} scp096, found ${map.spawns096.length}`);
  map.spawns096.forEach(({ pos }, i) => {
    const t = tileOfPoint(pos);
    const d = at(fromStart, t);
    if (d < 0) problems.push(`scp096 ${i} unreachable from the start`);
    else if (d < SPAWN_MIN_PATH) problems.push(`scp096 ${i} only ${d} path tiles from the start`);
    if (hasLineOfSight(map.grid, map.playerStart, pos)) problems.push(`scp096 ${i} visible from the start`);
    const field = distanceField(open, t.tx, t.ty);
    spawnTiles.forEach((s, j) => {
      const gap = at(field, s);
      if (gap >= 0 && gap < SPAWN_GAP) problems.push(`scp096 ${i} and spawn ${j} are ${gap} path tiles apart`);
    });
  });

  if (spec.instruction) inspectSideRoom(map, spec, open, fromStart, problems);

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
  const layout = layoutZone(rng, { cols: ZONE_COLS, rows: ZONE_ROWS, roomCount: spec.roomCount });
  const { rooms, edges } = layout;
  // v0.4: every zone with an instruction gets a dead-end side room; it is never an entrance/exit/key/monster room.
  const side = spec.instruction ? carveSideRoom(rng, layout) : null;
  if (spec.instruction && !side) return null;
  const grid = side ? side.grid : layout.grid;
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
  let keyRoom = -1;
  if (spec.hasKey) {
    if (!others.length) return null;
    const degree = rooms.map((_, i) => edges.filter((e) => e.includes(i)).length);
    const leaves = others.filter((i) => degree[i] === 1);
    const pool = leaves.length ? leaves : others;
    const detour = (i) => fromStart[idx(anchors[i])] + fromDoor[idx(anchors[i])];
    keyRoom = pool.reduce((best, i) => (detour(i) > detour(best) ? i : best), pool[0]);
    const spots = floorTiles(grid, rooms[keyRoom], 2);
    if (!spots.length) return null;
    key = spots[randInt(rng, 0, spots.length - 1)];
  }

  const doorways = findDoorways(grid, side ? [...rooms, side.room] : rooms);
  const startPoint = tileCenter(start.tx, start.ty);
  // Every way into the side room passes its doorway, so a 173 far enough from one door tile is far from the room.
  let sideField = null;
  if (side) {
    const touches = (t) => DIRS.some(([dx, dy]) => inRoom(side.room, t.tx + dx, t.ty + dy));
    const sideDoor = doorways.find((g) => g.some(touches));
    if (!sideDoor) return null;
    sideField = distanceField(open, sideDoor[0].tx, sideDoor[0].ty);
  }

  // SCP-096 goes in first: a spare room on the way (not entrance, exit or card-key room), near its centre, hidden
  // from the start. It sits facing at least 90 degrees away from the doorway the shortest route arrives through.
  const placed096 = [];
  if (spec.scp096Count) {
    const doorTile = new Set(doorways.flat().map((t) => `${t.tx},${t.ty}`));
    for (const i of shuffle(rng, others.filter((i) => i !== keyRoom))) {
      if (placed096.length === spec.scp096Count) break;
      const c = centerTile(rooms[i]);
      const spots = floorTiles(grid, rooms[i], 0).filter(
        (t) =>
          Math.hypot(t.tx - c.tx, t.ty - c.ty) <= SCP096_CENTER_RADIUS &&
          fromStart[idx(t)] >= SPAWN_MIN_PATH &&
          !hasLineOfSight(grid, startPoint, tileCenter(t.tx, t.ty)),
      );
      if (!spots.length) continue;
      const t = spots[randInt(rng, 0, spots.length - 1)];
      const route = findPath(open, start, t) ?? [];
      const arrival = [...route].reverse().find((p) => doorTile.has(`${p.tx},${p.ty}`));
      if (!arrival) continue;
      const toDoor = Math.atan2(arrival.ty - t.ty, arrival.tx - t.tx);
      const facings = CARDINALS.filter((f) => angleDiff(f, toDoor) >= Math.PI / 2);
      placed096.push({ tile: t, room: i, facing: facings[randInt(rng, 0, facings.length - 1)] });
    }
    if (placed096.length < spec.scp096Count) return null;
  }
  const fields096 = placed096.map(({ tile }) => distanceField(open, tile.tx, tile.ty));

  const spawnRooms = (spec.isTutorial ? others : rooms.map((_, i) => i).filter((i) => i !== entrance)).filter(
    (i) => !placed096.some((p) => p.room === i),
  );
  const candidates = [];
  for (const i of spawnRooms) {
    const c = centerTile(rooms[i]);
    for (const t of floorTiles(grid, rooms[i], 0)) {
      if (spec.isTutorial && Math.hypot(t.tx - c.tx, t.ty - c.ty) > TUTORIAL_SPAWN_RADIUS) continue;
      if (fromStart[idx(t)] < SPAWN_MIN_PATH) continue;
      if (key && Math.hypot(t.tx - key.tx, t.ty - key.ty) < SPAWN_KEY_MIN_TILES) continue;
      if (fields096.some((field) => field[idx(t)] < SPAWN_GAP)) continue;
      if (sideField && sideField[idx(t)] < SPAWN_GAP) continue;
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
  if (side) {
    const r = side.room;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) chars[y][x] = ',';
    if (spec.instruction.truthful) chars[r.y + Math.floor(r.h / 2)][r.x + Math.floor(r.w / 2)] = ITEM_CHAR[spec.instruction.item];
  }
  chars[start.ty][start.tx] = '@';
  chars[door.ty][door.tx] = 'X';
  if (key) chars[key.ty][key.tx] = 'K';
  for (const s of spawns) chars[s.ty][s.tx] = 'S';
  for (const d of doorways.flat()) chars[d.ty][d.tx] = 'D';
  for (const p of placed096) chars[p.tile.ty][p.tile.tx] = ARROW.get(p.facing);
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
