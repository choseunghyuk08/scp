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

const SHOTS = '/tmp/claude-0/-home-user-scp/955084d6-4a55-567d-b184-1152704b6ca3/scratchpad';
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
  await page.screenshot({ path: `${SHOTS}/task9.png` });
  assert.ok(px[0] > behind[0] * 2, `inside r=${px[0]} behind r=${behind[0]}`);
});

(async () => {
  let failed = 0;
  await withPage(async (page, baseUrl, errors) => {
    for (const { name, fn } of checks) {
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
