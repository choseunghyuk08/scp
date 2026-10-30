export const TILE = 16;
export const VIEW_W = 480;
export const VIEW_H = 270;

export const PLAYER = { radius: 5, walkSpeed: 48, runSpeed: 80 };
export const VISION = { halfAngle: (35 * Math.PI) / 180, range: 128, rayCount: 48 };
export const STAMINA = { drainSeconds: 4, regenDelaySeconds: 3, regenSeconds: 4, resumeAt: 0.25 };
export const BLINK = { fillSeconds: 6, closedSeconds: 0.4 };
export const SCP173 = { speed: 112, touchDistance: 10 };

export const FOG_ALPHA = 0.88;
export const MAX_DT = 0.05;
export const RADIO_LINE_MS = 4000;
export const KEY_PICKUP_DIST = 10;
export const EXIT_INTERACT_DIST = 24;
