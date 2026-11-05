const assert = require('node:assert/strict');
const { withPage } = require('./helpers.cjs');
const { OPEN_ROOM, DOOR_ROOM, SIDE_ROOM } = require('./rooms.cjs');

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

async function openRoom(page, baseUrl, extra = {}, rows = OPEN_ROOM) {
  await page.goto(`${baseUrl}/index.html?debug=1`);
  await page.waitForFunction(() => window.__debug, null, { timeout: 5000 });
  const gen = await page.evaluate(() => window.__debug.state().generation);
  await page.evaluate(([r, more]) => window.__debug.loadRows(r, more), [rows, extra]);
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

// ---- v0.3 doors (DOOR_ROOM: wall at x=23, door tiles (23,4) and (23,5), door centre (376,80)) ----

const doorState = async (page) => (await state(page)).doors[0].state;
const pressE = async (page) => {
  await page.keyboard.press('e');
  await sleep(60);
};
// A dormant 173 (sighting mode) stays put until seen, so it can stand in a doorway or behind a door.
const SLEEPY = { activation: { kind: 'sighting' } };

check('E cycles the nearest door open -> closed -> locked -> open', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await page.evaluate(() => window.__debug.teleportPlayer(360, 72));
  const seen = [await doorState(page)];
  for (let i = 0; i < 3; i++) {
    await pressE(page);
    seen.push(await doorState(page));
  }
  assert.deepEqual(seen, ['open', 'closed', 'locked', 'open']);
});

check('a closed door blocks walking and sight', async (page, baseUrl) => {
  await openRoom(page, baseUrl, SLEEPY, DOOR_ROOM);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(340, 72);
    window.__debug.setAim(0);
    window.__debug.setDoor(0, 'closed');
    window.__debug.place173(0, 440, 72);
  });
  await sleep(150);
  assert.equal((await state(page)).scp173[0].visible, false, 'a 173 behind a closed door is not seen');
  await page.keyboard.down('d');
  await sleep(500);
  await page.keyboard.up('d');
  const x = (await state(page)).player.x;
  assert.ok(x <= 23 * 16 - 5 + 0.01, `walked into the closed door: x ${x}`);
  await page.evaluate(() => window.__debug.setDoor(0, 'open'));
  await sleep(150);
  assert.equal((await state(page)).scp173[0].visible, true, 'the same 173 is seen once the door opens');
});

check('a door does not close while the player stands in it', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await page.evaluate(() => window.__debug.teleportPlayer(376, 72));
  await pressE(page);
  assert.equal(await doorState(page), 'open');
});

check('a door does not close while a 173 stands in it', async (page, baseUrl) => {
  await openRoom(page, baseUrl, SLEEPY, DOOR_ROOM);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(360, 72);
    window.__debug.setAim(Math.PI);
    window.__debug.place173(0, 376, 88);
  });
  await pressE(page);
  assert.equal(await doorState(page), 'open');
});

check('a 173 opens a closed door and walks through', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(100, 72);
    window.__debug.setAim(Math.PI);
    window.__debug.setDoor(0, 'closed');
    window.__debug.place173(0, 440, 72);
  });
  await page.waitForFunction(
    () => {
      const s = window.__debug.state();
      return s.doors[0].state === 'open' && s.scp173[0].x < 23 * 16;
    },
    null,
    { timeout: 4000 },
  );
});

// 12x5: a 1-tile door at (9,2) and the final exit at (11,2); standing at (168,40) both are 16px away.
const EXIT_BY_DOOR = ['############', '#@........K#', '#........D.X', '#..........#', '############'];

check('with the card key near the final exit, E opens the exit instead of a door', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, EXIT_BY_DOOR);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(168, 40);
    window.__debug.giveKey();
  });
  await pressE(page);
  const s = await state(page);
  assert.deepEqual([s.mode, s.doors[0].state], ['escaped', 'open']);
});

check('without the card key the same E closes the door instead', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, EXIT_BY_DOOR);
  await page.evaluate(() => window.__debug.teleportPlayer(168, 40));
  await pressE(page);
  const s = await state(page);
  assert.deepEqual([s.mode, s.doors[0].state], ['playing', 'closed']);
});

// ---- v0.3 SCP-096 (DOOR_ROOM: 096 at (488,72) facing right; door centre (376,80); door tiles x 368..384) ----

const s096 = async (page) => (await state(page)).scp096[0];
const waitFor = (page, fn, arg, timeout = 3000) => page.waitForFunction(fn, arg, { timeout });
const nowS = () => performance.now() / 1000;

/** Rage the 096 at a closed or locked door with the player out of reach on the left; returns break timings. */
async function rageAtDoor(page, doorStateName, playerX = 200) {
  await page.evaluate(
    ([st, x]) => {
      window.__debug.teleportPlayer(x, 72);
      window.__debug.setAim(Math.PI);
      window.__debug.setDoor(0, st);
      window.__debug.rage096(0);
    },
    [doorStateName, playerX],
  );
  await waitFor(page, () => window.__debug.state().scp096[0].breaking !== null);
  const m = await s096(page);
  // It breaks from the tile in front of the door (tile 24, centre 392), never from where it stood.
  assert.ok(Math.abs(m.x - 392) < 1 && Math.abs(m.y - 72) < 1, `breaking from (${m.x}, ${m.y})`);
  return { startLeft: m.breaking, startedAt: nowS() };
}

check('seeing the 096 face from the front starts the rage; from behind it stays idle', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(440, 72); // behind it: the 096 faces right, away from the player
    window.__debug.setAim(0);
  });
  await sleep(300);
  const behind = await s096(page);
  assert.deepEqual([behind.visible, behind.mode], [true, 'idle']);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(560, 72); // in front of it, looking back at its face
    window.__debug.setAim(Math.PI);
  });
  await waitFor(page, () => window.__debug.state().scp096[0].mode === 'rage', null, 1000);
});

check('a 096 face behind a closed door is not seen', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(340, 72);
    window.__debug.setAim(0);
    window.__debug.setDoor(0, 'closed');
    window.__debug.place096(0, 440, 72, Math.PI);
  });
  await sleep(300);
  const shut = await s096(page);
  assert.deepEqual([shut.visible, shut.mode], [false, 'idle']);
  await page.evaluate(() => window.__debug.setDoor(0, 'open'));
  await waitFor(page, () => window.__debug.state().scp096[0].mode === 'rage', null, 1000);
});

check('a raging 096 waits ~3s at a closed door and ~6s at a locked door, then the door is broken', async (page, baseUrl) => {
  for (const [st, secs] of [['closed', 3], ['locked', 6]]) {
    await openRoom(page, baseUrl, {}, DOOR_ROOM);
    const { startLeft, startedAt } = await rageAtDoor(page, st);
    assert.ok(startLeft > secs - 0.1 && startLeft <= secs, `${st}: breaking starts at ${startLeft}`);
    await sleep((secs - 1) * 1000);
    assert.equal((await state(page)).doors[0].broken, false, `${st}: broken too early`);
    await waitFor(page, () => window.__debug.state().doors[0].broken, null, 2500);
    const took = nowS() - startedAt;
    assert.ok(took >= secs - 0.6 && took <= secs + 1.2, `${st}: broke after ${took.toFixed(2)}s`);
    assert.equal((await state(page)).doors[0].state, 'open');
  }
});

check('broken doors ignore E', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await rageAtDoor(page, 'closed');
  await waitFor(page, () => window.__debug.state().doors[0].broken, null, 4500);
  await page.evaluate(() => {
    window.__debug.place096(0, 488, 72, 0); // seated again, so it cannot interfere
    window.__debug.teleportPlayer(360, 72);
  });
  await pressE(page);
  await pressE(page);
  const d = (await state(page)).doors[0];
  assert.deepEqual([d.state, d.broken], ['open', true]);
});

check('getting 20 path tiles away from a locked door calms the 096 and it walks home', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await rageAtDoor(page, 'locked', 340);
  await sleep(1000);
  assert.equal((await s096(page)).mode, 'rage', 'still raging while the player is 3 tiles from the door');
  await page.evaluate(() => window.__debug.teleportPlayer(24, 120)); // tile (1,7): 25 path tiles from the door
  await waitFor(page, () => window.__debug.state().scp096[0].mode === 'returning', null, 1000);
  await waitFor(page, () => window.__debug.state().scp096[0].mode === 'idle', null, 5000);
  const home = await s096(page);
  assert.deepEqual([home.x, home.y, home.facing], [488, 72, 0]);
  assert.equal((await state(page)).doors[0].state, 'locked', 'calming leaves the locked door unbroken');
});

check('a raging 096 kills on touch; an idle one does not', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(480, 72);
    window.__debug.setAim(0);
    window.__debug.place096(0, 486, 72, 0); // 6px away, facing away from the player
  });
  await sleep(300);
  assert.deepEqual([(await state(page)).mode, (await s096(page)).mode], ['playing', 'idle']);
  await page.evaluate(() => window.__debug.rage096(0));
  await waitFor(page, () => window.__debug.state().mode === 'dead', null, 1000);
});

check('the near096 radio line plays once when first within 12 path tiles', async (page, baseUrl) => {
  const lines = await radioLines();
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await resetRadio(page);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(100, 72); // tile (6,4): 24 path tiles from the 096
    window.__debug.setAim(Math.PI);
  });
  await sleep(200);
  assert.equal((await state(page)).radio, null);
  await page.evaluate(() => window.__debug.teleportPlayer(312, 72)); // tile (19,4): 11 path tiles
  await sleep(150);
  assert.equal((await state(page)).radio, lines.near096);
  await page.evaluate(() => window.__debug.teleportPlayer(100, 72));
  await waitFor(page, () => window.__debug.state().radio === null, null, 5000);
  await sleep(150);
  await page.evaluate(() => window.__debug.teleportPlayer(312, 72));
  await sleep(150);
  assert.equal((await state(page)).radio, null, 'near096 played a second time');
});

const ZONE096_SEED = 4242;
const seated = (s) => s.scp096.every((m, i) => m.mode === 'idle' && m.x === s.map.spawns096[i].pos.x && m.y === s.map.spawns096[i].pos.y && m.facing === s.map.spawns096[i].facing);

check('a raging 096 is gone (seated again) after the next zone loads', async (page, baseUrl) => {
  await openRun(page, baseUrl, ZONE096_SEED);
  await startRun(page, { seed: ZONE096_SEED, zone: 2, attempt: 0, hasKey: true, heard: [] });
  const before = await state(page);
  assert.equal(before.scp096.length, 1);
  await page.evaluate(() => window.__debug.rage096(0));
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid(before.map.exit));
  await waitZone(page, 3);
  const after = await state(page);
  assert.equal(after.scp096.length, 1);
  assert.ok(seated(after), JSON.stringify(after.scp096));
});

check('dying during a rage restarts the zone with the 096 seated and all doors open', async (page, baseUrl) => {
  await openRun(page, baseUrl, ZONE096_SEED);
  await startRun(page, { seed: ZONE096_SEED, zone: 2, attempt: 0, hasKey: true, heard: [] });
  const first = await state(page);
  assert.ok(first.doors.length > 0, 'zone 3 has doors');
  await page.evaluate(() => {
    window.__debug.rage096(0);
    window.__debug.setDoor(0, 'locked');
  });
  await dieHere(page);
  await respawn(page);
  const s = await state(page);
  assert.equal(s.run.attempt, 1);
  assert.ok(seated(s), JSON.stringify(s.scp096));
  assert.ok(s.doors.every((d) => d.state === 'open' && !d.broken), JSON.stringify(s.doors));
});

check('173 and 096 in view together: 173 freezes and 096 rages', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, DOOR_ROOM);
  await page.evaluate(() => {
    window.__debug.teleportPlayer(420, 72);
    window.__debug.setAim(0);
    window.__debug.place173(0, 488, 100);
    window.__debug.place096(0, 488, 72, Math.PI);
  });
  await waitFor(page, () => window.__debug.state().scp096[0].mode === 'rage', null, 1000);
  const s = await state(page);
  assert.deepEqual([s.scp173[0].visible, s.scp173[0].frozen], [true, true]);
});

// ---- v0.4 side rooms (SIDE_ROOM: door tiles (23,4),(23,5) centre (376,80); side room x 24..38 centre (504,72)) ----

const instr = async () => import('../../src/logic/instructions.js');
const SIDE_LIE = SIDE_ROOM.map((row) => row.replace('a', ','));
const setRow = (rows, y, x, ch) => rows.map((row, i) => (i === y ? row.slice(0, x) + ch + row.slice(x + 1) : row));

check('the instruction plays once within 12 path tiles of the side-room door and names its direction', async (page, baseUrl) => {
  const { instructionLine, TRUE_RULES } = await instr();
  const ins = { truthful: true, item: 'eyedrops', rule: TRUE_RULES[0] };
  await openRoom(page, baseUrl, { instruction: ins }, SIDE_ROOM);
  await resetRadio(page);
  await sleep(200);
  assert.deepEqual([(await state(page)).radio, (await state(page)).instruction.told], [null, false]);
  await page.evaluate(() => window.__debug.teleportPlayer(200, 72)); // tile (12,4): 11 path tiles from the door
  await sleep(150);
  assert.equal((await state(page)).radio, instructionLine(ins, 'E'));
  await page.evaluate(() => window.__debug.teleportPlayer(72, 72));
  await waitFor(page, () => window.__debug.state().radio === null, null, 5000);
  await page.evaluate(() => window.__debug.teleportPlayer(200, 72));
  await sleep(150);
  assert.equal((await state(page)).radio, null, 'the instruction played twice');
});

check('a side room next to the entrance tells right after the start line', async (page, baseUrl) => {
  const lines = await radioLines();
  const { instructionLine, TRUE_RULES } = await instr();
  const ins = { truthful: true, item: 'eyedrops', rule: TRUE_RULES[1] };
  const rows = setRow(setRow(SIDE_ROOM, 4, 4, '.'), 4, 20, '@');
  await openRoom(page, baseUrl, { instruction: ins }, rows);
  await sleep(150);
  const s = await state(page);
  assert.deepEqual([s.radio, s.instruction.told], [lines.start, true]);
  await waitFor(page, (text) => window.__debug.state().radio === text, instructionLine(ins, 'E'), 5000);
});

check('walking into a true side room picks up the item and counts as followed', async (page, baseUrl) => {
  const { TRUE_RULES } = await instr();
  await openRoom(page, baseUrl, { instruction: { truthful: true, item: 'eyedrops', rule: TRUE_RULES[0] } }, SIDE_ROOM);
  assert.deepEqual([(await state(page)).instruction.followed, (await state(page)).mapItems.length], [false, 1]);
  await page.evaluate(() => window.__debug.teleportPlayer(440, 72));
  await sleep(100);
  assert.equal((await state(page)).instruction.followed, true);
  await page.evaluate(() => window.__debug.teleportPlayer(486, 72));
  await sleep(100);
  const s = await state(page);
  assert.deepEqual([s.items, s.mapItems.length, s.trap], [{ eyedrops: 1, stim: 0 }, 0, null]);
});

check('Q empties the blink gauge and F fills stamina with no drain for 5s', async (page, baseUrl) => {
  await openRoom(page, baseUrl, {}, SIDE_ROOM);
  await page.evaluate(() => {
    window.__debug.giveItem('eyedrops');
    window.__debug.giveItem('stim');
    window.__debug.setBlinkGauge(0.7);
  });
  await page.keyboard.press('q');
  await sleep(60);
  let s = await state(page);
  assert.ok(s.blink.gauge < 0.1, `gauge ${s.blink.gauge}`);
  assert.deepEqual(s.items, { eyedrops: 0, stim: 1 });
  await page.keyboard.down('Shift');
  await page.keyboard.down('d');
  await sleep(2000);
  await page.keyboard.up('d');
  const drained = (await state(page)).stamina.value;
  assert.ok(drained < 0.7, `stamina ${drained}`);
  await page.keyboard.press('f');
  await sleep(60);
  s = await state(page);
  assert.deepEqual([s.stamina.value, s.items.stim], [1, 0]);
  assert.ok(s.stimLeft > 4.5, `stimLeft ${s.stimLeft}`);
  await page.keyboard.down('a');
  await sleep(1000);
  await page.keyboard.up('a');
  await page.keyboard.up('Shift');
  assert.equal((await state(page)).stamina.value, 1, 'running drained stamina during the stimulant');
});

check('a false side room locks its door for 8s, ignores E, blacks out, then opens', async (page, baseUrl) => {
  const { FALSE_RULES } = await instr();
  const lines = await radioLines();
  await openRoom(page, baseUrl, { instruction: { truthful: false, item: 'stim', rule: FALSE_RULES[0] } }, SIDE_LIE);
  await resetRadio(page);
  await page.evaluate(() => {
    window.__debug.setAim(0);
    window.__debug.teleportPlayer(440, 72);
  });
  await waitFor(page, () => Boolean(window.__debug.state().trap), null, 1000);
  let s = await state(page);
  assert.deepEqual([s.doors[0].state, s.trap.dark, s.mapItems.length], ['locked', true, 0]);
  const sx = Math.round(s.player.x - s.camera.scrollX);
  const sy = Math.round(s.player.y - s.camera.scrollY);
  const px = await pixel(page, sx + 60, sy);
  assert.ok(px[0] + px[1] + px[2] < 15, `not black during the blackout: ${px}`);
  await waitFor(page, (line) => window.__debug.state().radio === line, lines.trap, 5000);
  await page.evaluate(() => window.__debug.teleportPlayer(395, 72)); // inside, within reach of the door
  await pressE(page);
  assert.equal(await doorState(page), 'locked', 'E opened the trapped door');
  await waitFor(page, () => window.__debug.state().doors[0].state === 'open', null, 9000);
  s = await state(page);
  assert.equal(s.trap, null);
  await pressE(page);
  assert.equal(await doorState(page), 'closed', 'E works again after the trap');
});

check('the trap waits until nobody stands in the doorway', async (page, baseUrl) => {
  const { FALSE_RULES } = await instr();
  await openRoom(page, baseUrl, { instruction: { truthful: false, item: 'eyedrops', rule: FALSE_RULES[1] } }, SIDE_LIE);
  await page.evaluate(() => window.__debug.teleportPlayer(388, 72)); // in the side room, body still over the door
  await sleep(200);
  let s = await state(page);
  assert.deepEqual([s.instruction.followed, s.doors[0].state, s.trap], [true, 'open', null]);
  await page.evaluate(() => window.__debug.teleportPlayer(400, 72));
  await waitFor(page, () => window.__debug.state().doors[0].state === 'locked', null, 1000);
});

check('during the blackout an unseen 173 moves', async (page, baseUrl) => {
  const { FALSE_RULES } = await instr();
  await openRoom(page, baseUrl, { instruction: { truthful: false, item: 'stim', rule: FALSE_RULES[2] }, ...SLEEPY }, SIDE_LIE);
  await page.evaluate(() => {
    window.__debug.setAim(0);
    window.__debug.teleportPlayer(388, 72); // in the side room but over the door, so the trap waits
    window.__debug.place173(0, 500, 72);
  });
  await sleep(300);
  let s = await state(page);
  assert.deepEqual([s.trap, s.scp173[0].visible, s.scp173[0].x], [null, true, 500], 'seen and frozen before the trap');
  await page.evaluate(() => window.__debug.teleportPlayer(400, 72));
  await waitFor(page, () => Boolean(window.__debug.state().trap), null, 1000);
  await waitFor(page, () => window.__debug.state().scp173[0].x < 495, null, 1000);
});

check('dying during the trap restarts the zone with the door open and no trap', async (page, baseUrl) => {
  const { instructionPlan } = await instr();
  let seed = 1;
  while (instructionPlan(seed)[1].truthful) seed++;
  await openRun(page, baseUrl, seed);
  await startRun(page, { seed, zone: 1, attempt: 0, hasKey: true, heard: [] });
  const c = (await state(page)).sideRoom.center;
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), c);
  await waitFor(page, () => Boolean(window.__debug.state().trap), null, 1000);
  await dieHere(page);
  await respawn(page);
  const s = await state(page);
  assert.equal(s.run.attempt, 1);
  // (told may already be true again: the entrance can be within 12 path tiles of the side-room door)
  assert.deepEqual([s.trap, s.instruction.followed], [null, false]);
  assert.ok(s.doors.every((d) => d.state === 'open'), JSON.stringify(s.doors));
});

check('items and the outcome are saved at the gate; dying before the gate loses them', async (page, baseUrl) => {
  // Zone 1 (the tutorial's dormant 173 cannot kill): a seed whose zone-1 order is a true eye-drops one.
  const { instructionPlan } = await instr();
  let seed = 1;
  while (!(instructionPlan(seed)[1].truthful && instructionPlan(seed)[1].item === 'eyedrops')) seed++;
  await openRun(page, baseUrl, seed);
  await startRun(page, { seed, zone: 1, attempt: 0, hasKey: true, heard: [] });
  const toSide = async () => {
    const [{ pos }] = (await state(page)).mapItems;
    await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), pos);
    await waitFor(page, () => window.__debug.state().items.eyedrops === 1, null, 1000);
  };
  await toSide();
  await dieHere(page);
  await respawn(page);
  assert.deepEqual([(await state(page)).items, (await state(page)).instruction.followed], [{ eyedrops: 0, stim: 0 }, false]);
  await toSide();
  await page.evaluate(({ x, y }) => window.__debug.teleportPlayer(x, y), tileMid((await state(page)).map.exit));
  await waitZone(page, 2);
  const saved = await savedRun(page);
  assert.deepEqual([saved.outcomes, saved.items], [['none', 'followed'], { eyedrops: 1, stim: 0 }]);
  assert.deepEqual((await state(page)).items, { eyedrops: 1, stim: 0 });
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
