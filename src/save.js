import { SAVE_KEY } from './config.js';
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

/** ?seed= starts a fresh run with that seed; otherwise resume the checkpoint, else a new random run. */
export function bootRun({ search, storage, randomSeed }) {
  const seed = parseSeedParam(search);
  const run = seed !== null ? createRun(seed) : (loadRun(storage) ?? createRun(randomSeed()));
  saveRun(run, storage);
  return run;
}
