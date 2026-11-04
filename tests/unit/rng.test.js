import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed, randInt, shuffle } from '../../src/logic/rng.js';

const take = (rng, n) => Array.from({ length: n }, () => rng());

test('same seed gives the same sequence; different seeds differ', () => {
  assert.deepEqual(take(createRng(42), 5), take(createRng(42), 5));
  assert.notDeepEqual(take(createRng(42), 5), take(createRng(43), 5));
});

test('values are in [0,1) and the mean of 10000 draws is within 0.02 of 0.5', () => {
  const values = take(createRng(7), 10000);
  assert.ok(values.every((v) => v >= 0 && v < 1));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean ${mean}`);
});

test('hashSeed is deterministic, order-sensitive, and an integer in [0, 2**32)', () => {
  assert.equal(hashSeed(1, 2, 3), hashSeed(1, 2, 3));
  assert.notEqual(hashSeed(1, 2, 3), hashSeed(3, 2, 1));
  for (const h of [hashSeed(), hashSeed(0), hashSeed(1, 2, 3), hashSeed(4294967295, 4294967295)]) {
    assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32, `hash ${h}`);
  }
});

test('hashSeed separates consecutive inputs', () => {
  const seen = new Set(Array.from({ length: 1000 }, (_, i) => hashSeed(i, 0, 0)));
  assert.equal(seen.size, 1000);
});

test('randInt is inclusive on both ends and covers 0..3 in 400 draws; randInt(rng,5,5) is always 5', () => {
  const rng = createRng(1);
  const seen = new Set(Array.from({ length: 400 }, () => randInt(rng, 0, 3)));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  assert.ok(Array.from({ length: 50 }, () => randInt(rng, 5, 5)).every((v) => v === 5));
});

test('shuffle is a permutation, does not mutate its input, and is deterministic per seed', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = shuffle(createRng(9), input);
  assert.deepEqual([...a].sort((x, y) => x - y), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(a, shuffle(createRng(9), input));
  assert.notDeepEqual(a, shuffle(createRng(10), input));
});
