import { AGGRO_TILES, ZONE_COUNT, ZONE_MIN_PATH, ZONE_SCP096, ZONE_SCP173 } from '../config.js';
import { RADIO_LINES } from './radio.js';
import { hashSeed } from './rng.js';

// Run = { seed, zone, attempt, hasKey, heard } — everything that must survive a death or a reload.
// ZoneSpec = { index, isTutorial, isFinal, hasKey, roomCount, minPath, scp173Count, scp096Count }.

const SAVE_VERSION = 1;
const MAX_SEED = 4294967295;
const MAX_ATTEMPT = 1000000;

export function createRun(seed) {
  return { seed, zone: 0, attempt: 0, hasKey: false, heard: [] };
}

/** The single zone (index 1 or 2) that holds the card key. */
export function keyZone(seed) {
  return 1 + (hashSeed(seed, 0x4b45) % 2);
}

export function zoneSpec(seed, index) {
  if (!Number.isInteger(index) || index < 0 || index >= ZONE_COUNT) throw new RangeError(`no zone ${index}`);
  const isTutorial = index === 0;
  return {
    index,
    isTutorial,
    isFinal: index === ZONE_COUNT - 1,
    hasKey: index === keyZone(seed),
    // A zone with a 096 needs a spare room for it besides the entrance, exit and card-key rooms.
    roomCount: isTutorial ? 3 : ZONE_SCP096[index] > 0 ? 4 : 3 + (hashSeed(seed, index, 1) % 2),
    minPath: ZONE_MIN_PATH[index],
    scp173Count: ZONE_SCP173[index],
    scp096Count: ZONE_SCP096[index],
  };
}

/** The tutorial's 173 sleeps until seen; later zones' 173s only hunt inside AGGRO_TILES. */
export function activationFor(spec) {
  return spec.isTutorial ? { kind: 'sighting' } : { kind: 'radius', tiles: AGGRO_TILES };
}

export function advanceZone(run) {
  if (run.zone >= ZONE_COUNT - 1) throw new RangeError('already in the final zone');
  return { ...run, zone: run.zone + 1, attempt: 0, heard: [...run.heard] };
}

export function registerDeath(run, heard) {
  return { ...run, attempt: run.attempt + 1, heard: [...heard] };
}

export function serializeRun(run) {
  return JSON.stringify({
    v: SAVE_VERSION,
    seed: run.seed,
    zone: run.zone,
    attempt: run.attempt,
    hasKey: run.hasKey,
    heard: run.heard,
  });
}

const intIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/** Strict: anything that is not exactly a version-1 save returns null (never throws). */
export function parseRun(text) {
  if (typeof text !== 'string') return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const { v, seed, zone, attempt, hasKey, heard } = data;
  if (v !== SAVE_VERSION) return null;
  if (!intIn(seed, 0, MAX_SEED) || !intIn(zone, 0, ZONE_COUNT - 1) || !intIn(attempt, 0, MAX_ATTEMPT)) return null;
  if (typeof hasKey !== 'boolean') return null;
  if (!Array.isArray(heard) || !heard.every((e) => typeof e === 'string' && Object.hasOwn(RADIO_LINES, e))) return null;
  return { seed, zone, attempt, hasKey, heard: [...heard] };
}

/** `?seed=<digits>` only; anything else (empty, signs, decimals, exponents, too large) is ignored. */
export function parseSeedParam(search) {
  if (typeof search !== 'string') return null;
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_SEED ? n : null;
}
