import { SCP173 } from '../config.js';
import { chaseStep } from './chase.js';

const ALWAYS = { kind: 'always' };

export function create173(pos) {
  return { pos: { x: pos.x, y: pos.y }, frozen: false, awake: false };
}

/**
 * Frozen while observed; otherwise walks the BFS path toward the player at SCP173.speed.
 * `activation` decides when it hunts:
 *  - always:   as soon as it is unobserved (v0.1);
 *  - sighting: dormant (frozen, harmless) until seen once, then it hunts for good;
 *  - radius:   only while the player is within `tiles` path tiles.
 */
export function step173(s, { dt, grid, player, observed, activation = ALWAYS }) {
  const awake = s.awake || (activation.kind === 'sighting' && observed);
  if (observed) return { pos: { ...s.pos }, frozen: true, awake };
  if (activation.kind === 'sighting' && !awake) return { pos: { ...s.pos }, frozen: true, awake };

  const maxTiles = activation.kind === 'radius' ? activation.tiles : Infinity;
  const { pos } = chaseStep(s.pos, player, grid, SCP173.speed * dt, undefined, maxTiles);
  return { pos, frozen: false, awake };
}

export function isLethal(s, player) {
  return !s.frozen && Math.hypot(s.pos.x - player.x, s.pos.y - player.y) < SCP173.touchDistance;
}
