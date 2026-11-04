import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R_CONFIRM_MS } from '../../src/config.js';
import { createDoublePress } from '../../src/logic/confirm.js';

test('the confirm window is 3 seconds', () => assert.equal(R_CONFIRM_MS, 3000));

test('first press arms, second within the window confirms (window end included)', () => {
  const d = createDoublePress(3000);
  assert.equal(d.press(0), 'armed');
  assert.equal(d.press(3000), 'confirmed');
});

test('a press after the window expires arms again instead of confirming', () => {
  const d = createDoublePress(3000);
  assert.equal(d.press(0), 'armed');
  assert.equal(d.press(3001), 'armed');
  assert.equal(d.press(3500), 'confirmed');
});

test('confirming resets, so a third press arms again', () => {
  const d = createDoublePress(3000);
  d.press(0);
  assert.equal(d.press(100), 'confirmed');
  assert.equal(d.press(200), 'armed');
});

test('isArmed is true only inside the window', () => {
  const d = createDoublePress(3000);
  assert.equal(d.isArmed(0), false);
  d.press(1000);
  assert.equal(d.isArmed(1000), true);
  assert.equal(d.isArmed(4000), true);
  assert.equal(d.isArmed(4001), false);
  d.press(1500);
  assert.equal(d.isArmed(1600), false, 'confirmed presses disarm');
});
