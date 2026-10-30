import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStamina, canRun, stepStamina } from '../../src/logic/stamina.js';

const run = (s, seconds, running, dt = 0.1) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) s = stepStamina(s, dt, running);
  return s;
};

test('a new stamina is full and can run', () => {
  const s = createStamina();
  assert.equal(s.value, 1);
  assert.equal(canRun(s), true);
});

test('running 4s drains to exhausted', () => {
  let s = createStamina();
  for (let i = 0; i < 41; i++) s = stepStamina(s, 0.1, true);
  assert.equal(s.value, 0);
  assert.equal(s.exhausted, true);
  assert.equal(canRun(s), false);
});

// Runs until the exact step that exhausts stamina, so idleSeconds starts from 0.
const exhaust = () => {
  let s = createStamina();
  while (!s.exhausted) s = stepStamina(s, 0.1, true);
  return s;
};

test('no regen before 3s idle', () => {
  const s = run(exhaust(), 2.9, false);
  assert.equal(s.value, 0);
});

test('regen starts after 3s idle at 1/4 per second', () => {
  const s = run(exhaust(), 3.5, false);
  assert.ok(Math.abs(s.value - 0.125) < 0.005, `value ${s.value}`); // 0.5s of regen at 1/4 per second
});

test('running resets the regen delay', () => {
  let s = run(createStamina(), 1, true);
  s = run(s, 2.9, false);
  assert.ok(Math.abs(s.value - 0.75) < 1e-9, `value ${s.value}`);
});

test('stays exhausted until value >= 0.25', () => {
  let s = { value: 0.2, idleSeconds: 10, exhausted: true };
  assert.equal(canRun(s), false);
  s = stepStamina(s, 0.1, false);
  assert.equal(s.exhausted, true);
  assert.equal(canRun(s), false);
  s = stepStamina(s, 0.2, false);
  assert.equal(s.exhausted, false);
  assert.equal(canRun(s), true);
});

test('asking to run while exhausted does not drain or reset the delay', () => {
  const s = stepStamina({ value: 0, idleSeconds: 5, exhausted: true }, 0.1, true);
  assert.equal(s.value > 0, true);
  assert.equal(s.exhausted, true);
});

test('walking at full stamina stays at 1', () => {
  assert.equal(run(createStamina(), 10, false).value, 1);
});

test('stepStamina returns a new object', () => {
  const s = createStamina();
  assert.notEqual(stepStamina(s, 0.1, false), s);
  assert.equal(s.value, 1);
});
