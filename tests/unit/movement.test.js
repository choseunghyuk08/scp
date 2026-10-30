import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFrom } from '../helpers/grid.js';
import { tileOf, tileCenter, isSolid, pointSolid } from '../../src/logic/grid.js';
import { moveWithCollision, overlapsSolid } from '../../src/logic/movement.js';

// wall tile (4,2) = x 64..80, y 32..48
const g = gridFrom(['########', '#......#', '#...#..#', '#......#', '########']);
const R = 5;

test('open floor moves by delta', () => {
  assert.deepEqual(moveWithCollision(g, { x: 24, y: 24 }, 3, 0, R), { x: 27, y: 24 });
});

test('stops flush against a wall', () => {
  assert.deepEqual(moveWithCollision(g, { x: 50, y: 40 }, 20, 0, R), { x: 59, y: 40 });
});

test('slides along a wall', () => {
  assert.deepEqual(moveWithCollision(g, { x: 50, y: 40 }, 20, 3, R), { x: 59, y: 43 });
});

test('does not mutate the input position', () => {
  const pos = { x: 50, y: 40 };
  moveWithCollision(g, pos, 20, 3, R);
  assert.deepEqual(pos, { x: 50, y: 40 });
});

test('cannot leave a bordered grid with a huge delta', () => {
  const small = gridFrom(['###', '#.#', '###']);
  const out = moveWithCollision(small, tileCenter(1, 1), 1000, -1000, R);
  assert.equal(overlapsSolid(small, out, R), false);
  assert.deepEqual(out, { x: 27, y: 21 });
});

test('out of bounds counts as solid, so an unbordered grid also holds the player', () => {
  const open = gridFrom(['...', '...']);
  const out = moveWithCollision(open, { x: 24, y: 16 }, 1000, 0, R);
  assert.equal(out.x, 43);
});

test('diagonal squeeze between two wall corners never overlaps', () => {
  const corner = gridFrom(['####', '#.##', '##.#', '####']);
  let pos = tileCenter(1, 1);
  for (let i = 0; i < 30; i++) {
    pos = moveWithCollision(corner, pos, 2, 2, R);
    assert.equal(overlapsSolid(corner, pos, R), false);
  }
});

test('tileCenter and tileOf agree', () => {
  assert.deepEqual(tileCenter(3, 2), { x: 56, y: 40 });
  assert.equal(tileOf(56), 3);
  assert.equal(tileOf(-1), -1);
});

test('isSolid and pointSolid treat out of range as solid', () => {
  assert.equal(isSolid(g, 0, 0), true);
  assert.equal(isSolid(g, 1, 1), false);
  assert.equal(isSolid(g, -1, 1), true);
  assert.equal(isSolid(g, 1, 99), true);
  assert.equal(pointSolid(g, { x: 72, y: 40 }), true);
  assert.equal(pointSolid(g, { x: 24, y: 24 }), false);
});

test('overlapsSolid: touching a wall edge is not overlapping', () => {
  assert.equal(overlapsSolid(g, { x: 59, y: 40 }, R), false);
  assert.equal(overlapsSolid(g, { x: 59.5, y: 40 }, R), true);
});
