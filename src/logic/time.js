import { MAX_DT } from '../config.js';

export function clampDt(dt, max = MAX_DT) {
  if (!(dt > 0)) return 0;
  return Math.min(dt, max);
}
