import { isBlinking } from './logic/blink.js';
import { createRadio } from './logic/radio.js';
import { create173 } from './logic/scp173.js';

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
      scp173: scene.scp.map((s, i) => ({ x: s.pos.x, y: s.pos.y, frozen: s.frozen, visible: scene.observed[i] })),
      hasKey: scene.hasKey,
      radio: scene.radio.current(scene.nowMs()),
      exitSolid: scene.grid[scene.map.exit.ty][scene.map.exit.tx],
    }),
    teleportPlayer(x, y) {
      scene.player = { x, y };
    },
    setAim(rad) {
      scene.aimOverride = rad;
    },
    loadRows(rows) {
      scene.scene.restart({ rows });
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
