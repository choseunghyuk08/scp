import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFrom } from '../helpers/grid.js';
import { VISION } from '../../src/config.js';
import { pointSolid, tileCenter } from '../../src/logic/grid.js';
import { inCone, hasLineOfSight, canSee, visibilityPolygon } from '../../src/logic/vision.js';

const O = { x: 0, y: 0 };
const cone = (facing, target) => inCone(O, facing, target, VISION.halfAngle, VISION.range);
const polar = (deg, dist) => ({ x: dist * Math.cos((deg * Math.PI) / 180), y: dist * Math.sin((deg * Math.PI) / 180) });

const openRows = Array.from({ length: 20 }, () => '.'.repeat(20));
const open = gridFrom(openRows);
const withWall = (tx, ty) => gridFrom(openRows.map((row, y) => (y === ty ? row.slice(0, tx) + '#' + row.slice(tx + 1) : row)));

test('target ahead within range is in cone', () => assert.ok(cone(0, { x: 64, y: 0 })));
test('target behind is not in cone', () => assert.ok(!cone(0, { x: -64, y: 0 })));
test('cone edge: 34deg in, 36deg out', () => {
  assert.ok(cone(0, polar(34, 64)));
  assert.ok(!cone(0, polar(36, 64)));
  assert.ok(cone(0, polar(-34, 64)));
  assert.ok(!cone(0, polar(-36, 64)));
});
test('range: 128px in, 129px out', () => {
  assert.ok(cone(0, { x: 128, y: 0 }));
  assert.ok(!cone(0, { x: 129, y: 0 }));
});
test('angle wrap across +-PI', () => assert.ok(cone(Math.PI - 0.1, { x: -64, y: -6 })));
test('target exactly at the origin is not in the cone and does not throw', () =>
  assert.equal(inCone({ x: 5, y: 5 }, 1, { x: 5, y: 5 }, VISION.halfAngle, VISION.range), false));

test('wall tile between blocks line of sight', () => {
  const a = tileCenter(5, 10);
  const b = tileCenter(11, 10);
  assert.equal(hasLineOfSight(open, a, b), true);
  assert.equal(hasLineOfSight(withWall(8, 10), a, b), false);
  assert.equal(hasLineOfSight(withWall(8, 10), a, a), true);
});

test('canSee needs both cone and line of sight', () => {
  const eye = tileCenter(5, 10);
  const ahead = tileCenter(11, 10);
  assert.equal(canSee(open, eye, 0, ahead), true);
  assert.equal(canSee(withWall(8, 10), eye, 0, ahead), false);
  assert.equal(canSee(open, eye, Math.PI, ahead), false);
  assert.equal(canSee(open, eye, 0, tileCenter(5 + 9, 10)), false);
});

test('polygon in an open room: eye first, rayCount+2 points, all endpoints 126..128px away', () => {
  const eye = { x: 160, y: 160 };
  const poly = visibilityPolygon(open, eye, 0);
  assert.equal(poly.length, VISION.rayCount + 2);
  assert.deepEqual(poly[0], eye);
  for (const p of poly.slice(1)) {
    const d = Math.hypot(p.x - eye.x, p.y - eye.y);
    assert.ok(d >= 126 && d <= 128.0001, `distance ${d}`);
  }
});

test('polygon stops before a wall 3 tiles ahead and never ends inside a solid tile', () => {
  const rows = openRows.map((row) => row.slice(0, 13) + '#' + row.slice(14));
  const grid = gridFrom(rows);
  const eye = { x: 160, y: 160 };
  const poly = visibilityPolygon(grid, eye, 0);
  const center = poly[1 + VISION.rayCount / 2];
  assert.ok(center.x >= 204 && center.x < 208, `center x ${center.x}`);
  for (const p of poly) assert.equal(pointSolid(grid, p), false);
});
