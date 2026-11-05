import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GEN_ATTEMPTS, ZONE_COUNT } from '../../src/config.js';
import { buildZone, validateZoneMap } from '../../src/logic/mapgen.js';
import { zoneSpec } from '../../src/logic/run.js';

test('audit: 1000 seeds x 4 zones all validate (side rooms included), never fall back, stay under 50 tries, and every run totals >= 450 path tiles', () => {
  let tries = 0;
  let maxTries = 0;
  let fallbacks = 0;
  let minRun = Infinity;
  const failures = [];
  for (let seed = 0; seed < 1000; seed++) {
    let runPath = 0;
    for (let z = 0; z < ZONE_COUNT; z++) {
      const spec = zoneSpec(seed, z);
      const { map, info } = buildZone(seed, spec, 0);
      const problems = validateZoneMap(map, spec);
      if (problems.length) failures.push(`seed ${seed} zone ${z}: ${problems.join('; ')}`);
      if (info.usedFallback) fallbacks++;
      if (!map.sideRoom || map.sideRoom.doorId === null) failures.push(`seed ${seed} zone ${z}: no side room`);
      tries += info.tries;
      maxTries = Math.max(maxTries, info.tries);
      runPath += info.pathLength;
    }
    minRun = Math.min(minRun, runPath);
  }
  console.log(`audit: avg tries ${(tries / (1000 * ZONE_COUNT)).toFixed(2)}, max tries ${maxTries}, fallbacks ${fallbacks}, min run path ${minRun}`);
  assert.deepEqual(failures.slice(0, 5), []);
  assert.equal(fallbacks, 0);
  assert.ok(maxTries <= MAX_GEN_ATTEMPTS);
  assert.ok(minRun >= 450, `min run path ${minRun}`);
});
