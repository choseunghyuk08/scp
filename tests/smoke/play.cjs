const assert = require('node:assert/strict');
const { withPage } = require('./helpers.cjs');

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
