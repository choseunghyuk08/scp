import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const SCAN = ['src', 'tests', 'index.html', 'package.json', 'README.md'];
// Built from pieces so this file does not match itself.
const MACHINE_PATHS = ['/tmp/' + 'claude-', '/home/' + 'user/'];

function* files(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) yield* files(join(path, name));
  } else {
    yield path;
  }
}

test('no machine-specific absolute paths are committed', () => {
  const offenders = [];
  for (const entry of SCAN) {
    for (const file of files(join(root, entry))) {
      const text = readFileSync(file, 'utf8');
      for (const bad of MACHINE_PATHS) if (text.includes(bad)) offenders.push(`${file}: ${bad}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the smoke suite dependency is declared and pinned', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(pkg.devDependencies?.playwright ?? '', /^\d+\.\d+\.\d+$/, 'playwright must be a pinned devDependency');
});
