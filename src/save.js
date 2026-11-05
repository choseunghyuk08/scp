import { ENDING_IDS, ENDINGS_KEY, SAVE_KEY } from './config.js';
import { createRun, parseRun, parseSeedParam, serializeRun } from './logic/run.js';

// The only module that touches localStorage. Storage is passed in so the rules run under node, and every access
// is guarded: a blocked, full, or missing storage just means "no checkpoint", never an exception.

export function getStorage() {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadRun(storage) {
  if (!storage) return null;
  try {
    return parseRun(storage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function saveRun(run, storage) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serializeRun(run));
    return true;
  } catch {
    return false;
  }
}

export function clearRun(storage) {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // nothing to clear we can reach
  }
}

/** Endings seen in any run, in first-seen order. Corrupt or unknown values read as none seen. */
export function loadEndings(storage) {
  if (!storage) return [];
  try {
    const list = JSON.parse(storage.getItem(ENDINGS_KEY));
    return Array.isArray(list) && list.every((id) => ENDING_IDS.includes(id)) ? [...new Set(list)] : [];
  } catch {
    return [];
  }
}

/** Adds an ending to the seen list (once) and returns the list, even when it cannot be stored. */
export function saveEnding(id, storage) {
  const seen = loadEndings(storage);
  if (!seen.includes(id)) seen.push(id);
  if (storage) {
    try {
      storage.setItem(ENDINGS_KEY, JSON.stringify(seen));
    } catch {
      // seen list stays in memory only
    }
  }
  return seen;
}

/** ?seed= starts a fresh run with that seed; otherwise resume the checkpoint, else a new random run. */
export function bootRun({ search, storage, randomSeed }) {
  const seed = parseSeedParam(search);
  const run = seed !== null ? createRun(seed) : (loadRun(storage) ?? createRun(randomSeed()));
  saveRun(run, storage);
  return run;
}
