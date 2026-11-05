import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../../src/config.js';
import { addItem, applyEyedrops, createItems, useItem } from '../../src/logic/items.js';

test('item constants', () => assert.deepEqual(ITEMS, { pickupDist: 10, stimSeconds: 5 }));

test('items start empty, add and use count down, using none does nothing', () => {
  const empty = createItems();
  assert.deepEqual(empty, { eyedrops: 0, stim: 0 });
  const one = addItem(empty, 'stim');
  assert.deepEqual([empty, one], [{ eyedrops: 0, stim: 0 }, { eyedrops: 0, stim: 1 }]);
  assert.deepEqual(useItem(one, 'stim'), { items: { eyedrops: 0, stim: 0 }, used: true });
  assert.deepEqual(useItem(one, 'eyedrops'), { items: { eyedrops: 0, stim: 1 }, used: false });
  assert.deepEqual(one, { eyedrops: 0, stim: 1 });
});

test('eye drops empty the blink gauge but do not cut a blink short', () => {
  assert.deepEqual(applyEyedrops({ gauge: 0.9, closedLeft: 0 }), { gauge: 0, closedLeft: 0 });
  assert.deepEqual(applyEyedrops({ gauge: 1, closedLeft: 0.2 }), { gauge: 0, closedLeft: 0.2 });
});
