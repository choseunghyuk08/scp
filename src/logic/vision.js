import { TILE, VISION } from '../config.js';
import { pointSolid } from './grid.js';

const LOS_STEP = TILE / 4;
const RAY_STEP = 2;

export function inCone(origin, facing, target, halfAngle, range) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy);
  // A target exactly on the origin has no direction; it is not "seen".
  if (dist === 0 || dist > range) return false;
  const diff = Math.atan2(dy, dx) - facing;
  const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(wrapped) <= halfAngle;
}

export function hasLineOfSight(grid, a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(dist / LOS_STEP));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (pointSolid(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

export function canSee(grid, eye, facing, target) {
  return inCone(eye, facing, target, VISION.halfAngle, VISION.range) && hasLineOfSight(grid, eye, target);
}

/** [eye, ...rayCount+1 endpoints] spanning facing±halfAngle; each ray stops before a wall or at range. */
export function visibilityPolygon(grid, eye, facing) {
  const { halfAngle, range, rayCount } = VISION;
  const points = [{ x: eye.x, y: eye.y }];
  for (let i = 0; i <= rayCount; i++) {
    const angle = facing - halfAngle + (2 * halfAngle * i) / rayCount;
    const cx = Math.cos(angle);
    const cy = Math.sin(angle);
    let d = 0;
    while (d + RAY_STEP <= range && !pointSolid(grid, { x: eye.x + cx * (d + RAY_STEP), y: eye.y + cy * (d + RAY_STEP) })) {
      d += RAY_STEP;
    }
    points.push({ x: eye.x + cx * d, y: eye.y + cy * d });
  }
  return points;
}
