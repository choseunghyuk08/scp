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
  assert.deepEqual(s, { pos: { x: 24, y: 24 }, frozen: false, awake: false });
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
  assert.deepEqual(s0, { pos: tileCenter(1, 1), frozen: false, awake: false });
});

test('isLethal: unfrozen+touching true, frozen+touching false, unfrozen at 10px or more false', () => {
  const p = { x: 100, y: 100 };
  assert.equal(isLethal({ pos: { x: 109, y: 100 }, frozen: false }, p), true);
  assert.equal(isLethal({ pos: { x: 100, y: 100 }, frozen: false }, p), true);
  assert.equal(isLethal({ pos: { x: 100, y: 100 }, frozen: true }, p), false);
  assert.equal(isLethal({ pos: { x: 110, y: 100 }, frozen: false }, p), false);
  assert.equal(isLethal({ pos: { x: 111, y: 100 }, frozen: false }, p), false);
});

const run = (s, args, steps) => {
  for (let i = 0; i < steps; i++) s = step173(s, { dt: DT, ...args });
  return s;
};
const wide = (n) => gridFrom(['#'.repeat(n + 2), '#' + '.'.repeat(n) + '#', '#'.repeat(n + 2)]);
const uShape = gridFrom(['#####', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#...#', '#####']);

test('sighting: a never-seen 173 stays put and is frozen (not lethal) even when touching', () => {
  const start = tileCenter(1, 1);
  const s = run(create173(start), { grid: corridor, player: tileCenter(8, 1), observed: false, activation: { kind: 'sighting' } }, 100);
  assert.deepEqual(s.pos, start);
  assert.equal(s.frozen, true);
  assert.equal(s.awake, false);
  assert.equal(isLethal(s, start), false);
});

test('sighting: seeing it wakes it for good and it then chases once unobserved', () => {
  const activation = { kind: 'sighting' };
  const args = { grid: corridor, player: tileCenter(8, 1), activation };
  const seen = step173(create173(tileCenter(1, 1)), { dt: DT, ...args, observed: true });
  assert.equal(seen.awake, true);
  assert.equal(seen.frozen, true);
  const after = run(seen, { ...args, observed: false }, 10);
  assert.equal(after.frozen, false);
  assert.equal(after.awake, true);
  assert.ok(dist(after.pos, tileCenter(1, 1)) > 40);
});

test('radius: chases inside 14 path tiles and stays put beyond', () => {
  const activation = { kind: 'radius', tiles: 14 };
  const near = run(create173(tileCenter(1, 1)), { grid: wide(11), player: tileCenter(11, 1), observed: false, activation }, 10);
  assert.ok(dist(near.pos, tileCenter(1, 1)) > 40, 'inside the radius it should move');
  const far = run(create173(tileCenter(1, 1)), { grid: wide(21), player: tileCenter(21, 1), observed: false, activation }, 10);
  assert.deepEqual(far.pos, tileCenter(1, 1));
  assert.equal(far.frozen, false);
});

test('radius counts path tiles, not straight distance', () => {
  const player = tileCenter(3, 1); // 2 tiles away in a straight line, 16 tiles by the only route
  const args = { grid: uShape, player, observed: false };
  const held = run(create173(tileCenter(1, 1)), { ...args, activation: { kind: 'radius', tiles: 14 } }, 10);
  assert.deepEqual(held.pos, tileCenter(1, 1));
  const chasing = run(create173(tileCenter(1, 1)), { ...args, activation: { kind: 'radius', tiles: 20 } }, 10);
  assert.notDeepEqual(chasing.pos, tileCenter(1, 1));
});

test('radius with no path stays put without throwing', () => {
  const split = gridFrom(['#####', '#.#.#', '#####']);
  const s0 = create173(tileCenter(1, 1));
  const s1 = step173(s0, { dt: DT, grid: split, player: tileCenter(3, 1), observed: false, activation: { kind: 'radius', tiles: 14 } });
  assert.deepEqual(s1.pos, s0.pos);
  assert.equal(s1.frozen, false);
});

test('radius: observed still freezes it', () => {
  const s = step173(create173(tileCenter(1, 1)), { dt: DT, grid: wide(5), player: tileCenter(5, 1), observed: true, activation: { kind: 'radius', tiles: 14 } });
  assert.equal(s.frozen, true);
});

test('activation omitted behaves exactly like always', () => {
  const args = { grid: corridor, player: tileCenter(8, 1), observed: false };
  const omitted = run(create173(tileCenter(1, 1)), args, 10);
  const always = run(create173(tileCenter(1, 1)), { ...args, activation: { kind: 'always' } }, 10);
  assert.deepEqual(omitted, always);
  assert.ok(dist(omitted.pos, tileCenter(1, 1)) > 50);
});
