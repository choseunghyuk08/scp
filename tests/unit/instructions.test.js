import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZONE_COUNT } from '../../src/config.js';
import {
  directionTo,
  FALSE_RULES,
  instructionLine,
  instructionPlan,
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
