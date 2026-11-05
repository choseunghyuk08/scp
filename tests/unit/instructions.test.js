import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIDE_ROOM, ZONE_COUNT } from '../../src/config.js';
import { tileOf } from '../../src/logic/grid.js';
import { parseMap } from '../../src/logic/map.js';
import { buildZone } from '../../src/logic/mapgen.js';
import { findPath } from '../../src/logic/pathfinding.js';
import { zoneSpec } from '../../src/logic/run.js';
import {
  directionTo,
  FALSE_RULES,
  instructionLine,
  instructionPlan,
  instructionReach,
  ITEM_NAMES,
  outcomeFor,
  TRUE_RULES,
} from '../../src/logic/instructions.js';

const seeds = Array.from({ length: 1000 }, (_, i) => i * 7919 + 3);
const plans = seeds.map(instructionPlan);
const ins = { truthful: true, item: 'eyedrops', rule: TRUE_RULES[0] };

test('the plan has one instruction per zone', () => assert.ok(plans.every((p) => p.length === ZONE_COUNT)));

test('zone 0 is always a true eye-drops instruction', () =>
  assert.ok(plans.every((p) => p[0].truthful && p[0].item === 'eyedrops')));

test('each run has 1 or 2 lies, only in zones 1..3, and both counts occur', () => {
  const counts = new Set();
  for (const p of plans) {
    const lies = p.map((x, i) => (x.truthful ? -1 : i)).filter((i) => i >= 0);
    assert.ok(lies.length === 1 || lies.length === 2, `lies ${lies}`);
    assert.ok(lies.every((i) => i >= 1 && i <= 3));
    counts.add(lies.length);
  }
  assert.deepEqual([...counts].sort(), [1, 2]);
  for (const zone of [1, 2, 3]) assert.ok(plans.some((p) => !p[zone].truthful), `no lie ever in zone ${zone}`);
});

test('the plan depends only on the seed', () => assert.deepEqual(instructionPlan(42), instructionPlan(42)));

test('true instructions carry a TRUE_RULES line, lies a FALSE_RULES line; both items occur', () => {
  const items = new Set();
  for (const p of plans) {
    for (const x of p) {
      assert.ok((x.truthful ? TRUE_RULES : FALSE_RULES).includes(x.rule), x.rule);
      assert.ok(Object.hasOwn(ITEM_NAMES, x.item));
      items.add(x.item);
    }
  }
  assert.deepEqual([...items].sort(), ['eyedrops', 'stim']);
});

test('instructionLine wording and particles', () => {
  assert.equal(instructionLine({ truthful: true, item: 'eyedrops', rule: TRUE_RULES[0] }, 'N'), '북쪽 곁방에 안약이 있다. 가져가라. 173은 시선을 떼는 순간 움직인다.');
  assert.equal(instructionLine({ truthful: false, item: 'stim', rule: FALSE_RULES[1] }, 'W'), '서쪽 곁방에 각성제가 있다. 가져가라. 눈을 깜빡여도 173은 움직이지 않는다.');
  assert.match(instructionLine(ins, 'E'), /^동쪽 /);
  assert.match(instructionLine(ins, 'S'), /^남쪽 /);
});

test('directionTo picks the dominant axis with screen-up as north (ties go east/west)', () => {
  const o = { x: 0, y: 0 };
  assert.deepEqual(
    [{ x: 50, y: 10 }, { x: -50, y: 10 }, { x: 5, y: 40 }, { x: 5, y: -40 }, { x: 30, y: 30 }].map((p) => directionTo(o, p)),
    ['E', 'W', 'S', 'N', 'E'],
  );
});

test('outcomeFor: no instruction is none, otherwise followed or refused', () =>
  assert.deepEqual([outcomeFor(null, true), outcomeFor(ins, true), outcomeFor(ins, false)], ['none', 'followed', 'refused']));

/** Start -> card key -> exit along shortest paths (exit tile opened), the walk every player has to make. */
function route(map) {
  const open = map.grid.map((row) => [...row]);
  open[map.exit.ty][map.exit.tx] = false;
  const t = (p) => ({ tx: tileOf(p.x), ty: tileOf(p.y) });
  const stops = [t(map.playerStart), ...(map.cardKey ? [t(map.cardKey)] : []), map.exit];
  const tiles = [stops[0]];
  for (let i = 1; i < stops.length; i++) tiles.push(...findPath(open, stops[i - 1], stops[i]));
  return tiles;
}

test('instructionReach measures path tiles to the side-room door and keeps at least SIDE_ROOM.warnTiles', () => {
  const m = parseMap(['########', '#@.#,,a#', '#K.D,,,#', '#..X####', '########']);
  const r = instructionReach(m);
  assert.equal(r.reach, SIDE_ROOM.warnTiles);
  assert.deepEqual([r.field[2 * r.cols + 3], r.field[2 * r.cols + 2], r.field[1 * r.cols + 1]], [0, 1, 3]);
  assert.equal(instructionReach(parseMap(['#####', '#@KX#', '#####'])), null);
});

test('the start -> key -> exit route always comes within the instruction reach (review: 31% of zones never heard it)', () => {
  const silent = [];
  for (let seed = 0; seed < 200; seed++) {
    for (let z = 0; z < ZONE_COUNT; z++) {
      const { map } = buildZone(seed, zoneSpec(seed, z), 0);
      const { field, cols, reach } = instructionReach(map);
      const nearest = Math.min(...route(map).map((p) => field[p.ty * cols + p.tx]).filter((d) => d >= 0));
      if (nearest > reach) silent.push(`seed ${seed} zone ${z}: ${nearest} > ${reach}`);
      assert.ok(reach <= Math.max(SIDE_ROOM.warnTiles, nearest + 2), 'reach no larger than needed');
    }
  }
  assert.deepEqual(silent.slice(0, 5), [], `${silent.length} of 800 zones never trigger on the route`);
});
