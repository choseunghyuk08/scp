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

async function openRoom(page, baseUrl) {
  await page.goto(`${baseUrl}/index.html?debug=1`);
  await page.waitForFunction(() => window.__debug, null, { timeout: 5000 });
  const gen = await page.evaluate(() => window.__debug.state().generation);
  await page.evaluate((rows) => window.__debug.loadRows(rows), OPEN_ROOM);
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
