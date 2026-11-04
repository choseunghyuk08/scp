const assert = require('node:assert/strict');
const { withPage } = require('./helpers.cjs');
const { OPEN_ROOM } = require('./rooms.cjs');

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

check('boot', async (page, baseUrl) => {
  await page.goto(`${baseUrl}/index.html?debug=1`);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Play'), null, { timeout: 5000 });
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.width, h: c.height, version: Phaser.VERSION };
  });
  assert.deepEqual(info, { w: 480, h: 270, version: '3.90.0' });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => window.__debug.state());

async function openRoom(page, baseUrl, extra = {}) {
  await page.goto(`${baseUrl}/index.html?debug=1`);
  await page.waitForFunction(() => window.__debug, null, { timeout: 5000 });
  const gen = await page.evaluate(() => window.__debug.state().generation);
  await page.evaluate(([rows, more]) => window.__debug.loadRows(rows, more), [OPEN_ROOM, extra]);
  await page.waitForFunction((g) => window.__debug.state().generation > g, gen, { timeout: 5000 });
}

/** Fresh storage, then boot a run from ?seed=. */
async function openRun(page, baseUrl, seed) {
  await page.goto(`${baseUrl}/index.html?debug=1`);
  await page.waitForFunction(() => window.__debug, null, { timeout: 5000 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/index.html?debug=1&seed=${seed}`);
  await page.waitForFunction((s) => window.__debug && window.__debug.state().run?.seed === s, seed, { timeout: 5000 });
}

async function startRun(page, run) {
  const gen = (await page.evaluate(() => window.__debug.state())).generation;
  await page.evaluate((r) => window.__debug.startRun(r), run);
  await page.waitForFunction((g) => window.__debug.state().generation > g, gen, { timeout: 5000 });
}

check('move: holding D 500ms moves 15..30px right', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  const a = await state(page);
  await page.keyboard.down('d');
  await sleep(500);
  await page.keyboard.up('d');
  const b = await state(page);
  const dx = b.player.x - a.player.x;
  assert.ok(dx >= 15 && dx <= 30, `dx ${dx}`);
  assert.ok(Math.abs(b.player.y - a.player.y) < 0.01);
});

check('wall blocks: teleport to (24,24), hold A+W 1s -> x>=21 and y>=21', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => window.__debug.teleportPlayer(24, 24));
  await page.keyboard.down('a');
  await page.keyboard.down('w');
  await sleep(1000);
  await page.keyboard.up('a');
  await page.keyboard.up('w');
  const s = await state(page);
  assert.ok(s.player.x >= 20.99 && s.player.y >= 20.99, `pos ${JSON.stringify(s.player)}`);
});

check('no mouse input: facing === 0 and not NaN', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await sleep(200);
  const s = await state(page);
  assert.equal(s.facing, 0);
  assert.ok(Number.isFinite(s.facing));
});

check('blur releases keys: hold D, window blur, x stops changing', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.keyboard.down('d');
  await sleep(200);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(100);
  const a = await state(page);
  await sleep(300);
  const b = await state(page);
  await page.keyboard.up('d');
  assert.ok(Math.abs(b.player.x - a.player.x) <= 1, `moved ${b.player.x - a.player.x} after blur`);
});

check('huge frame cannot tunnel: one 5000ms frame moves <= 4px', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => window.__debug.teleportPlayer(72, 72));
  await page.keyboard.down('d');
  await sleep(100);
  const moved = await page.evaluate(() => {
    const x0 = window.__debug.state().player.x;
    window.__debug.advance(5000);
    return window.__debug.state().player.x - x0;
  });
  await page.keyboard.up('d');
  assert.ok(moved > 0 && moved <= 4, `moved ${moved}`);
});

check('fog: floor inside the cone is more than 2x brighter than behind the player', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(72, 72);
    window.__debug.setAim(0);
  });
  await sleep(150);
  const s = await state(page);
  const sx = Math.round(s.player.x - s.camera.scrollX);
  const sy = Math.round(s.player.y - s.camera.scrollY);
  const px = await page.evaluate(
    ([x, y]) => Array.from(document.querySelector('canvas').getContext('2d').getImageData(x, y, 1, 1).data),
    [sx + 40, sy],
  );
  const behind = await page.evaluate(
    ([x, y]) => Array.from(document.querySelector('canvas').getContext('2d').getImageData(x, y, 1, 1).data),
    [sx - 40, sy],
  );
  assert.ok(px[0] > behind[0] * 2, `inside r=${px[0]} behind r=${behind[0]}`);
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pixel = (page, x, y) =>
  page.evaluate(
    ([px, py]) => Array.from(document.querySelector('canvas').getContext('2d').getImageData(px, py, 1, 1).data),
    [x, y],
  );

check('seen 173 stays frozen and visible', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => {
    window.__debug.setAim(0);
    window.__debug.place173(0, 168, 72);
  });
  await sleep(600);
  const s = await state(page);
  assert.deepEqual([s.scp173[0].x, s.scp173[0].y], [168, 72]);
  assert.equal(s.scp173[0].frozen, true);
  assert.equal(s.scp173[0].visible, true);
});

check('unseen 173 chases at ~112px/s', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => {
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 168, 72);
  });
  const t0 = Date.now();
  await sleep(400);
  const s = await state(page);
  const elapsed = (Date.now() - t0) / 1000;
  const closed = 96 - dist(s.scp173[0], s.player);
  assert.ok(Math.abs(closed - 112 * elapsed) <= 10, `closed ${closed} in ${elapsed}s`);
  assert.equal(s.scp173[0].frozen, false);
});

check('173 outside the cone or beyond range is hidden', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => {
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 168, 72);
  });
  await sleep(60);
  assert.equal((await state(page)).scp173[0].visible, false, 'behind the player');
  await page.evaluate(() => {
    window.__debug.setAim(0);
    window.__debug.place173(0, 240, 72);
  });
  await sleep(30);
  assert.equal((await state(page)).scp173[0].visible, false, 'beyond range 128px');
});

check('blink blackout: screen goes black and the observed 173 moves', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => {
    window.__debug.setAim(0);
    window.__debug.place173(0, 168, 72);
    window.__debug.setBlinkGauge(0.99);
  });
  await page.waitForFunction(() => window.__debug.state().blink.blinking, null, { timeout: 2000, polling: 'raf' });
  const during = await state(page);
  const sx = Math.round(during.player.x - during.camera.scrollX);
  const sy = Math.round(during.player.y - during.camera.scrollY);
  const px = await pixel(page, sx + 40, sy);
  assert.deepEqual(px.slice(0, 3), [0, 0, 0], 'screen should be fully black while blinking');
  assert.equal(during.scp173[0].visible, false);
  await sleep(600);
  const after = await state(page);
  assert.equal(after.blink.blinking, false);
  assert.ok(after.scp173[0].x < during.scp173[0].x - 20, `173 x ${during.scp173[0].x} -> ${after.scp173[0].x}`);
  assert.equal(after.scp173[0].frozen, true, 'seen again after the blink');
});

check('touch kills within 200ms', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => {
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 78, 72);
  });
  await sleep(200);
  assert.equal((await state(page)).mode, 'dead');
});

check('173 on the player position does not throw and kills', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => {
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 72, 72);
  });
  await sleep(200);
  assert.equal((await state(page)).mode, 'dead');
});

check('restart x3 is clean', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      window.__debug.setAim(Math.PI);
      window.__debug.place173(0, 76, 72);
    });
    await page.waitForFunction(() => window.__debug.state().mode === 'dead', null, { timeout: 2000 });
    const gen = (await state(page)).generation;
    await page.keyboard.press('Space');
    await page.waitForFunction((g) => window.__debug.state().generation > g, gen, { timeout: 2000 });
    await sleep(100);
    const s = await state(page);
    assert.equal(s.mode, 'playing');
    assert.ok(Math.abs(s.player.x - 72) < 1 && Math.abs(s.player.y - 72) < 1, `player ${JSON.stringify(s.player)}`);
    assert.ok(s.blink.gauge < 0.2, `gauge ${s.blink.gauge}`);
    assert.equal(s.scp173.length, 1);
  }
  const a = await state(page);
  await page.keyboard.down('d');
  await sleep(1000);
  await page.keyboard.up('d');
  const b = await state(page);
  const dx = b.player.x - a.player.x;
  assert.ok(dx >= 36 && dx <= 60, `walked ${dx}px in 1s`);
});

const radioLines = async () => (await import('../../src/logic/radio.js')).RADIO_LINES;
const resetRadio = (page) => page.evaluate(() => window.__debug.resetRadio());
// The OPEN_ROOM exit door 'X' is tile (17,7) -> center (280,120); (264,120) is 16px from it.
const EXIT_SPOT = [264, 120];

check('start line is shown at scene start', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRoom(page, baseUrl);
  await sleep(150);
  assert.equal((await state(page)).radio, lines.start);
});

check('seen173 line appears the first time a 173 is observed', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRoom(page, baseUrl);
  await resetRadio(page);
  await page.evaluate(() => {
    window.__debug.setAim(0);
    window.__debug.place173(0, 168, 72);
  });
  await sleep(150);
  assert.equal((await state(page)).radio, lines.seen173);
});

check('blinkWarning line appears when the gauge passes 0.8', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRoom(page, baseUrl);
  await resetRadio(page);
  await page.evaluate(() => {
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 280, 130);
    window.__debug.setBlinkGauge(0.85);
  });
  await sleep(100);
  assert.equal((await state(page)).radio, lines.blinkWarning);
});

check('walking onto the key picks it up and shows the gotKey line', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRoom(page, baseUrl);
  await resetRadio(page);
  assert.equal((await state(page)).hasKey, false);
  await page.evaluate(() => window.__debug.teleportPlayer(30, 24)); // key 'K' is tile (1,1) -> center (24,24)
  await sleep(100);
  const s = await state(page);
  assert.equal(s.hasKey, true);
  assert.equal(s.radio, lines.gotKey);
});

check('E far from the exit does nothing', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await resetRadio(page);
  await page.evaluate(() => window.__debug.teleportPlayer(72, 72));
  await page.keyboard.press('e');
  await sleep(100);
  const s = await state(page);
  assert.equal(s.radio, null);
  assert.equal(s.mode, 'playing');
});

check('E at the exit without key shows the noKey line and stays playing', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRoom(page, baseUrl);
  await resetRadio(page);
  await page.evaluate(([x, y]) => window.__debug.teleportPlayer(x, y), EXIT_SPOT);
  await page.keyboard.press('e');
  await sleep(100);
  const s = await state(page);
  assert.equal(s.radio, lines.noKey);
  assert.equal(s.mode, 'playing');
  assert.equal(s.exitSolid, true);
});

check('E at the exit with key escapes, opens the exit, and Space restarts cleanly', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await resetRadio(page);
  await page.evaluate(([x, y]) => {
    window.__debug.giveKey();
    window.__debug.teleportPlayer(x, y);
  }, EXIT_SPOT);
  assert.equal((await state(page)).exitSolid, true);
  await page.keyboard.press('e');
  await sleep(100);
  const done = await state(page);
  assert.equal(done.mode, 'escaped');
  assert.equal(done.exitSolid, false);
  await page.keyboard.press('Space');
  await page.waitForFunction((g) => window.__debug.state().generation > g, done.generation, { timeout: 2000 });
  await sleep(100);
  const again = await state(page);
  assert.equal(again.mode, 'playing');
  assert.equal(again.hasKey, false);
  assert.equal(again.exitSolid, true);
});

check('the killer is visible on the death screen', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  // y=40 keeps the player (and 173) well clear of the centred death banner, which is drawn at screen y~135.
  await page.evaluate(() => {
    window.__debug.teleportPlayer(72, 40);
    window.__debug.setAim(Math.PI); // looking away, so the 173 is unobserved and free to close in
    window.__debug.place173(0, 84, 40);
  });
  await page.waitForFunction(() => window.__debug.state().mode === 'dead', null, { timeout: 2000 });
  await sleep(50);
  const s = await state(page);
  // 173 body is a 10px square centred ~78px; x=80 is outside the player circle (r=5 around 72).
  const px = await pixel(page, Math.round(80 - s.camera.scrollX), Math.round(40 - s.camera.scrollY));
  assert.ok(px[0] > 150, `173 pixel r=${px[0]}; it should be drawn above the fog when it kills`);
});

check('mouse aim: facing follows the pointer and stays finite off-canvas', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  await page.evaluate(() => window.__debug.teleportPlayer(72, 72));
  await sleep(100);
  const s0 = await state(page);
  const rect = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const gameToPage = (gx, gy) => [rect.left + (gx * rect.width) / 480, rect.top + (gy * rect.height) / 270];
  const px = s0.player.x - s0.camera.scrollX;
  const py = s0.player.y - s0.camera.scrollY;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const cases = [
    [px, py + 60, Math.PI / 2],
    [px - 60, py, Math.PI],
    [px + 40, py + 40, Math.PI / 4],
    [px + 50, py - 50, -Math.PI / 4],
  ];
  for (const [gx, gy, expected] of cases) {
    await page.mouse.move(...gameToPage(gx, gy));
    await sleep(100);
    const { facing } = await state(page);
    assert.ok(Math.abs(wrap(facing - expected)) < 0.05, `pointer (${gx},${gy}) -> facing ${facing}, expected ${expected}`);
  }
  await page.mouse.move(-400, -400);
  await sleep(100);
  assert.ok(Number.isFinite((await state(page)).facing), 'facing must stay finite with the pointer off-canvas');
});

check('seeded boot loads the tutorial zone', async (page, baseUrl) => {
  await openRun(page, baseUrl, 1234);
  const s = await state(page);
  assert.deepEqual([s.run.seed, s.run.zone, s.run.attempt], [1234, 0, 0]);
  assert.equal(s.map.cardKey, null);
  assert.equal(s.scp173.length, 1);
  assert.equal(s.zoneLabel, '구역 1/4');
  assert.equal(s.activation, 'sighting');
  assert.equal(s.zone.usedFallback, false);
});

check('the same seed gives the same zone', async (page, baseUrl) => {
  await openRun(page, baseUrl, 555);
  const a = (await state(page)).map;
  await openRun(page, baseUrl, 555);
  const b = (await state(page)).map;
  assert.deepEqual([b.hash, b.playerStart, b.exit], [a.hash, a.playerStart, a.exit]);
  await openRun(page, baseUrl, 556);
  assert.notEqual((await state(page)).map.hash, a.hash);
});

check('startRun on the key zone shows a card key and radius activation', async (page, baseUrl) => {
  const { keyZone } = await import('../../src/logic/run.js');
  await openRun(page, baseUrl, 777);
  const z = keyZone(777);
  await startRun(page, { seed: 777, zone: z, attempt: 0, hasKey: false, heard: [] });
  const s = await state(page);
  assert.equal(s.run.zone, z);
  assert.ok(s.map.cardKey, 'the key zone must have a card key');
  assert.equal(s.activation, 'radius');
  assert.equal(s.zoneLabel, `구역 ${z + 1}/4`);
  assert.equal(s.scp173.length >= 1, true);
});

check('sighting 173 sleeps until seen, then hunts', async (page, baseUrl) => {
  await openRoom(page, baseUrl, { activation: { kind: 'sighting' } });
  await page.evaluate(() => {
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 168, 72);
  });
  await sleep(600);
  let s = await state(page);
  assert.deepEqual([s.scp173[0].x, s.scp173[0].awake, s.scp173[0].frozen], [168, false, true], 'dormant before first sight');
  await page.evaluate(() => window.__debug.setAim(0));
  await sleep(150);
  assert.equal((await state(page)).scp173[0].awake, true, 'seeing it wakes it');
  await page.evaluate(() => window.__debug.setAim(Math.PI));
  await sleep(300);
  s = await state(page);
  assert.ok(s.scp173[0].x < 158, `awake 173 should chase, x ${s.scp173[0].x}`);
});

check('radius 173 ignores a player beyond 14 tiles and chases inside', async (page, baseUrl) => {
  await openRoom(page, baseUrl, { activation: { kind: 'radius', tiles: 14 } });
  await page.evaluate(() => {
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 296, 24); // tile (18,1): 17 path tiles from the player's tile (4,4)
  });
  await sleep(500);
  let s = await state(page);
  assert.deepEqual([s.scp173[0].x, s.scp173[0].y], [296, 24], 'beyond 14 tiles it waits');
  await page.evaluate(() => window.__debug.place173(0, 200, 72)); // tile (12,4): 8 path tiles
  await sleep(300);
  s = await state(page);
  assert.ok(s.scp173[0].x < 190, `inside 14 tiles it chases, x ${s.scp173[0].x}`);
});

check('legacy rows mode still has no run and the v0.1 exit rules', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  const s = await state(page);
  assert.equal(s.run, null);
  assert.equal(s.activation, 'always');
  assert.equal(s.zoneLabel, null);
  assert.equal(s.zone, null);
  assert.equal(s.exitSolid, true);
});

const tileMid = (t) => ({ x: t.tx * 16 + 8, y: t.ty * 16 + 8 });
const savedRun = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gaze.run.v1') ?? 'null'));
const waitZone = (page, zone, timeout = 3000) =>
  page.waitForFunction((z) => { const s = window.__debug.state(); return s.run?.zone === z && s.mode === 'playing'; }, zone, { timeout });
const waitNextScene = async (page, gen) => page.waitForFunction((g) => window.__debug.state().generation > g, gen, { timeout: 3000 });
// Kill the player with a 173 placed on top of them while looking away (radius zones: path 0 <= 14 tiles).
async function dieHere(page) {
  await page.evaluate(() => {
    const { x, y } = window.__debug.state().player;
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, x, y);
  });
  await page.waitForFunction(() => window.__debug.state().mode === 'dead', null, { timeout: 2000 });
}
async function respawn(page) {
  const gen = (await state(page)).generation;
  await page.keyboard.press('Space');
  await waitNextScene(page, gen);
  await sleep(100);
}

check('the gate moves exactly one zone, saves it, and ignores re-entry during the fade', async (page, baseUrl) => {
  await openRun(page, baseUrl, 1234);
  const s0 = await state(page);
  const gate = tileMid(s0.map.exit);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), gate);
  await sleep(100);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), gate);
  await waitZone(page, 1);
  await sleep(700);
  const s1 = await state(page);
  assert.deepEqual([s1.run.zone, s1.run.attempt, s1.run.seed], [1, 0, 1234]);
  assert.equal((await savedRun(page)).zone, 1);
});

check('death restarts the same zone with attempt+1, a different layout, at the entrance', async (page, baseUrl) => {
  await openRun(page, baseUrl, 2222);
  await startRun(page, { seed: 2222, zone: 1, attempt: 0, hasKey: false, heard: [] });
  const before = await state(page);
  await dieHere(page);
  await respawn(page);
  const after = await state(page);
  assert.deepEqual([after.run.zone, after.run.attempt, after.mode], [1, 1, 'playing']);
  assert.notEqual(after.map.hash, before.map.hash);
  assert.ok(Math.hypot(after.player.x - after.map.playerStart.x, after.player.y - after.map.playerStart.y) < 1);
  assert.equal((await savedRun(page)).attempt, 1);
});

check('the card key survives a zone transition but is lost if you die before leaving its zone', async (page, baseUrl) => {
  const { keyZone } = await import('../../src/logic/run.js');
  const seed = 9001;
  const k = keyZone(seed);
  await openRun(page, baseUrl, seed);
  await startRun(page, { seed, zone: k, attempt: 0, hasKey: false, heard: [] });
  const grabKey = async () => {
    const s = await state(page);
    await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), s.map.cardKey);
    await page.waitForFunction(() => window.__debug.state().hasKey, null, { timeout: 2000 });
  };
  await grabKey();
  await dieHere(page);
  await respawn(page);
  assert.equal((await state(page)).hasKey, false, 'dying in the key zone loses the key');
  await grabKey();
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await waitZone(page, k + 1);
  let s = await state(page);
  assert.deepEqual([s.hasKey, s.run.hasKey], [true, true], 'carried into the next zone');
  await dieHere(page);
  await respawn(page);
  s = await state(page);
  assert.deepEqual([s.run.zone, s.hasKey], [k + 1, true], 'kept after dying in a later zone');
});

check('heard radio lines are not repeated after dying', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRun(page, baseUrl, 3141);
  await startRun(page, { seed: 3141, zone: 1, attempt: 0, hasKey: false, heard: [] });
  await sleep(150);
  assert.equal((await state(page)).radio, lines.start);
  await dieHere(page);
  await respawn(page);
  const s = await state(page);
  assert.ok(s.run.heard.includes('start'), `heard ${s.run.heard}`);
  assert.equal(s.radio, null);
});

check('reloading without ?seed resumes the checkpoint', async (page, baseUrl) => {
  await openRun(page, baseUrl, 3333);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await waitZone(page, 1);
  const before = await state(page);
  await page.goto(`${baseUrl}/index.html?debug=1`);
  await page.waitForFunction(() => window.__debug?.state().run, null, { timeout: 5000 });
  const after = await state(page);
  assert.deepEqual([after.run.seed, after.run.zone, after.run.attempt], [3333, 1, 0]);
  assert.equal(after.map.hash, before.map.hash);
});

check('escaping starts a fresh run and clears the old checkpoint', async (page, baseUrl) => {
  await openRun(page, baseUrl, 4444);
  await startRun(page, { seed: 4444, zone: 3, attempt: 0, hasKey: true, heard: [] });
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__debug.state().mode === 'escaped', null, { timeout: 2000 });
  await respawn(page);
  const s = await state(page);
  assert.deepEqual([s.run.zone, s.run.attempt, s.mode], [0, 0, 'playing']);
  assert.notEqual(s.run.seed, 4444);
  assert.equal((await savedRun(page)).seed, s.run.seed);
});

check('a 173 touching in the gate frame kills instead of advancing', async (page, baseUrl) => {
  await openRun(page, baseUrl, 5555);
  await startRun(page, { seed: 5555, zone: 2, attempt: 0, hasKey: false, heard: [] }); // zone 1 holds the key (locked gate)
  const gate = tileMid((await state(page)).map.exit);
  await page.evaluate(({ x, y }) => {
    window.__debug.setAim(Math.PI);
    window.__debug.teleportPlayer(x, y);
    window.__debug.place173(0, x, y);
  }, gate);
  await sleep(800);
  const s = await state(page);
  assert.deepEqual([s.mode, s.run.zone], ['dead', 2]);
});

check('Space and E during the fade do nothing', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRun(page, baseUrl, 6666);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await page.waitForFunction(() => window.__debug.state().mode === 'transition', null, { timeout: 2000 });
  await page.keyboard.press('Space');
  await page.keyboard.press('e');
  await waitZone(page, 1);
  await sleep(600);
  const s = await state(page);
  assert.deepEqual([s.run.zone, s.run.attempt], [1, 0]);
  assert.notEqual(s.radio, lines.noKey);
});

check('a single R does not erase progress; a second R within 3s starts a new run', async (page, baseUrl) => {
  await openRun(page, baseUrl, 7777);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await waitZone(page, 1);
  const gen = (await state(page)).generation;
  await page.keyboard.press('r');
  await sleep(150);
  let s = await state(page);
  assert.deepEqual([s.run.seed, s.run.zone, s.rArmed, s.generation], [7777, 1, true, gen], 'one R only arms');
  assert.equal((await savedRun(page)).zone, 1);
  await page.keyboard.press('r');
  await waitNextScene(page, gen);
  await sleep(100);
  s = await state(page);
  assert.deepEqual([s.run.zone, s.run.attempt, s.rArmed], [0, 0, false]);
  assert.notEqual(s.run.seed, 7777);
  assert.equal((await savedRun(page)).seed, s.run.seed);
});

check('R in legacy rows mode does nothing', async (page, baseUrl) => {
  await openRoom(page, baseUrl);
  const gen = (await state(page)).generation;
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  await sleep(200);
  const s = await state(page);
  assert.deepEqual([s.run, s.rArmed, s.generation], [null, false, gen]);
});

check('garbage ?seed values fall back to a valid run without errors', async (page, baseUrl) => {
  for (const bad of ['abc', '-5', '1e9', '99999999999', '', '12.5']) {
    await page.goto(`${baseUrl}/index.html?debug=1`);
    await page.waitForFunction(() => window.__debug, null, { timeout: 5000 });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${baseUrl}/index.html?debug=1&seed=${encodeURIComponent(bad)}`);
    await page.waitForFunction(() => window.__debug?.state().run, null, { timeout: 5000 });
    const { run } = await state(page);
    assert.ok(Number.isInteger(run.seed) && run.seed >= 0 && run.seed <= 4294967295, `seed=${bad} -> ${run.seed}`);
    assert.equal(run.zone, 0);
  }
});

check('the game plays with localStorage unavailable', async (page, baseUrl) => {
  const ctx = await page.context().browser().newContext({ viewport: { width: 960, height: 540 } });
  const errors = [];
  try {
    const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    p.on('pageerror', (e) => errors.push(e.message));
    await p.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await p.goto(`${baseUrl}/index.html?debug=1&seed=8888`);
    await p.waitForFunction(() => window.__debug?.state().run?.seed === 8888, null, { timeout: 5000 });
    const st = () => p.evaluate(() => window.__debug.state());
    const x0 = (await st()).player.x;
    await p.keyboard.down('d');
    await sleep(300);
    await p.keyboard.up('d');
    assert.notEqual((await st()).player.x, x0, 'the player can move');
    await p.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await st()).map.exit));
    await p.waitForFunction(() => window.__debug.state().run.zone === 1 && window.__debug.state().mode === 'playing', null, { timeout: 3000 });
    await p.evaluate(() => {
      const { x, y } = window.__debug.state().player;
      window.__debug.setAim(Math.PI);
      window.__debug.place173(0, x, y);
    });
    await p.waitForFunction(() => window.__debug.state().mode === 'dead', null, { timeout: 2000 });
    await p.keyboard.press('Space');
    await p.waitForFunction(() => window.__debug.state().run.attempt === 1, null, { timeout: 3000 });
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
  }
});

check('M toggles the debug view with the seed, zone, and attempt text', async (page, baseUrl) => {
  await openRun(page, baseUrl, 9999);
  await page.keyboard.press('m');
  await sleep(100);
  let s = await state(page);
  assert.deepEqual([s.debugView, s.debugText], [true, '시드 9999 · 구역 1/4 · 시도 0']);
  await page.keyboard.press('m');
  await sleep(100);
  s = await state(page);
  assert.equal(s.debugView, false);
});

// Park every 173 inside the border wall corner: no path, so it can neither chase nor block the test.
const park173s = (page) =>
  page.evaluate(() => window.__debug.state().scp173.forEach((_, i) => window.__debug.place173(i, 8, 8)));

check('holding R (key repeat) does not start a new run', async (page, baseUrl) => {
  await openRun(page, baseUrl, 4242);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await waitZone(page, 1);
  const gen = (await state(page)).generation;
  await page.keyboard.down('r');
  await sleep(60);
  await page.keyboard.down('r'); // auto-repeat
  await sleep(60);
  await page.keyboard.down('r'); // auto-repeat
  await page.keyboard.up('r');
  await sleep(300);
  const s = await state(page);
  assert.deepEqual([s.run.seed, s.run.zone, s.generation], [4242, 1, gen]);
});

check('the key zone gate stays locked until the card key is picked up', async (page, baseUrl) => {
  const { keyZone } = await import('../../src/logic/run.js');
  const seed = 777;
  const k = keyZone(seed);
  await openRun(page, baseUrl, seed);
  await startRun(page, { seed, zone: k, attempt: 0, hasKey: false, heard: [] });
  await park173s(page);
  let s = await state(page);
  assert.equal(s.exitSolid, true, 'locked before the key');
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid(s.map.exit));
  await sleep(800);
  s = await state(page);
  assert.deepEqual([s.run.zone, s.mode], [k, 'playing'], 'a locked gate does not move you on');
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), s.map.cardKey);
  await page.waitForFunction(() => window.__debug.state().hasKey, null, { timeout: 2000 });
  assert.equal((await state(page)).exitSolid, false, 'picking up the key opens the gate');
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid(s.map.exit));
  await waitZone(page, k + 1);
});

check('reloading a ?seed= link keeps the checkpoint (the seed is consumed from the URL)', async (page, baseUrl) => {
  await openRun(page, baseUrl, 31337);
  assert.ok(!new URL(page.url()).searchParams.has('seed'), `url still has the seed: ${page.url()}`);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await waitZone(page, 1);
  await page.reload();
  await page.waitForFunction(() => window.__debug?.state().run, null, { timeout: 5000 });
  const s = await state(page);
  assert.deepEqual([s.run.seed, s.run.zone], [31337, 1]);
});

check('a reload during the gate fade resumes in the next zone', async (page, baseUrl) => {
  await openRun(page, baseUrl, 2468);
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await page.waitForFunction(() => window.__debug.state().mode === 'transition', null, { timeout: 2000 });
  await page.goto(`${baseUrl}/index.html?debug=1`);
  await page.waitForFunction(() => window.__debug?.state().run, null, { timeout: 5000 });
  assert.deepEqual([(await state(page)).run.seed, (await state(page)).run.zone], [2468, 1]);
});

(async () => {
  let failed = 0;
  const only = process.env.SMOKE_ONLY;
  await withPage(async (page, baseUrl, errors) => {
    for (const { name, fn } of checks) {
      if (only && !name.includes(only)) continue; // SMOKE_ONLY=<substring> runs a subset
      try {
        await fn(page, baseUrl);
        console.log(`PASS ${name}`);
      } catch (e) {
        failed++;
        console.log(`FAIL ${name} - ${e.message.split('\n')[0]}`);
      }
    }
    if (errors.length) {
      failed++;
      console.log(`FAIL console errors:\n${errors.join('\n')}`);
    }
  });
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
