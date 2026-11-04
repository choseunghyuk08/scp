import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GEN_ATTEMPTS, SPAWN_KEY_MIN_TILES, SPAWN_MIN_PATH, ZONE_COUNT } from '../../src/config.js';
import { tileOf } from '../../src/logic/grid.js';
import { parseMap } from '../../src/logic/map.js';
import { buildZone, fallbackZone, validateZoneMap } from '../../src/logic/mapgen.js';
import { findPath } from '../../src/logic/pathfinding.js';
import { keyZone, zoneSpec } from '../../src/logic/run.js';

// 32x9: a wall at column 11 (open only at row 6) hides the right room from the start.
const BASE = [
  '################################',
  '#@.........#...................#',
  '#..........#...................#',
  '#..........#.........S.........#',
  '#..........#...................#',
  '#..........#...................#',
  '#..............................#',
  '#..........#...............K...X',
  '################################',
];
const SPEC = { index: 1, isTutorial: false, isFinal: false, hasKey: true, roomCount: 3, minPath: 30, scp173Count: 1 };
const edit = (rows, edits) =>
  rows.map((row, y) => [...row].map((ch, x) => edits.find((e) => e.x === x && e.y === y)?.ch ?? ch).join(''));
const problems = (rows, spec = SPEC) => validateZoneMap(parseMap(rows, { requireKey: false }), spec);
const tileOfPoint = (p) => ({ tx: tileOf(p.x), ty: tileOf(p.y) });
const roomOf = (rooms, t) => rooms.findIndex((r) => t.tx >= r.x && t.tx < r.x + r.w && t.ty >= r.y && t.ty < r.y + r.h);
const doorRoom = (map, rooms) => {
  const { tx, ty } = map.exit;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const i = roomOf(rooms, { tx: tx + dx, ty: ty + dy });
    if (i >= 0) return i;
  }
  return -1;
};

test('config: generation limits', () => {
  assert.equal(MAX_GEN_ATTEMPTS, 50);
  assert.equal(SPAWN_MIN_PATH, 15);
  assert.equal(SPAWN_KEY_MIN_TILES, 5);
});

test('validateZoneMap accepts the hand-made base map', () => assert.deepEqual(problems(BASE), []));

test('validateZoneMap reports each rule violation', () => {
  const sealedKey = edit(BASE, [{ x: 26, y: 7, ch: '#' }, { x: 28, y: 7, ch: '#' }, { x: 27, y: 6, ch: '#' }]);
  assert.ok(problems(sealedKey).some((p) => /card key unreachable/.test(p)));
  const sealedExit = edit(BASE, [{ x: 30, y: 7, ch: '#' }]);
  assert.ok(problems(sealedExit).some((p) => /exit unreachable/.test(p)));
  const visible = edit(BASE, [{ x: 21, y: 3, ch: '.' }, { x: 5, y: 4, ch: 'S' }]);
  assert.ok(problems(visible).some((p) => /visible/.test(p)));
  const nearKey = edit(BASE, [{ x: 21, y: 3, ch: '.' }, { x: 25, y: 6, ch: 'S' }]);
  assert.ok(problems(nearKey).some((p) => /of the card key/.test(p)));
  const close = ['#######', '#@#S..#', '#.#...#', '#.....X', '#.....#', '#..K..#', '#######'];
  assert.ok(problems(close, { ...SPEC, minPath: 0 }).some((p) => /path tiles from the start/.test(p)));
  assert.ok(problems(BASE, { ...SPEC, scp173Count: 2 }).some((p) => /expected 2 scp173/.test(p)));
  assert.ok(problems(BASE, { ...SPEC, hasKey: false }).some((p) => /unexpected card key/.test(p)));
  const noKey = edit(BASE, [{ x: 27, y: 7, ch: '.' }]);
  assert.ok(problems(noKey).some((p) => /card key missing/.test(p)));
  assert.ok(problems(BASE, { ...SPEC, minPath: 1000 }).some((p) => /shorter than minPath 1000/.test(p)));
});

test('buildZone is deterministic for the same (runSeed, spec, attempt)', () => {
  const spec = zoneSpec(42, 2);
  assert.deepEqual(buildZone(42, spec, 3), buildZone(42, spec, 3));
});

test('buildZone output passes validateZoneMap for 40 seeds x 4 zones', () => {
  for (let seed = 0; seed < 40; seed++) {
    for (let z = 0; z < ZONE_COUNT; z++) {
      const spec = zoneSpec(seed, z);
      const { map, info } = buildZone(seed, spec, 0);
      assert.deepEqual(validateZoneMap(map, spec), [], `seed ${seed} zone ${z}`);
      assert.equal(info.zoneIndex, z);
      assert.equal(info.usedFallback, false, `fell back at seed ${seed} zone ${z}`);
    }
  }
});

test('a different attempt gives a different map for at least 95% of 100 seeds', () => {
  let differ = 0;
  for (let seed = 0; seed < 100; seed++) {
    const spec = zoneSpec(seed, 1);
    if (JSON.stringify(buildZone(seed, spec, 0).map.grid) !== JSON.stringify(buildZone(seed, spec, 1).map.grid)) differ++;
  }
  assert.ok(differ >= 95, `only ${differ} differ`);
});

test('tutorial: no card key, one 173 in the middle room near its centre, spawn not in the entrance room', () => {
  for (let seed = 0; seed < 30; seed++) {
    const { map, info } = buildZone(seed, zoneSpec(seed, 0), 0);
    assert.equal(map.cardKey, null);
    assert.equal(map.spawns173.length, 1);
    const entrance = roomOf(info.rooms, tileOfPoint(map.playerStart));
    const exit = doorRoom(map, info.rooms);
    const spawnRoom = roomOf(info.rooms, tileOfPoint(map.spawns173[0]));
    assert.ok(entrance >= 0 && exit >= 0 && entrance !== exit, `seed ${seed}`);
    assert.ok(spawnRoom >= 0 && spawnRoom !== entrance && spawnRoom !== exit, `seed ${seed} spawn room ${spawnRoom}`);
    const r = info.rooms[spawnRoom];
    const c = { tx: r.x + Math.floor(r.w / 2), ty: r.y + Math.floor(r.h / 2) };
    const s = tileOfPoint(map.spawns173[0]);
    assert.ok(Math.hypot(s.tx - c.tx, s.ty - c.ty) <= 4, `seed ${seed} spawn far from the middle-room centre`);
  }
});

test('key zone: card key is outside the entrance and exit rooms', () => {
  for (let seed = 0; seed < 30; seed++) {
    const z = keyZone(seed);
    const { map, info } = buildZone(seed, zoneSpec(seed, z), 0);
    assert.ok(map.cardKey, `seed ${seed}`);
    const keyRoom = roomOf(info.rooms, tileOfPoint(map.cardKey));
    assert.ok(keyRoom >= 0, `seed ${seed} key outside any room`);
    assert.notEqual(keyRoom, roomOf(info.rooms, tileOfPoint(map.playerStart)));
    assert.notEqual(keyRoom, doorRoom(map, info.rooms));
  }
});

test('the exit door has exactly one floor neighbour', () => {
  for (let seed = 0; seed < 30; seed++) {
    const { map } = buildZone(seed, zoneSpec(seed, 3), 0);
    const { tx, ty } = map.exit;
    const floors = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => map.grid[ty + dy]?.[tx + dx] === false);
    assert.equal(floors.length, 1, `seed ${seed}`);
  }
});

test('maxAttempts 0 falls back to a playable map for key and no-key specs', () => {
  for (const hasKey of [true, false]) {
    const spec = { ...zoneSpec(5, 1), hasKey };
    const { map, info } = buildZone(5, spec, 0, { maxAttempts: 0 });
    assert.equal(info.usedFallback, true);
    assert.equal(Boolean(map.cardKey), hasKey);
    const open = map.grid.map((row) => [...row]);
    open[map.exit.ty][map.exit.tx] = false;
    const start = tileOfPoint(map.playerStart);
    if (hasKey) {
      assert.ok(findPath(open, start, tileOfPoint(map.cardKey)));
      assert.ok(findPath(open, tileOfPoint(map.cardKey), map.exit));
    } else {
      assert.ok(findPath(open, start, map.exit));
    }
    assert.deepEqual(fallbackZone(spec).map, map);
  }
});

test('info.tries is between 1 and maxAttempts when the fallback is not used', () => {
  for (let seed = 0; seed < 20; seed++) {
    const { info } = buildZone(seed, zoneSpec(seed, 2), 0);
    assert.ok(info.tries >= 1 && info.tries <= MAX_GEN_ATTEMPTS, `tries ${info.tries}`);
    assert.ok(info.pathLength >= zoneSpec(seed, 2).minPath);
  }
});
