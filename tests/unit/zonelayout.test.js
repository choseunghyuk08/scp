import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZONE_COLS, ZONE_ROWS } from '../../src/config.js';
import { createRng } from '../../src/logic/rng.js';
import { findDoorways, layoutZone } from '../../src/logic/zonelayout.js';

const P = (roomCount) => ({ cols: ZONE_COLS, rows: ZONE_ROWS, roomCount });
const cases = [];
for (let seed = 0; seed < 200; seed++) for (const roomCount of [3, 4]) cases.push({ seed, roomCount });
const layouts = cases.map(({ seed, roomCount }) => ({ seed, roomCount, ...layoutZone(createRng(seed), P(roomCount)) }));
const center = (r) => ({ tx: r.x + Math.floor(r.w / 2), ty: r.y + Math.floor(r.h / 2) });

test('zone size constants are 64 x 40', () => {
  assert.equal(ZONE_COLS, 64);
  assert.equal(ZONE_ROWS, 40);
});

test('rooms are joined as one chain (no room has more than two corridors)', () => {
  for (const { rooms, edges, seed } of layouts) {
    const degree = rooms.map((_, i) => edges.filter((e) => e.includes(i)).length);
    assert.ok(degree.every((d) => d >= 1 && d <= 2), `seed ${seed} degrees ${degree}`);
    assert.equal(degree.filter((d) => d === 1).length, 2, `seed ${seed} chain ends`);
  }
});

test('same seed gives the same layout', () => {
  assert.deepEqual(layoutZone(createRng(123), P(4)), layoutZone(createRng(123), P(4)));
  assert.notDeepEqual(layoutZone(createRng(123), P(4)).grid, layoutZone(createRng(124), P(4)).grid);
});

test('grid has the requested size and a solid border', () => {
  for (const { grid } of layouts) {
    assert.equal(grid.length, ZONE_ROWS);
    assert.ok(grid.every((row) => row.length === ZONE_COLS));
    for (let x = 0; x < ZONE_COLS; x++) assert.ok(grid[0][x] && grid[ZONE_ROWS - 1][x]);
    for (let y = 0; y < ZONE_ROWS; y++) assert.ok(grid[y][0] && grid[y][ZONE_COLS - 1]);
  }
});

test('rooms: count, size 8..16 x 6..10, inside the border, none overlapping', () => {
  for (const { rooms, roomCount, seed } of layouts) {
    assert.equal(rooms.length, roomCount, `seed ${seed}`);
    for (const r of rooms) {
      assert.ok(r.w >= 8 && r.w <= 16 && r.h >= 6 && r.h <= 10, `size ${JSON.stringify(r)}`);
      assert.ok(r.x >= 2 && r.y >= 2 && r.x + r.w <= ZONE_COLS - 2 && r.y + r.h <= ZONE_ROWS - 2, `bounds ${JSON.stringify(r)}`);
    }
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        assert.ok(apart, `rooms ${i} and ${j} overlap (seed ${seed})`);
      }
    }
  }
});

test('edges form a tree over the rooms', () => {
  for (const { rooms, edges, seed } of layouts) {
    assert.equal(edges.length, rooms.length - 1);
    const parent = rooms.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const [a, b] of edges) {
      assert.ok(a !== b && a >= 0 && b >= 0 && a < rooms.length && b < rooms.length);
      assert.notEqual(find(a), find(b), `cycle at seed ${seed}`);
      parent[find(a)] = find(b);
    }
    assert.equal(new Set(rooms.map((_, i) => find(i))).size, 1);
  }
});

test('all floor tiles form one connected component and every room centre is floor', () => {
  for (const { grid, rooms, seed } of layouts) {
    let total = 0;
    let first = null;
    grid.forEach((row, y) => row.forEach((wall, x) => {
      if (!wall) {
        total++;
        first ??= { x, y };
      }
    }));
    const seen = new Set([`${first.x},${first.y}`]);
    const stack = [first];
    while (stack.length) {
      const { x, y } = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const k = `${nx},${ny}`;
        if (!grid[ny][nx] && !seen.has(k)) {
          seen.add(k);
          stack.push({ x: nx, y: ny });
        }
      }
    }
    assert.equal(seen.size, total, `disconnected floor at seed ${seed}`);
    for (const r of rooms) {
      const c = center(r);
      assert.equal(grid[c.ty][c.tx], false, `room centre is a wall at seed ${seed}`);
    }
  }
});

test('pillars appear in at least 40% of seeds and no room holds more than 8 interior wall tiles', () => {
  let withPillars = 0;
  for (const { grid, rooms } of layouts) {
    let any = false;
    for (const r of rooms) {
      let walls = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (grid[y][x]) walls++;
      assert.ok(walls <= 8, `room holds ${walls} wall tiles`);
      if (walls > 0) any = true;
    }
    if (any) withPillars++;
  }
  assert.ok(withPillars / layouts.length >= 0.4, `pillars in ${withPillars}/${layouts.length}`);
});

test('findDoorways returns two-tile floor groups just outside rooms', () => {
  for (const { grid, rooms, seed } of layouts) {
    for (const group of findDoorways(grid, rooms)) {
      assert.equal(group.length, 2, `seed ${seed}`);
      for (const t of group) {
        assert.equal(grid[t.ty][t.tx], false);
        assert.ok(!rooms.some((r) => t.tx >= r.x && t.tx < r.x + r.w && t.ty >= r.y && t.ty < r.y + r.h));
      }
    }
  }
});

test('at least 97% of rooms have a doorway (corridors meet rooms head-on instead of running along their walls)', () => {
  let rooms = 0;
  let missing = 0;
  for (const { grid, rooms: zoneRooms } of layouts) {
    const groups = findDoorways(grid, zoneRooms);
    for (const r of zoneRooms) {
      rooms++;
      if (!groups.some((g) => g.some((t) => t.tx >= r.x - 1 && t.tx <= r.x + r.w && t.ty >= r.y - 1 && t.ty <= r.y + r.h))) missing++;
    }
  }
  assert.ok(missing / rooms <= 0.03, `${missing} of ${rooms} rooms have no doorway`);
});
