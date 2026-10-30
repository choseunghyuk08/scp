import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampDt } from '../../src/logic/time.js';

test('clampDt limits huge frames to MAX_DT', () => assert.equal(clampDt(2), 0.05));
test('clampDt passes normal frames', () => assert.equal(clampDt(0.016), 0.016));
test('clampDt maps negative and NaN to 0', () => {
  assert.equal(clampDt(-1), 0);
  assert.equal(clampDt(NaN), 0);
});
