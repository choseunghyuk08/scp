import { TRAP } from '../config.js';

// Trap = { t: seconds since the false side room's door slammed }. Everything else is derived from t (D78).

export function createTrap() {
  return { t: 0 };
}

export function stepTrap(trap, dt) {
  return { t: trap.t + dt };
}

export function trapView({ t }) {
  return {
    locked: t < TRAP.lockSeconds,
    dark: t < TRAP.darkSeconds,
    flash: TRAP.flashes.some(([from, to]) => t >= from && t < to),
    over: t >= TRAP.lockSeconds,
  };
}
