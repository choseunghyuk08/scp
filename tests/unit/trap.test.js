import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAP } from '../../src/config.js';
import { createTrap, stepTrap, trapView } from '../../src/logic/trap.js';

const at = (t) => trapView({ t });

test('trap constants', () => assert.deepEqual(TRAP, { lockSeconds: 8, darkSeconds: 1.5, flashes: [[0.3, 0.42], [0.9, 1.02]] }));

test('the door is locked for 8s and the blackout lasts 1.5s', () => {
  assert.deepEqual(createTrap(), { t: 0 });
  assert.deepEqual([0, 1.49, 1.5, 7.99, 8].map((t) => [at(t).locked, at(t).dark, at(t).over]), [
    [true, true, false],
    [true, true, false],
    [true, false, false],
    [true, false, false],
    [false, false, true],
  ]);
});

test('flash windows include their start and exclude their end', () => {
  assert.deepEqual([0.29, 0.3, 0.41, 0.42, 0.9, 1.02].map((t) => at(t).flash), [false, true, true, false, true, false]);
});

test('flashes happen only inside the blackout and never more than 3 in any 1s window', () => {
  let trap = createTrap();
  let was = false;
  const edges = [];
  for (let i = 0; i < 900; i++) {
    const { flash } = trapView(trap);
    if (flash && !was) edges.push(trap.t);
    was = flash;
    trap = stepTrap(trap, 0.01);
  }
  assert.ok(edges.length >= 1);
  assert.ok(edges.every((e) => e < TRAP.darkSeconds), `edges ${edges}`);
  for (const e of edges) assert.ok(edges.filter((x) => x >= e && x < e + 1).length <= 3);
});

test('stepTrap does not mutate', () => {
  const trap = createTrap();
  assert.deepEqual(stepTrap(trap, 0.5), { t: 0.5 });
  assert.deepEqual(trap, { t: 0 });
});
