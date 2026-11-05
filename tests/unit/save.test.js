import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeStorage } from '../helpers/storage.js';
import { ENDINGS_KEY, ENDING_IDS, SAVE_KEY } from '../../src/config.js';
import { createRun, serializeRun } from '../../src/logic/run.js';
import { bootRun, clearRun, getStorage, loadEndings, loadRun, saveEnding, saveRun } from '../../src/save.js';

const sample = { seed: 77, zone: 2, attempt: 3, hasKey: true, heard: ['start', 'seen173'], items: { eyedrops: 1, stim: 0 }, outcomes: ['followed', 'refused'] };
const neverRandom = () => {
  throw new Error('randomSeed should not be called');
};

test('the save key is gaze.run.v1', () => assert.equal(SAVE_KEY, 'gaze.run.v1'));

test('save then load round-trips a run', () => {
  const storage = createFakeStorage();
  assert.equal(saveRun(sample, storage), true);
  assert.deepEqual(loadRun(storage), sample);
  assert.ok(storage.data.has(SAVE_KEY));
});

test('loadRun returns null for corrupt, foreign-version, or empty storage', () => {
  assert.equal(loadRun(createFakeStorage()), null);
  for (const text of ['garbage', '{"v":2}', '{"v":1,"seed":"x"}', '[]']) {
    const storage = createFakeStorage();
    storage.data.set(SAVE_KEY, text);
    assert.equal(loadRun(storage), null, text);
  }
});

test('clearRun removes the checkpoint', () => {
  const storage = createFakeStorage();
  saveRun(sample, storage);
  clearRun(storage);
  assert.equal(loadRun(storage), null);
});

test('null storage and throwing storage never throw and report failure', () => {
  for (const storage of [null, createFakeStorage({ failOn: ['get', 'set', 'remove'] })]) {
    assert.equal(loadRun(storage), null);
    assert.equal(saveRun(sample, storage), false);
    assert.doesNotThrow(() => clearRun(storage));
  }
  const full = createFakeStorage({ failOn: ['set'] });
  assert.equal(saveRun(sample, full), false);
  const noRemove = createFakeStorage({ failOn: ['remove'] });
  assert.doesNotThrow(() => clearRun(noRemove));
});

test('getStorage returns null instead of throwing when localStorage is missing or blocked', () => {
  assert.equal(getStorage(), null); // node has no window
  const saved = globalThis.window;
  try {
    globalThis.window = {
      get localStorage() {
        throw new Error('SecurityError');
      },
    };
    assert.equal(getStorage(), null);
    const fake = createFakeStorage();
    globalThis.window = { localStorage: fake };
    assert.equal(getStorage(), fake);
  } finally {
    if (saved === undefined) delete globalThis.window;
    else globalThis.window = saved;
  }
});

test('bootRun with a valid seed starts a fresh run with that seed and overwrites the save', () => {
  const storage = createFakeStorage();
  saveRun(sample, storage);
  const run = bootRun({ search: '?debug=1&seed=4242', storage, randomSeed: neverRandom });
  assert.deepEqual(run, createRun(4242));
  assert.deepEqual(loadRun(storage), createRun(4242));
});

test('bootRun without a seed resumes the saved run', () => {
  const storage = createFakeStorage();
  saveRun(sample, storage);
  assert.deepEqual(bootRun({ search: '?debug=1', storage, randomSeed: neverRandom }), sample);
});

test('bootRun with an invalid seed resumes the saved run; with nothing saved uses randomSeed()', () => {
  const storage = createFakeStorage();
  saveRun(sample, storage);
  for (const search of ['?seed=abc', '?seed=-5', '?seed=1e9', '?seed=99999999999', '?seed=']) {
    assert.deepEqual(bootRun({ search, storage, randomSeed: neverRandom }), sample, search);
  }
  const empty = createFakeStorage();
  const run = bootRun({ search: '?seed=abc', storage: empty, randomSeed: () => 31337 });
  assert.deepEqual(run, createRun(31337));
  assert.deepEqual(loadRun(empty), createRun(31337));
});

test('bootRun with a corrupt save or unusable storage starts a new run without throwing', () => {
  const corrupt = createFakeStorage();
  corrupt.data.set(SAVE_KEY, '{"v":1,"seed":-3}');
  assert.deepEqual(bootRun({ search: '', storage: corrupt, randomSeed: () => 9 }), createRun(9));
  assert.equal(corrupt.data.get(SAVE_KEY), serializeRun(createRun(9)));
  assert.deepEqual(bootRun({ search: '', storage: null, randomSeed: () => 10 }), createRun(10));
  const broken = createFakeStorage({ failOn: ['get', 'set', 'remove'] });
  assert.deepEqual(bootRun({ search: '?seed=5', storage: broken, randomSeed: neverRandom }), createRun(5));
  assert.deepEqual(bootRun({ search: '', storage: broken, randomSeed: () => 11 }), createRun(11));
});

test('the endings key is gaze.endings.v1 and there are four endings', () => {
  assert.equal(ENDINGS_KEY, 'gaze.endings.v1');
  assert.deepEqual(ENDING_IDS, ['discern', 'alone', 'half', 'faithful']);
});

test('saveEnding records each ending once in first-seen order', () => {
  const s = createFakeStorage();
  assert.deepEqual(loadEndings(s), []);
  saveEnding('half', s);
  saveEnding('alone', s);
  assert.deepEqual(saveEnding('half', s), ['half', 'alone']);
  assert.deepEqual(loadEndings(s), ['half', 'alone']);
});

test('loadEndings ignores corrupt values and unknown ids', () => {
  for (const text of ['x', '{"a":1}', '["half","nope"]', '[1]', 'null']) {
    const s = createFakeStorage();
    s.data.set(ENDINGS_KEY, text);
    assert.deepEqual(loadEndings(s), [], text);
  }
  assert.deepEqual(loadEndings(null), []);
});

test('clearRun keeps the seen endings', () => {
  const s = createFakeStorage();
  saveEnding('discern', s);
  saveRun(sample, s);
  clearRun(s);
  assert.deepEqual(loadEndings(s), ['discern']);
});

test('throwing storage never throws from loadEndings/saveEnding', () => {
  const s = createFakeStorage({ failOn: ['get', 'set'] });
  assert.deepEqual(loadEndings(s), []);
  assert.deepEqual(saveEnding('alone', s), ['alone']);
  assert.deepEqual(saveEnding('alone', null), ['alone']);
});
