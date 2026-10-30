import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMap } from '../../src/logic/map.js';
import { TEST_MAP_ROWS } from '../../src/data/testmap.js';
import { findPath } from '../../src/logic/pathfinding.js';
import { hasLineOfSight } from '../../src/logic/vision.js';
import { tileCenter, tileOf } from '../../src/logic/grid.js';

const map = parseMap(TEST_MAP_ROWS);
const tileOfPoint = (p) => ({ tx: tileOf(p.x), ty: tileOf(p.y) });
const openedGrid = () => {
  const g = map.grid.map((row) => [...row]);
  g[map.exit.ty][map.exit.tx] = false;
  return g;
};

test('size and border walls', () => {
  assert.ok(map.cols >= 40 && map.cols <= 64, `cols ${map.cols}`);
  assert.ok(map.rows >= 24 && map.rows <= 40, `rows ${map.rows}`);
  for (let tx = 0; tx < map.cols; tx++) {
    assert.equal(map.grid[0][tx], true);
    assert.equal(map.grid[map.rows - 1][tx], true);
  }
  for (let ty = 0; ty < map.rows; ty++) {
    assert.equal(map.grid[ty][0], true);
    assert.equal(map.grid[ty][map.cols - 1], true);
  }
});

test('has at least one 173 spawn', () => assert.ok(map.spawns173.length >= 1));

test('start->key->exit reachable (exit opened) and total path >= 100 tiles', () => {
  const g = openedGrid();
  const toKey = findPath(g, tileOfPoint(map.playerStart), tileOfPoint(map.cardKey));
  const toExit = findPath(g, tileOfPoint(map.cardKey), map.exit);
  assert.ok(toKey, 'no path from start to key');
  assert.ok(toExit, 'no path from key to exit');
  assert.ok(toKey.length + toExit.length >= 100, `total ${toKey.length + toExit.length}`);
});

test('the exit is closed until opened: no path to it on the raw grid', () => {
  assert.equal(findPath(map.grid, tileOfPoint(map.playerStart), map.exit), null);
});

test('every 173 spawn is hidden from the start and >= 15 path tiles away', () => {
  for (const s of map.spawns173) {
    assert.equal(hasLineOfSight(map.grid, map.playerStart, s), false);
    const path = findPath(openedGrid(), tileOfPoint(map.playerStart), tileOfPoint(s));
    assert.ok(path && path.length >= 15, `path ${path && path.length}`);
  }
});

test('the 173 room and the key room each have a pillar that breaks line of sight', () => {
  const s = map.spawns173[0];
  assert.equal(hasLineOfSight(map.grid, tileCenter(30, 6), s), false, '173 room entrance sees the spawn');
  assert.equal(hasLineOfSight(map.grid, tileCenter(41, 20), map.cardKey), false, 'key room entrance sees the key');
});
