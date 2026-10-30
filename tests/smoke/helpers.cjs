const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`static server did not start: ${url}`);
}

/**
 * Serves the repo root, opens chromium, and calls run(page, baseUrl, errors).
 * `errors` collects console.error and uncaught page errors for the whole run.
 */
async function withPage(run) {
  const root = path.resolve(__dirname, '..', '..');
  const port = await freePort();
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const errors = [];
  let browser;
  try {
    await waitForServer(`${baseUrl}/`);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await run(page, baseUrl, errors);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

module.exports = { withPage };
