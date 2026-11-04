import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGGRO_TILES, ZONE_COUNT, ZONE_MIN_PATH, ZONE_SCP096, ZONE_SCP173 } from '../../src/config.js';
import {
  activationFor,
  advanceZone,
  createRun,
  keyZone,
  parseRun,
  parseSeedParam,
  registerDeath,
  serializeRun,
  zoneSpec,
} from '../../src/logic/run.js';

const seeds = (n) => Array.from({ length: n }, (_, i) => i * 7919 + 3);

test('createRun starts at the first zone with nothing earned', () => {
  assert.deepEqual(createRun(5), { seed: 5, zone: 0, attempt: 0, hasKey: false, heard: [] });
});

test('keyZone is 1 or 2, deterministic, and both occur over 1000 seeds', () => {
  const found = new Set();
  for (const seed of seeds(1000)) {
    const z = keyZone(seed);
    assert.ok(z === 1 || z === 2, `keyZone ${z}`);
    assert.equal(z, keyZone(seed));
    found.add(z);
  }
  assert.deepEqual([...found].sort(), [1, 2]);
});

test('zoneSpec: tutorial has 3 rooms, no key, 1 scp173, minPath 90; last zone isFinal', () => {
  const t = zoneSpec(1234, 0);
  assert.deepEqual(
    { index: t.index, isTutorial: t.isTutorial, isFinal: t.isFinal, hasKey: t.hasKey, roomCount: t.roomCount, minPath: t.minPath, scp173Count: t.scp173Count },
    { index: 0, isTutorial: true, isFinal: false, hasKey: false, roomCount: 3, minPath: 90, scp173Count: 1 },
  );
  assert.equal(zoneSpec(1234, ZONE_COUNT - 1).isFinal, true);
  assert.equal(zoneSpec(1234, 1).isFinal, false);
});

test('zoneSpec: exactly one zone has the key per seed, never zone 0 or 3; others have 3..4 rooms', () => {
  for (const seed of seeds(200)) {
    const specs = Array.from({ length: ZONE_COUNT }, (_, i) => zoneSpec(seed, i));
    assert.equal(specs.filter((s) => s.hasKey).length, 1);
    assert.equal(specs[0].hasKey, false);
    assert.equal(specs[ZONE_COUNT - 1].hasKey, false);
    for (const s of specs.slice(1)) assert.ok(s.roomCount === 3 || s.roomCount === 4, `rooms ${s.roomCount}`);
    assert.deepEqual(specs, Array.from({ length: ZONE_COUNT }, (_, i) => zoneSpec(seed, i)), 'deterministic');
  }
});

test('zoneSpec scp173Count and minPath come from ZONE_SCP173 / ZONE_MIN_PATH; their minPath sums to 450', () => {
  for (let i = 0; i < ZONE_COUNT; i++) {
    const s = zoneSpec(77, i);
    assert.equal(s.scp173Count, ZONE_SCP173[i]);
    assert.equal(s.minPath, ZONE_MIN_PATH[i]);
  }
  assert.equal(ZONE_MIN_PATH.reduce((a, b) => a + b, 0), 450);
});

test('zoneSpec rejects an index outside the run', () => {
  assert.throws(() => zoneSpec(1, -1), RangeError);
  assert.throws(() => zoneSpec(1, ZONE_COUNT), RangeError);
});

test('activationFor: tutorial sighting, others radius 14', () => {
  assert.deepEqual(activationFor(zoneSpec(9, 0)), { kind: 'sighting' });
  assert.deepEqual(activationFor(zoneSpec(9, 2)), { kind: 'radius', tiles: AGGRO_TILES });
  assert.equal(AGGRO_TILES, 14);
});

test('advanceZone moves one zone, resets attempt, keeps seed/hasKey/heard, throws at the final zone', () => {
  const run = { seed: 5, zone: 1, attempt: 3, hasKey: true, heard: ['start'] };
  assert.deepEqual(advanceZone(run), { seed: 5, zone: 2, attempt: 0, hasKey: true, heard: ['start'] });
  assert.throws(() => advanceZone({ ...run, zone: ZONE_COUNT - 1 }), RangeError);
});

test('registerDeath adds an attempt and replaces heard; neither function mutates its input', () => {
  const run = { seed: 5, zone: 1, attempt: 3, hasKey: true, heard: ['start'] };
  const snapshot = structuredClone(run);
  const died = registerDeath(run, ['start', 'seen173']);
  assert.deepEqual(died, { seed: 5, zone: 1, attempt: 4, hasKey: true, heard: ['start', 'seen173'] });
  advanceZone(run);
  assert.deepEqual(run, snapshot);
  const heard = ['gotKey'];
  registerDeath(run, heard).heard.push('x');
  assert.deepEqual(heard, ['gotKey']);
});

test('serialize/parse round trip', () => {
  const run = { seed: 4294967295, zone: 3, attempt: 12, hasKey: true, heard: ['start', 'seen173', 'gotKey'] };
  assert.deepEqual(parseRun(serializeRun(run)), run);
  assert.deepEqual(parseRun(serializeRun(createRun(0))), createRun(0));
});

test('parseRun rejects garbage without throwing', () => {
  const base = { v: 1, seed: 5, zone: 1, attempt: 2, hasKey: true, heard: ['start'] };
  assert.deepEqual(parseRun(JSON.stringify(base)), { seed: 5, zone: 1, attempt: 2, hasKey: true, heard: ['start'] });
  const without = (key) => {
    const copy = { ...base };
    delete copy[key];
    return copy;
  };
  const bad = [
    null, undefined, '', 'not json', '{}', '[]', '5', 'null', '"x"', '{"v":1',
    { ...base, v: 2 }, { ...base, v: undefined },
    { ...base, seed: -1 }, { ...base, seed: 1.5 }, { ...base, seed: 2 ** 32 }, { ...base, seed: '5' },
    { ...base, zone: -1 }, { ...base, zone: ZONE_COUNT }, { ...base, zone: 1.5 },
    { ...base, attempt: -1 }, { ...base, attempt: 1e9 }, { ...base, attempt: 'x' },
    { ...base, hasKey: 'yes' }, { ...base, hasKey: 1 },
    { ...base, heard: 'start' }, { ...base, heard: ['bogus'] }, { ...base, heard: [1] }, { ...base, heard: null },
    without('seed'), without('zone'), without('attempt'), without('hasKey'), without('heard'),
  ].map((b) => (b !== null && typeof b === 'object' ? JSON.stringify(b) : b));
  for (const text of bad) assert.equal(parseRun(text), null, `should reject ${String(text).slice(0, 60)}`);
});

test('parseSeedParam accepts digits up to 4294967295 and rejects everything else', () => {
  assert.equal(parseSeedParam('?debug=1&seed=42'), 42);
  assert.equal(parseSeedParam('?seed=0'), 0);
  assert.equal(parseSeedParam('?seed=4294967295'), 4294967295);
  for (const bad of ['', '?seed=', '?seed=abc', '?seed=-5', '?seed=1e9', '?seed=12.5', '?seed=4294967296', '?seed=99999999999', '?seed=12345678901', '?debug=1', '?seed= 5', undefined, null]) {
    assert.equal(parseSeedParam(bad), null, `should reject ${bad}`);
  }
});

test('zoneSpec: zones 2 and 3 have one SCP-096 and four rooms; zones 0 and 1 have none', () => {
  assert.deepEqual(ZONE_SCP096, [0, 0, 1, 1]);
  for (const seed of seeds(200)) {
    const specs = Array.from({ length: ZONE_COUNT }, (_, i) => zoneSpec(seed, i));
    assert.deepEqual(specs.map((s) => s.scp096Count), [0, 0, 1, 1]);
    assert.deepEqual([specs[2].roomCount, specs[3].roomCount], [4, 4]);
  }
});

test('every zone has exactly one SCP-173 now', () => {
  assert.deepEqual(ZONE_SCP173, [1, 1, 1, 1]);
  for (let i = 0; i < ZONE_COUNT; i++) assert.equal(zoneSpec(5, i).scp173Count, 1);
});
