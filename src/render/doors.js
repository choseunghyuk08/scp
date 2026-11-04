import { TILE } from '../config.js';
import { doorCenter } from '../logic/doors.js';

const DOOR_COLORS = {
  frame: 0x9a7a48,
  closed: 0x7a5530,
  locked: 0x6e2a20,
  lockDot: 0xe0c040,
  broken: 0x26262e,
  barBack: 0x000000,
  bar: 0xe04040,
};

function bounds(door) {
  const xs = door.tiles.map((t) => t.tx);
  const ys = door.tiles.map((t) => t.ty);
  const x = Math.min(...xs) * TILE;
  const y = Math.min(...ys) * TILE;
  return { x, y, w: (Math.max(...xs) + 1) * TILE - x, h: (Math.max(...ys) + 1) * TILE - y };
}

/**
 * Open: frame only. Closed: brown. Locked: red-brown with a dot in the middle. Broken: dark floor.
 * `breaking` lists doors an SCP-096 is breaking, with progress 0..1, drawn as a bar above the door.
 */
export function drawDoors(gfx, doors, breaking) {
  gfx.clear();
  for (const door of doors) {
    const b = bounds(door);
    if (door.broken) {
      gfx.fillStyle(DOOR_COLORS.broken, 1).fillRect(b.x, b.y, b.w, b.h);
    } else if (door.state === 'open') {
      gfx.lineStyle(1, DOOR_COLORS.frame, 1).strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    } else {
      gfx.fillStyle(door.state === 'locked' ? DOOR_COLORS.locked : DOOR_COLORS.closed, 1).fillRect(b.x, b.y, b.w, b.h);
      gfx.lineStyle(1, DOOR_COLORS.frame, 1).strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      if (door.state === 'locked') {
        const c = doorCenter(door);
        gfx.fillStyle(DOOR_COLORS.lockDot, 1).fillCircle(c.x, c.y, 2);
      }
    }
  }
  for (const { doorId, progress } of breaking) {
    const door = doors.find((d) => d.id === doorId);
    if (!door) continue;
    const b = bounds(door);
    const c = doorCenter(door);
    const p = Math.min(Math.max(progress, 0), 1);
    gfx.fillStyle(DOOR_COLORS.barBack, 0.8).fillRect(c.x - 9, b.y - 7, 18, 5);
    gfx.fillStyle(DOOR_COLORS.bar, 1).fillRect(c.x - 8, b.y - 6, 16 * p, 3);
  }
}
