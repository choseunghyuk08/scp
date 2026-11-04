import { SCP096 } from '../config.js';
import { chaseStep } from './chase.js';
import { doorAtTile, isBlocking } from './doors.js';
import { tileOf } from './grid.js';
import { findPath } from './pathfinding.js';
import { canSee } from './vision.js';

// Scp096State = { pos, home, homeFacing, facing, mode: 'idle' | 'rage' | 'returning',
//   breaking: null | { doorId, state: the door state the wait is for, left: seconds } }

const tileOfPoint = (p) => ({ tx: tileOf(p.x), ty: tileOf(p.y) });
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const heading = (from, to, fallback) =>
  from.x === to.x && from.y === to.y ? fallback : Math.atan2(to.y - from.y, to.x - from.x);

export function create096(pos, facing) {
  return { pos: { ...pos }, home: { ...pos }, homeFacing: facing, facing, mode: 'idle', breaking: null };
}

/** The player sees its face: the 096 is in the cone with a clear line, and the player stands within its front arc. */
export function faceSeen(s, { grid, player, playerFacing }) {
  if (!canSee(grid, player, playerFacing, s.pos)) return false;
  const toPlayer = Math.atan2(player.y - s.pos.y, player.x - s.pos.x);
  return angleDiff(toPlayer, s.facing) <= SCP096.faceHalfAngle;
}

function enrage(s, player) {
  return { ...s, mode: 'rage', breaking: null, facing: heading(s.pos, player, s.facing) };
}

/**
 * idle: waits until its face is seen. rage: chases on the door-ignoring navGrid, stopping to break any closed (3s)
 * or locked (6s) door in the way once it reaches it; locking a closed door it is breaking restarts the wait at 6s.
 * Getting calmTiles away from a locked door it is breaking calms it.
 * returning: walks home, opening doors in its way, and sits down facing its home direction.
 * Door changes are reported as events ({doorId, kind: 'broken' | 'opened'}) for the caller to apply.
 */
export function step096(s, { dt, navGrid, doors, player, seen }) {
  const events = [];
  if (s.mode === 'idle') return { s: seen ? enrage(s, player) : s, events };

  if (s.mode === 'returning') {
    if (seen) return { s: enrage(s, player), events };
    const { pos } = chaseStep(s.pos, s.home, navGrid, SCP096.returnSpeed * dt);
    const door = doorAtTile(doors, tileOfPoint(pos));
    if (door && isBlocking(door)) events.push({ doorId: door.id, kind: 'opened' });
    if (Math.hypot(pos.x - s.home.x, pos.y - s.home.y) < 0.5) {
      return { s: { ...s, pos: { ...s.home }, facing: s.homeFacing, mode: 'idle' }, events };
    }
    return { s: { ...s, pos, facing: heading(s.pos, pos, s.facing) }, events };
  }

  if (s.breaking) {
    const door = doors.find((d) => d.id === s.breaking.doorId);
    if (!door || !isBlocking(door)) return { s: { ...s, breaking: null }, events };
    if (door.state !== s.breaking.state) {
      const breaking = { ...s.breaking, state: door.state, left: SCP096.breakSeconds[door.state] };
      return { s: { ...s, breaking }, events };
    }
    if (door.state === 'locked') {
      const path = findPath(navGrid, door.tiles[0], tileOfPoint(player));
      if (path === null || path.length >= SCP096.calmTiles) return { s: { ...s, mode: 'returning', breaking: null }, events };
    }
    const left = s.breaking.left - dt;
    if (left <= 0) {
      events.push({ doorId: door.id, kind: 'broken' });
      return { s: { ...s, breaking: null }, events };
    }
    return { s: { ...s, breaking: { ...s.breaking, left } }, events };
  }

  const blocked = (t) => {
    const d = doorAtTile(doors, t);
    return Boolean(d && isBlocking(d));
  };
  const step = chaseStep(s.pos, player, navGrid, SCP096.speed * dt, blocked);
  const next = { ...s, pos: step.pos, facing: heading(s.pos, step.pos, s.facing) };
  if (step.blockedTile) {
    const door = doorAtTile(doors, step.blockedTile);
    next.breaking = { doorId: door.id, state: door.state, left: SCP096.breakSeconds[door.state] };
  }
  return { s: next, events };
}

export function isLethal096(s, player) {
  return s.mode === 'rage' && Math.hypot(s.pos.x - player.x, s.pos.y - player.y) < SCP096.touchDistance;
}
