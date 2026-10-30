import { BLINK } from '../config.js';

export function createBlink() {
  return { gauge: 0, closedLeft: 0 };
}

export function isBlinking(s) {
  return s.closedLeft > 0;
}

export function stepBlink(s, dt) {
  if (s.closedLeft > 0) {
    const closedLeft = s.closedLeft - dt;
    return closedLeft > 0 ? { gauge: s.gauge, closedLeft } : { gauge: 0, closedLeft: 0 };
  }
  const gauge = s.gauge + dt / BLINK.fillSeconds;
  return gauge >= 1 ? { gauge: 1, closedLeft: BLINK.closedSeconds } : { gauge, closedLeft: 0 };
}
