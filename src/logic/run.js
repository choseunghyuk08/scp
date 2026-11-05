import { AGGRO_TILES, ZONE_COUNT, ZONE_MIN_PATH, ZONE_SCP096, ZONE_SCP173 } from '../config.js';
import { instructionPlan } from './instructions.js';
import { RADIO_LINES } from './radio.js';
import { hashSeed } from './rng.js';

// Run = { seed, zone, attempt, hasKey, heard, items: {eyedrops, stim}, outcomes: Outcome[] } — everything that must
// survive a death or a reload. Outcome = 'followed' | 'refused' | 'none', one per finished zone (D82, D85).
// ZoneSpec = { index, isTutorial, isFinal, hasKey, roomCount, minPath, scp173Count, scp096Count, instruction }.

const SAVE_VERSION = 1;
const MAX_SEED = 4294967295;
const MAX_ATTEMPT = 1000000;
const MAX_ITEMS = 99;
const OUTCOMES = new Set(['followed', 'refused', 'none']);
const copyItems = (items) => ({ eyedrops: items.eyedrops, stim: items.stim });

export function createRun(seed) {
  return { seed, zone: 0, attempt: 0, hasKey: false, heard: [], items: { eyedrops: 0, stim: 0 }, outcomes: [] };
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
    instruction: instructionPlan(seed)[index],
  };
}

/** The tutorial's 173 sleeps until seen; later zones' 173s only hunt inside AGGRO_TILES. */
export function activationFor(spec) {
  return spec.isTutorial ? { kind: 'sighting' } : { kind: 'radius', tiles: AGGRO_TILES };
}

export function advanceZone(run) {
  if (run.zone >= ZONE_COUNT - 1) throw new RangeError('already in the final zone');
  return { ...run, zone: run.zone + 1, attempt: 0, heard: [...run.heard], items: copyItems(run.items), outcomes: [...run.outcomes] };
}

export function registerDeath(run, heard) {
  return { ...run, attempt: run.attempt + 1, heard: [...heard], items: copyItems(run.items), outcomes: [...run.outcomes] };
}

/** Leaving a zone: its instruction outcome and the items carried out become part of the checkpoint. */
export function recordZone(run, { outcome, items }) {
  const outcomes = [...run.outcomes];
  while (outcomes.length < run.zone) outcomes.push('none');
  outcomes[run.zone] = outcome;
  return { ...run, heard: [...run.heard], items: copyItems(items), outcomes };
}

export function serializeRun(run) {
  return JSON.stringify({
    v: SAVE_VERSION,
    seed: run.seed,
    zone: run.zone,
    attempt: run.attempt,
    hasKey: run.hasKey,
    heard: run.heard,
    items: run.items,
    outcomes: run.outcomes,
  });
}

const intIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

const validItems = (items) =>
  items !== null && typeof items === 'object' && !Array.isArray(items) &&
  intIn(items.eyedrops, 0, MAX_ITEMS) && intIn(items.stim, 0, MAX_ITEMS);
const validOutcomes = (outcomes) =>
  Array.isArray(outcomes) && outcomes.length <= ZONE_COUNT && outcomes.every((o) => OUTCOMES.has(o));

/**
 * Strict: anything that is not exactly a version-1 save returns null (never throws). A v0.3 save has no items or
 * outcomes and loads with none; a save that has them broken is discarded.
 */
export function parseRun(text) {
  if (typeof text !== 'string') return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const { v, seed, zone, attempt, hasKey, heard, items = { eyedrops: 0, stim: 0 }, outcomes = [] } = data;
  if (v !== SAVE_VERSION) return null;
  if (!intIn(seed, 0, MAX_SEED) || !intIn(zone, 0, ZONE_COUNT - 1) || !intIn(attempt, 0, MAX_ATTEMPT)) return null;
  if (typeof hasKey !== 'boolean') return null;
  if (!Array.isArray(heard) || !heard.every((e) => typeof e === 'string' && Object.hasOwn(RADIO_LINES, e))) return null;
  if (!validItems(items) || !validOutcomes(outcomes)) return null;
  return { seed, zone, attempt, hasKey, heard: [...heard], items: copyItems(items), outcomes: [...outcomes] };
}

/** `?seed=<digits>` only; anything else (empty, signs, decimals, exponents, too large) is ignored. */
export function parseSeedParam(search) {
  if (typeof search !== 'string') return null;
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_SEED ? n : null;
}
