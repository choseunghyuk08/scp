import { isBlinking } from './logic/blink.js';
import { createRadio } from './logic/radio.js';
import { create173 } from './logic/scp173.js';

/** Small string hash so smoke checks can compare two generated maps. */
function mapHash(map) {
  let h = 5381;
  for (const row of map.grid) for (const wall of row) h = (Math.imul(h, 33) + (wall ? 1 : 0)) >>> 0;
  return h;
}

/** Test hooks for the Playwright smoke checks. Only installed with ?debug=1. */
export function installDebug(scene) {
  if (new URLSearchParams(location.search).get('debug') !== '1') return;

  window.__debug = {
    state: () => ({
      generation: scene.generation,
      mode: scene.mode,
      player: { x: scene.player.x, y: scene.player.y },
      facing: scene.facing,
      stamina: { value: scene.stamina.value, exhausted: scene.stamina.exhausted },
      camera: { scrollX: scene.cameras.main.scrollX, scrollY: scene.cameras.main.scrollY },
      blink: { gauge: scene.blink.gauge, blinking: isBlinking(scene.blink) },
      scp173: scene.scp.map((s, i) => ({ x: s.pos.x, y: s.pos.y, frozen: s.frozen, awake: s.awake, visible: scene.observed[i] })),
      hasKey: scene.hasKey,
      radio: scene.radio.current(scene.nowMs()),
      exitSolid: scene.grid[scene.map.exit.ty][scene.map.exit.tx],
      run: scene.run ? structuredClone(scene.run) : null,
      activation: scene.activation.kind,
      zoneLabel: scene.zoneLabel,
      map: {
        cols: scene.map.cols,
        rows: scene.map.rows,
        playerStart: scene.map.playerStart,
        cardKey: scene.map.cardKey,
        exit: scene.map.exit,
        spawns173: scene.map.spawns173,
        hash: mapHash(scene.map),
      },
      zone: scene.zoneInfo
        ? { usedFallback: scene.zoneInfo.usedFallback, tries: scene.zoneInfo.tries, rooms: scene.zoneInfo.rooms }
        : null,
    }),
    teleportPlayer(x, y) {
      scene.player = { x, y };
    },
    setAim(rad) {
      scene.aimOverride = rad;
    },
    loadRows(rows, extra = {}) {
      scene.scene.restart({ rows, ...extra });
    },
    startRun(run) {
      scene.scene.restart({ run });
    },
    advance(ms) {
      scene.update(scene.time.now, ms);
    },
    place173(i, x, y) {
      scene.scp[i] = create173({ x, y });
    },
    setBlinkGauge(v) {
      scene.blink = { ...scene.blink, gauge: v };
    },
    giveKey() {
      scene.hasKey = true;
      scene.keyGfx.clear();
    },
    resetRadio() {
      scene.radio = createRadio();
      scene.shownLine = null;
    },
  };
}
