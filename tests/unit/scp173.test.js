import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFrom } from '../helpers/grid.js';
import { pointSolid, tileCenter } from '../../src/logic/grid.js';
import { create173, step173, isLethal } from '../../src/logic/scp173.js';

const DT = 0.05;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const corridor = gridFrom(['##########', '#........#', '##########']);

test('create173 starts unfrozen at the given position', () => {
  const s = create173({ x: 24, y: 24 });
  assert.deepEqual(s, { pos: { x: 24, y: 24 }, frozen: false });
});

test('observed -> frozen and never moves', () => {
  let s = create173(tileCenter(1, 1));
  for (let i = 0; i < 100; i++) s = step173(s, { dt: DT, grid: corridor, player: tileCenter(8, 1), observed: true });
  assert.deepEqual(s.pos, tileCenter(1, 1));
  assert.equal(s.frozen, true);
});

test('unobserved moves ~112px/s toward the player in a corridor', () => {
  let s = create173(tileCenter(1, 1));
  for (let i = 0; i < 10; i++) s = step173(s, { dt: DT, grid: corridor, player: tileCenter(8, 1), observed: false });
  assert.equal(s.frozen, false);
  assert.ok(Math.abs(dist(s.pos, tileCenter(1, 1)) - 56) <= 1, `moved ${dist(s.pos, tileCenter(1, 1))}`);
  assert.ok(Math.abs(s.pos.y - 24) < 1e-9);
});

test('routes around walls and never enters a solid tile', () => {
  const lShape = gridFrom(['######', '#....#', '####.#', '####.#', '######']);
  const player = tileCenter(4, 3);
  let s = create173(tileCenter(1, 1));
  for (let i = 0; i < 200 && dist(s.pos, player) > 1; i++) {
    s = step173(s, { dt: DT, grid: lShape, player, observed: false });
    assert.equal(pointSolid(lShape, s.pos), false, `inside a wall at ${JSON.stringify(s.pos)}`);
  }
  assert.ok(dist(s.pos, player) <= 1, `stopped ${dist(s.pos, player)} from the player`);
});

test('no path: no throw, no movement, frozen false', () => {
  const split = gridFrom(['#####', '#.#.#', '#####']);
  const s0 = create173(tileCenter(1, 1));
  const s1 = step173(s0, { dt: DT, grid: split, player: tileCenter(3, 1), observed: false });
  assert.deepEqual(s1.pos, s0.pos);
  assert.equal(s1.frozen, false);
});

test('player on the same tile: moves straight, distance shrinks, no throw', () => {
  const s0 = create173({ x: 20, y: 24 });
  const player = { x: 28, y: 24 };
  const s1 = step173(s0, { dt: DT, grid: corridor, player, observed: false });
  assert.ok(Math.abs(dist(s1.pos, player) - (8 - 5.6)) < 1e-9);
  const s2 = step173(s1, { dt: DT, grid: corridor, player, observed: false });
  assert.deepEqual(s2.pos, player);
});

test('player on an adjacent tile: moves straight at the player', () => {
  const s0 = create173(tileCenter(1, 1));
  const player = tileCenter(2, 1);
  const s1 = step173(s0, { dt: DT, grid: corridor, player, observed: false });
  assert.ok(Math.abs(dist(s1.pos, player) - (16 - 5.6)) < 1e-9);
});

test('step173 does not mutate its input', () => {
  const s0 = create173(tileCenter(1, 1));
  step173(s0, { dt: DT, grid: corridor, player: tileCenter(8, 1), observed: false });
  assert.deepEqual(s0, { pos: tileCenter(1, 1), frozen: false });
});

test('isLethal: unfrozen+touching true, frozen+touching false, unfrozen at 10px or more false', () => {
  const p = { x: 100, y: 100 };
  assert.equal(isLethal({ pos: { x: 109, y: 100 }, frozen: false }, p), true);
  assert.equal(isLethal({ pos: { x: 100, y: 100 }, frozen: false }, p), true);
  assert.equal(isLethal({ pos: { x: 100, y: 100 }, frozen: true }, p), false);
  assert.equal(isLethal({ pos: { x: 110, y: 100 }, frozen: false }, p), false);
  assert.equal(isLethal({ pos: { x: 111, y: 100 }, frozen: false }, p), false);
});
