import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlink, isBlinking, stepBlink } from '../../src/logic/blink.js';

const DT = 0.05;

function untilBlinking(s) {
  let elapsed = 0;
  while (!isBlinking(s) && elapsed < 20) {
    s = stepBlink(s, DT);
    elapsed += DT;
  }
  return { s, elapsed };
}

test('a new blink gauge is empty and open', () => {
  const s = createBlink();
  assert.equal(s.gauge, 0);
  assert.equal(isBlinking(s), false);
});

test('not blinking before ~6s, blinking at ~6s', () => {
  const { s, elapsed } = untilBlinking(createBlink());
  assert.ok(elapsed >= 5.9 && elapsed <= 6.1, `elapsed ${elapsed}`);
  assert.equal(s.gauge, 1);
});

test('stays closed for ~0.4s then reopens with gauge 0', () => {
  let { s } = untilBlinking(createBlink());
  let closedFor = 0;
  while (isBlinking(s) && closedFor < 2) {
    s = stepBlink(s, DT);
    closedFor += DT;
    if (closedFor < 0.34) assert.equal(isBlinking(s), true); // still shut at 0.30s
  }
  assert.ok(closedFor >= 0.4 && closedFor <= 0.5, `closed for ${closedFor}`);
  assert.equal(isBlinking(s), false);
  assert.equal(s.gauge, 0);
});

test('refills after reopening', () => {
  let { s } = untilBlinking(createBlink());
  for (let i = 0; i < 10; i++) s = stepBlink(s, DT);
  for (let i = 0; i < 60; i++) s = stepBlink(s, DT); // 3s
  assert.ok(Math.abs(s.gauge - 0.5) < 0.02, `gauge ${s.gauge}`);
});

test('stepBlink returns a new object', () => {
  const s = createBlink();
  assert.notEqual(stepBlink(s, DT), s);
  assert.equal(s.gauge, 0);
});
