import { STAMINA } from '../config.js';

export function createStamina() {
  return { value: 1, idleSeconds: 0, exhausted: false };
}

export function canRun(s) {
  return !s.exhausted && s.value > 0;
}

/** `running` = the player wants to run and is moving. Ignored while exhausted. */
export function stepStamina(s, dt, running) {
  if (running && canRun(s)) {
    const value = Math.max(0, s.value - dt / STAMINA.drainSeconds);
    return { value, idleSeconds: 0, exhausted: value <= 0 };
  }
  const idleSeconds = s.idleSeconds + dt;
  // Only the time spent past the regen delay counts toward recovery.
  const regenTime = Math.min(dt, Math.max(0, idleSeconds - STAMINA.regenDelaySeconds));
  const value = Math.min(1, s.value + regenTime / STAMINA.regenSeconds);
  return { value, idleSeconds, exhausted: s.exhausted && value < STAMINA.resumeAt };
}
