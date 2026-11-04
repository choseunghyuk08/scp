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

// v0.2 run structure (spec §4, §10). ZONE_SCP173 is a plan assumption: the spec only fixes the tutorial's single 173.
export const ZONE_COUNT = 4;
export const ZONE_MIN_PATH = [90, 120, 120, 120];
export const ZONE_SCP173 = [1, 1, 2, 2];
export const SAVE_KEY = 'gaze.run.v1';
export const ZONE_COLS = 64;
export const ZONE_ROWS = 40;
export const MAX_GEN_ATTEMPTS = 50;
export const SPAWN_MIN_PATH = 15;
export const SPAWN_KEY_MIN_TILES = 5;
export const TRANSITION_MS = 400;
