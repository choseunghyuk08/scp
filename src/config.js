export const TILE = 16;
export const VIEW_W = 480;
export const VIEW_H = 270;

export const PLAYER = { radius: 5, walkSpeed: 48, runSpeed: 80 };
export const VISION = { halfAngle: (35 * Math.PI) / 180, range: 128, rayCount: 48 };
export const STAMINA = { drainSeconds: 4, regenDelaySeconds: 3, regenSeconds: 4, resumeAt: 0.25 };
export const BLINK = { fillSeconds: 6, closedSeconds: 0.4 };
export const SCP173 = { speed: 112, touchDistance: 10 };
export const AGGRO_TILES = 14;

export const FOG_ALPHA = 0.88;
export const MAX_DT = 0.05;
export const RADIO_LINE_MS = 4000;
export const KEY_PICKUP_DIST = 10;
export const EXIT_INTERACT_DIST = 24;

// Run structure (spec §4, §7, §10). From v0.3 every zone has one 173 and zones 3-4 add one SCP-096 (D66).
export const ZONE_COUNT = 4;
export const ZONE_MIN_PATH = [90, 120, 120, 120];
export const ZONE_SCP173 = [1, 1, 1, 1];
export const ZONE_SCP096 = [0, 0, 1, 1];
export const SAVE_KEY = 'gaze.run.v1';
// v0.4: endings seen across runs, kept apart from the run checkpoint (D85).
export const ENDINGS_KEY = 'gaze.endings.v1';
export const ENDING_IDS = ['discern', 'alone', 'half', 'faithful'];
export const ZONE_COLS = 64;
export const ZONE_ROWS = 40;
export const MAX_GEN_ATTEMPTS = 50;
export const SPAWN_MIN_PATH = 15;
export const SPAWN_KEY_MIN_TILES = 5;
export const TRANSITION_MS = 400;
export const R_CONFIRM_MS = 3000;

// v0.4 side rooms (D84): interior size, straight corridor length, and the instruction trigger distance (D83).
// The corridor is at least 3 long so its two doorways (anchor side, side-room side) never touch and merge.
export const SIDE_ROOM = { minW: 5, maxW: 7, minH: 4, maxH: 5, corridor: [3, 8], warnTiles: 12 };
// v0.4 items and the false side room's trap (D77, D78). Flashes stay at most 3 per second (spec §12).
export const ITEMS = { pickupDist: 10, stimSeconds: 5 };
export const TRAP = { lockSeconds: 8, darkSeconds: 1.5, flashes: [[0.3, 0.42], [0.9, 1.02]] };

// v0.3 doors
export const DOOR_INTERACT_DIST = 24;
export const SCP096 = {
  speed: 150,
  returnSpeed: 48,
  touchDistance: 10,
  faceHalfAngle: (60 * Math.PI) / 180,
  calmTiles: 20,
  warnTiles: 12,
  breakSeconds: { closed: 3, locked: 6 },
};
