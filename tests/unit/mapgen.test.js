import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GEN_ATTEMPTS, SPAWN_KEY_MIN_TILES, SPAWN_MIN_PATH, ZONE_COUNT } from '../../src/config.js';
import { TRUE_RULES } from '../../src/logic/instructions.js';
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

// 80x5 corridor: a wall at column 10 (open on row 3) hides everything right of it from the start.
const LONG = [
  '#'.repeat(80),
  '#@' + '.'.repeat(8) + '#' + '.'.repeat(68) + '#',
  '#' + '.'.repeat(9) + '#' + '.'.repeat(68) + 'X',
  '#' + '.'.repeat(78) + '#',
  '#'.repeat(80),
];
const TWO = { index: 2, isTutorial: false, isFinal: false, hasKey: true, roomCount: 4, minPath: 0, scp173Count: 2 };

test('two 173s must be far enough apart that one player position cannot wake both (2 x AGGRO_TILES + 1 path tiles)', () => {
  const apart = edit(LONG, [{ x: 25, y: 3, ch: 'K' }, { x: 35, y: 1, ch: 'S' }, { x: 70, y: 1, ch: 'S' }]);
  assert.deepEqual(problems(apart, TWO), []);
  const close = edit(LONG, [{ x: 25, y: 3, ch: 'K' }, { x: 35, y: 1, ch: 'S' }, { x: 45, y: 1, ch: 'S' }]);
  assert.ok(problems(close, TWO).some((p) => /can hunt at once/.test(p)));
});

test('generated zones with two 173s keep them at least 29 path tiles apart', () => {
  for (let seed = 0; seed < 30; seed++) {
    const spec = zoneSpec(seed, 3);
    assert.deepEqual(validateZoneMap(buildZone(seed, spec, 0).map, spec), [], `seed ${seed}`);
  }
});

const SPEC096 = { index: 3, isTutorial: false, isFinal: true, hasKey: true, roomCount: 4, minPath: 0, scp173Count: 1, scp096Count: 1 };

test('validateZoneMap reports a missing 096, a 096 seen from the start, and a 096 too close to a 173', () => {
  const base = [{ x: 25, y: 3, ch: 'K' }, { x: 35, y: 1, ch: 'S' }];
  assert.deepEqual(problems(edit(LONG, [...base, { x: 70, y: 1, ch: '<' }]), SPEC096), []);
  assert.ok(problems(edit(LONG, base), SPEC096).some((p) => /expected 1 scp096/.test(p)));
  assert.ok(problems(edit(LONG, [...base, { x: 5, y: 1, ch: '<' }]), SPEC096).some((p) => /scp096 0 visible from the start/.test(p)));
  assert.ok(problems(edit(LONG, [...base, { x: 40, y: 1, ch: '<' }]), SPEC096).some((p) => /scp096 0 and spawn 0 are/.test(p)));
});

const roomCenterOf = (r) => ({ tx: r.x + Math.floor(r.w / 2), ty: r.y + Math.floor(r.h / 2) });

test('096 zones place one 096 outside the entrance, exit and key rooms, near its room centre', () => {
  for (let seed = 0; seed < 30; seed++) {
    for (const z of [2, 3]) {
      const { map, info } = buildZone(seed, zoneSpec(seed, z), 0);
      assert.equal(map.spawns096.length, 1, `seed ${seed} zone ${z}`);
      const t = tileOfPoint(map.spawns096[0].pos);
      const room = roomOf(info.rooms, t);
      assert.ok(room >= 0, `seed ${seed} zone ${z}: 096 outside every room`);
      const excluded = [roomOf(info.rooms, tileOfPoint(map.playerStart)), doorRoom(map, info.rooms)];
      if (map.cardKey) excluded.push(roomOf(info.rooms, tileOfPoint(map.cardKey)));
      assert.ok(!excluded.includes(room), `seed ${seed} zone ${z}: 096 in a forbidden room`);
      const c = roomCenterOf(info.rooms[room]);
      assert.ok(Math.hypot(t.tx - c.tx, t.ty - c.ty) <= 3, `seed ${seed} zone ${z}: 096 far from its room centre`);
    }
  }
});

test('the 096 never faces the doorway the shortest route arrives through (>= 90deg away)', () => {
  for (let seed = 0; seed < 30; seed++) {
    for (const z of [2, 3]) {
      const { map } = buildZone(seed, zoneSpec(seed, z), 0);
      const open = map.grid.map((row) => [...row]);
      open[map.exit.ty][map.exit.tx] = false;
      const { pos, facing } = map.spawns096[0];
      const path = findPath(open, tileOfPoint(map.playerStart), tileOfPoint(pos));
      const doorTiles = new Set(map.doors.flat().map((t) => `${t.tx},${t.ty}`));
      const arrival = [...path].reverse().find((t) => doorTiles.has(`${t.tx},${t.ty}`));
      assert.ok(arrival, `seed ${seed} zone ${z}: the route crosses no door`);
      const toDoor = Math.atan2(arrival.ty * 16 + 8 - pos.y, arrival.tx * 16 + 8 - pos.x);
      const diff = Math.abs(Math.atan2(Math.sin(facing - toDoor), Math.cos(facing - toDoor)));
      assert.ok(diff >= Math.PI / 2 - 1e-9, `seed ${seed} zone ${z}: faces ${diff} rad from its arrival doorway`);
    }
  }
});

test('doors are written at room entrances and start open', () => {
  for (let seed = 0; seed < 30; seed++) {
    for (let z = 0; z < ZONE_COUNT; z++) {
      const { map } = buildZone(seed, zoneSpec(seed, z), 0);
      assert.ok(map.doors.length > 0, `seed ${seed} zone ${z}: no doors`);
      for (const door of map.doors) {
        assert.equal(door.length, 2);
        for (const t of door) assert.equal(map.grid[t.ty][t.tx], false);
      }
    }
  }
});

// ---- v0.4 side rooms ----
// BASE with a side room under the left room: corridor (3..4, 8), door (3..4, 9), room x 2..6, y 10..11.
const SIDE_MAP = [
  '################################',
  '#@.........#.................S.#',
  '#..........#...................#',
  '#..........#...................#',
  '#..........#...................#',
  '#..........#...................#',
  '#..............................#',
  '#..........#...............K...X',
  '###..###########################',
  '###DD###########################',
  '##,,,,,#########################',
  '##,,a,,#########################',
  '################################',
];
const SPEC_SIDE = { ...SPEC, instruction: { truthful: true, item: 'eyedrops', rule: TRUE_RULES[0] } };
const has = (list, re) => list.some((p) => re.test(p));

test('validateZoneMap accepts a hand-made map with a valid side room', () => assert.deepEqual(problems(SIDE_MAP, SPEC_SIDE), []));

test('validateZoneMap reports a 173 within 29 path tiles of the side room', () => {
  const near = edit(SIDE_MAP, [{ x: 29, y: 1, ch: '.' }, { x: 21, y: 3, ch: 'S' }]);
  assert.ok(has(problems(near, SPEC_SIDE), /scp173 0 only \d+ path tiles from the side room/), problems(near, SPEC_SIDE).join('; '));
});

test('validateZoneMap reports a missing side room, a missing door, or something inside it', () => {
  assert.ok(has(problems(BASE, SPEC_SIDE), /^side room missing$/));
  assert.ok(has(problems(edit(SIDE_MAP, [{ x: 3, y: 9, ch: '.' }, { x: 4, y: 9, ch: '.' }]), SPEC_SIDE), /^side room has no door$/));
  const keyInside = edit(SIDE_MAP, [{ x: 27, y: 7, ch: '.' }, { x: 5, y: 10, ch: 'K' }]);
  assert.ok(has(problems(keyInside, SPEC_SIDE), /^card key inside the side room$/));
});

test('validateZoneMap reports a wrong or misplaced item', () => {
  assert.ok(has(problems(edit(SIDE_MAP, [{ x: 4, y: 11, ch: 'g' }]), SPEC_SIDE), /expected 1 eyedrops in the side room, found 0/));
  const lie = { ...SPEC_SIDE, instruction: { ...SPEC_SIDE.instruction, truthful: false } };
  assert.ok(has(problems(SIDE_MAP, lie), /expected no item in the side room, found 1/));
  assert.ok(has(problems(edit(SIDE_MAP, [{ x: 4, y: 11, ch: ',' }, { x: 5, y: 2, ch: 'a' }]), SPEC_SIDE), /^item outside the side room$/));
});

test('generated zones have a side room with a door, nothing inside but the promised item', () => {
  for (let seed = 0; seed < 30; seed++) {
    for (let z = 0; z < ZONE_COUNT; z++) {
      const spec = zoneSpec(seed, z);
      const { map, info } = buildZone(seed, spec, 0);
      assert.equal(info.usedFallback, false);
      assert.ok(map.sideRoom && map.sideRoom.doorId !== null, `seed ${seed} zone ${z}`);
      assert.deepEqual(validateZoneMap(map, spec), []);
    }
  }
});

test('a true instruction puts its item in the side room centre; a lie leaves the room empty', () => {
  let truths = 0;
  let lies = 0;
  for (let seed = 0; seed < 30; seed++) {
    for (let z = 0; z < ZONE_COUNT; z++) {
      const spec = zoneSpec(seed, z);
      const { map } = buildZone(seed, spec, 0);
      if (spec.instruction.truthful) {
        truths++;
        assert.equal(map.items.length, 1);
        assert.equal(map.items[0].kind, spec.instruction.item);
        const tiles = map.sideRoom.tiles;
        const xs = tiles.map((t) => t.tx);
        const ys = tiles.map((t) => t.ty);
        const centre = { tx: Math.min(...xs) + Math.floor((Math.max(...xs) - Math.min(...xs) + 1) / 2), ty: Math.min(...ys) + Math.floor((Math.max(...ys) - Math.min(...ys) + 1) / 2) };
        assert.deepEqual(tileOfPoint(map.items[0].pos), centre);
      } else {
        lies++;
        assert.deepEqual(map.items, []);
      }
    }
  }
  assert.ok(truths > 0 && lies > 0);
});
