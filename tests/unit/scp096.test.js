import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFrom } from '../helpers/grid.js';
import { SCP096 } from '../../src/config.js';
import { tileCenter } from '../../src/logic/grid.js';
import { breakDoor, createDoors } from '../../src/logic/doors.js';
import { create096, faceSeen, isLethal096, step096 } from '../../src/logic/scp096.js';

const DT = 0.05;
const corridor = (n) => gridFrom(['#'.repeat(n + 2), '#' + '.'.repeat(n) + '#', '#'.repeat(n + 2)]);
const open = gridFrom(Array.from({ length: 20 }, () => '.'.repeat(20)));
const deg = (d) => (d * Math.PI) / 180;

/** Runs step096 until `until(s, events, t)` is true or `limit` seconds pass; applies door events like the scene. */
function simulate(s, { navGrid, doors, player, seen = false, until, limit = 15 }) {
  let t = 0;
  let current = doors;
  const log = [];
  while (t < limit) {
    const out = step096(s, { dt: DT, navGrid, doors: current, player, seen });
    s = out.s;
    t += DT;
    for (const e of out.events) {
      log.push({ ...e, t });
      current = current.map((d) => (d.id !== e.doorId ? d : e.kind === 'broken' ? breakDoor(d) : { ...d, state: 'open' }));
    }
    if (until(s, log, t)) break;
  }
  return { s, doors: current, log, t };
}
const rage = (s) => ({ ...s, mode: 'rage' });

test('the 096 constants match the spec', () => {
  assert.deepEqual(
    [SCP096.speed, SCP096.returnSpeed, SCP096.touchDistance, SCP096.calmTiles, SCP096.warnTiles, SCP096.breakSeconds],
    [150, 48, 10, 20, 12, { closed: 3, locked: 6 }],
  );
  assert.ok(Math.abs(SCP096.faceHalfAngle - deg(60)) < 1e-12);
});

test('idle 096 stays idle when its face is not seen', () => {
  let s = create096(tileCenter(2, 1), 0);
  for (let i = 0; i < 40; i++) s = step096(s, { dt: DT, navGrid: corridor(20), doors: [], player: tileCenter(15, 1), seen: false }).s;
  assert.deepEqual([s.mode, s.pos], ['idle', tileCenter(2, 1)]);
});

test('faceSeen: front within 60deg true, beyond false, behind false, through a wall false', () => {
  const s = create096({ x: 160, y: 160 }, Math.PI); // faces left
  const at = (d) => {
    const a = Math.PI + deg(d);
    const player = { x: 160 + 64 * Math.cos(a), y: 160 + 64 * Math.sin(a) };
    return faceSeen(s, { grid: open, player, playerFacing: a + Math.PI });
  };
  assert.equal(at(0), true);
  assert.equal(at(59), true);
  assert.equal(at(-59), true);
  assert.equal(at(61), false);
  assert.equal(at(180), false, 'from behind');
  const walled = gridFrom(open.map((row, y) => row.map((w, x) => (x === 7 ? '#' : '.')).join('')));
  assert.equal(faceSeen(s, { grid: walled, player: { x: 96, y: 160 }, playerFacing: 0 }), false);
});

test('faceSeen with the player exactly on the 096 is false and does not throw', () => {
  const s = create096({ x: 160, y: 160 }, 0);
  assert.equal(faceSeen(s, { grid: open, player: { x: 160, y: 160 }, playerFacing: Math.PI }), false);
});

test('seeing the face starts the rage, which chases at 150px/s', () => {
  const navGrid = corridor(20);
  const player = tileCenter(18, 1);
  let s = step096(create096(tileCenter(1, 1), 0), { dt: DT, navGrid, doors: [], player, seen: true }).s;
  assert.equal(s.mode, 'rage');
  for (let i = 0; i < 10; i++) s = step096(s, { dt: DT, navGrid, doors: [], player, seen: false }).s;
  assert.ok(Math.abs(s.pos.x - (24 + 75)) <= 1, `x ${s.pos.x}`);
});

test('a closed door holds a raging 096 for 3s, then it breaks', () => {
  const doors = [{ ...createDoors([[{ tx: 5, ty: 1 }]])[0], state: 'closed' }];
  const r = simulate(rage(create096(tileCenter(2, 1), 0)), {
    navGrid: corridor(20), doors, player: tileCenter(15, 1), until: (s, log) => log.length > 0,
  });
  assert.equal(r.log[0].kind, 'broken');
  assert.ok(r.t >= 3 && r.t <= 3.4, `broke at ${r.t}`);
  assert.ok(r.s.pos.x <= tileCenter(4, 1).x, 'waited in front of the door');
});

test('a locked door holds it for 6s', () => {
  const doors = [{ ...createDoors([[{ tx: 5, ty: 1 }]])[0], state: 'locked' }];
  const r = simulate(rage(create096(tileCenter(2, 1), 0)), {
    navGrid: corridor(20), doors, player: tileCenter(15, 1), until: (s, log) => log.length > 0,
  });
  assert.ok(r.t >= 6 && r.t <= 6.4, `broke at ${r.t}`);
});

test('20 path tiles from a locked door being broken calms it; it walks home and sits facing its home direction', () => {
  const doors = [{ ...createDoors([[{ tx: 5, ty: 1 }]])[0], state: 'locked' }];
  const home = tileCenter(2, 1);
  const start = { ...rage(create096(home, Math.PI / 2)), facing: 0 };
  const r = simulate(start, { navGrid: corridor(40), doors, player: tileCenter(30, 1), until: (s) => s.mode === 'idle' });
  assert.equal(r.s.mode, 'idle');
  assert.deepEqual(r.s.pos, home);
  assert.equal(r.s.facing, Math.PI / 2);
  assert.deepEqual(r.log, [], 'the door was never broken');
});

test('a closed (unlocked) door never calms it', () => {
  const doors = [{ ...createDoors([[{ tx: 5, ty: 1 }]])[0], state: 'closed' }];
  const r = simulate(rage(create096(tileCenter(2, 1), 0)), {
    navGrid: corridor(40), doors, player: tileCenter(30, 1), until: (s, log) => log.length > 0 || s.mode !== 'rage',
  });
  assert.deepEqual([r.s.mode, r.log[0]?.kind], ['rage', 'broken']);
});

test('seen again while returning restarts the rage', () => {
  const s = { ...create096(tileCenter(2, 1), 0), mode: 'returning', pos: tileCenter(4, 1) };
  const out = step096(s, { dt: DT, navGrid: corridor(20), doors: [], player: tileCenter(10, 1), seen: true });
  assert.equal(out.s.mode, 'rage');
});

test('a returning 096 opens a blocking door it walks into', () => {
  const doors = [{ ...createDoors([[{ tx: 3, ty: 1 }]])[0], state: 'locked' }];
  const s = { ...create096(tileCenter(1, 1), 0), mode: 'returning', pos: tileCenter(5, 1) };
  const r = simulate(s, { navGrid: corridor(10), doors, player: tileCenter(9, 1), until: (x) => x.mode === 'idle' });
  assert.deepEqual(r.log.map((e) => e.kind), ['opened']);
  assert.equal(r.s.mode, 'idle');
});

test('only a raging 096 is lethal', () => {
  const s = create096({ x: 100, y: 100 }, 0);
  assert.equal(isLethal096(s, { x: 105, y: 100 }), false);
  assert.equal(isLethal096(rage(s), { x: 105, y: 100 }), true);
  assert.equal(isLethal096(rage(s), { x: 110, y: 100 }), false);
});

test('a raging 096 with no path at all stays put without throwing', () => {
  const s0 = rage(create096(tileCenter(1, 1), 0));
  const out = step096(s0, { dt: DT, navGrid: gridFrom(['#####', '#.#.#', '#####']), doors: [], player: tileCenter(3, 1), seen: false });
  assert.deepEqual([out.s.pos, out.s.mode], [tileCenter(1, 1), 'rage']);
});
