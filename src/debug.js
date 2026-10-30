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
  };
}
