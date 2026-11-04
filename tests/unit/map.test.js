import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMap } from '../../src/logic/map.js';
import { isSolid } from '../../src/logic/grid.js';

const rows = ['#######', '#@.K.S#', '#....X#', '#######'];

test('parseMap finds markers at tile centers', () => {
  const m = parseMap(rows);
  assert.equal(m.cols, 7);
  assert.equal(m.rows, 4);
  assert.deepEqual(m.playerStart, { x: 24, y: 24 });
  assert.deepEqual(m.cardKey, { x: 56, y: 24 });
  assert.deepEqual(m.spawns173, [{ x: 88, y: 24 }]);
  assert.deepEqual(m.exit, { tx: 5, ty: 2 });
});

test('# and X are solid; . @ K S are floor', () => {
  const m = parseMap(rows);
  for (const [tx, ty] of [[0, 0], [5, 2]]) assert.equal(isSolid(m.grid, tx, ty), true);
  for (const [tx, ty] of [[1, 1], [2, 1], [3, 1], [5, 1], [4, 2]]) assert.equal(isSolid(m.grid, tx, ty), false);
});

test('several spawns are all collected in reading order', () => {
  const m = parseMap(['#####', '#@KS#', '#SX.#', '#####']);
  assert.deepEqual(m.spawns173, [{ x: 56, y: 24 }, { x: 24, y: 40 }]);
});

test('ragged rows throw', () => assert.throws(() => parseMap(['###', '##']), Error));
test('an empty map throws', () => assert.throws(() => parseMap([]), Error));
test('missing @ throws', () => assert.throws(() => parseMap(['####', '#KX#', '####']), /@/));
test('missing K throws', () => assert.throws(() => parseMap(['####', '#@X#', '####']), /K/));
test('missing X throws', () => assert.throws(() => parseMap(['####', '#@K#', '####']), /X/));
test('duplicate K throws', () => assert.throws(() => parseMap(['#####', '#@KK#', '#X..#', '#####']), /K/));
test('unknown characters throw', () => assert.throws(() => parseMap(['####', '#@?#', '####']), /\?/));

test('requireKey:false allows no K and returns cardKey null', () =>
  assert.equal(parseMap(['####', '#@X#', '####'], { requireKey: false }).cardKey, null));

test('requireKey:false still parses a single K at its tile centre', () =>
  assert.deepEqual(parseMap(['#####', '#@KX#', '#####'], { requireKey: false }).cardKey, { x: 40, y: 24 }));

test('requireKey:false still rejects two Ks', () =>
  assert.throws(() => parseMap(['#####', '#@KK#', '#X..#', '#####'], { requireKey: false }), /K/));

test('the default still requires a K (v0.1 behavior)', () =>
  assert.throws(() => parseMap(['####', '#@X#', '####']), /K/));

test('requireKey:true still rejects a missing K explicitly', () =>
  assert.throws(() => parseMap(['####', '#@X#', '####'], { requireKey: true }), /K/));
