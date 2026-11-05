import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENDING_IDS } from '../../src/config.js';
import { ENDINGS, pickEnding } from '../../src/logic/endings.js';

const T = { truthful: true };
const L = { truthful: false };

test('discern: no lie followed and at least ceil(2/3) of truths followed', () => {
  assert.equal(pickEnding(['followed', 'refused', 'followed', 'followed'], [T, L, T, T]), 'discern'); // 3/3 truths
  assert.equal(pickEnding(['followed', 'refused', 'refused', 'followed'], [T, L, T, T]), 'discern'); // 2/3 truths
  assert.equal(pickEnding(['followed', 'refused', 'refused', 'followed'], [T, L, L, T]), 'discern'); // 2/2 truths
});

test('one truth of two is not discern', () =>
  assert.equal(pickEnding(['followed', 'refused', 'refused', 'refused'], [T, L, L, T]), 'alone'));

test('ratio endings: 0-1 alone, 2 half, 3-4 faithful', () => {
  assert.equal(pickEnding(['refused', 'refused', 'refused', 'refused'], [T, L, T, T]), 'alone');
  assert.equal(pickEnding(['followed', 'followed', 'refused', 'refused'], [T, L, T, T]), 'half');
  assert.equal(pickEnding(['followed', 'followed', 'followed', 'refused'], [T, L, T, T]), 'faithful');
  assert.equal(pickEnding(['followed', 'followed', 'followed', 'followed'], [T, L, L, T]), 'faithful');
});

test('none outcomes are left out of the count', () => {
  // counted: zone 0 (true, followed), zone 2 (lie, followed), zone 3 (true, refused) -> a lie followed, 2 of 3 -> faithful
  assert.equal(pickEnding(['followed', 'none', 'followed', 'refused'], [T, L, L, T]), 'faithful');
});

test('no counted instruction at all is alone', () => assert.equal(pickEnding(['none', 'none', 'none', 'none'], [T, L, T, T]), 'alone'));

test('missing trailing outcomes count as none', () => assert.equal(pickEnding(['followed', 'refused'], [T, L, T, T]), 'discern'));

test('every ending is reachable with one lie and with two lies', () => {
  for (const plan of [[T, L, T, T], [T, L, L, T]]) {
    const seen = new Set();
    for (let mask = 0; mask < 16; mask++) {
      seen.add(pickEnding([0, 1, 2, 3].map((i) => (mask & (1 << i) ? 'followed' : 'refused')), plan));
    }
    assert.deepEqual([...seen].sort(), [...ENDING_IDS].sort());
  }
});

test('every ending has a name and three Korean lines', () => {
  assert.deepEqual(Object.keys(ENDINGS).sort(), [...ENDING_IDS].sort());
  for (const { name, lines } of Object.values(ENDINGS)) {
    assert.match(name, /[가-힣]/);
    assert.equal(lines.length, 3);
    for (const line of lines) assert.match(line, /[가-힣]/);
  }
});
