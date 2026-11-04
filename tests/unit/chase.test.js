import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFrom } from '../helpers/grid.js';
import { tileCenter } from '../../src/logic/grid.js';
import { chaseStep } from '../../src/logic/chase.js';

const corridor = (n) => gridFrom(['#'.repeat(n + 2), '#' + '.'.repeat(n) + '#', '#'.repeat(n + 2)]);

test('chaseStep walks the BFS path at the given budget', () => {
  const r = chaseStep(tileCenter(1, 1), tileCenter(12, 1), corridor(14), 56);
  assert.deepEqual(r.pos, { x: 24 + 56, y: 24 });
  assert.deepEqual([r.reachable, r.blockedTile], [true, null]);
});

test('chaseStep stops before a blocked tile and reports it', () => {
  const blocked = (t) => t.tx === 5 && t.ty === 1;
  const r = chaseStep(tileCenter(1, 1), tileCenter(12, 1), corridor(14), 1000, blocked);
  assert.deepEqual(r.pos, tileCenter(4, 1));
  assert.deepEqual(r.blockedTile, { tx: 5, ty: 1 });
});

test('chaseStep next to a blocked tile does not move', () => {
  const r = chaseStep(tileCenter(4, 1), tileCenter(12, 1), corridor(14), 1000, (t) => t.tx === 5);
  assert.deepEqual(r.pos, tileCenter(4, 1));
  assert.deepEqual(r.blockedTile, { tx: 5, ty: 1 });
});

test('chaseStep with no path stays put and reports unreachable', () => {
  const r = chaseStep(tileCenter(1, 1), tileCenter(3, 1), gridFrom(['#####', '#.#.#', '#####']), 100);
  assert.deepEqual(r.pos, tileCenter(1, 1));
  assert.equal(r.reachable, false);
});

test('chaseStep refuses to move when the path is longer than maxTiles', () => {
  const r = chaseStep(tileCenter(1, 1), tileCenter(12, 1), corridor(14), 100, undefined, 5);
  assert.deepEqual(r.pos, tileCenter(1, 1));
  assert.equal(r.reachable, true);
});
