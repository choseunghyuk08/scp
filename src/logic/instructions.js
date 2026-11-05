import { ZONE_COUNT } from '../config.js';
import { createRng, hashSeed, shuffle } from './rng.js';

// Instruction = { truthful, item: 'eyedrops' | 'stim', rule } — the control room's order for one zone's side room.
// Lies carry a rule that contradicts what zone 1 taught about 173 and blinking: that is the clue (D79).

export const ITEM_NAMES = { eyedrops: '안약', stim: '각성제' };
const ITEM_SUBJECT = { eyedrops: '안약이', stim: '각성제가' };
const DIR_NAMES = { N: '북쪽', E: '동쪽', S: '남쪽', W: '서쪽' };

export const TRUE_RULES = [
  '173은 시선을 떼는 순간 움직인다.',
  '눈을 깜빡이는 순간이 가장 위험하다.',
  '173이 보이면 끝까지 눈을 떼지 마라.',
];
export const FALSE_RULES = [
  '173은 등을 보여도 움직이지 않는다. 서둘러라.',
  '눈을 깜빡여도 173은 움직이지 않는다.',
  '173은 한 번 멈추면 다시는 움직이지 않는다.',
];

/** One instruction per zone, fixed by the run seed alone: zone 0 is a true eye-drops order, 1-2 of zones 1-3 lie. */
export function instructionPlan(seed) {
  const lieCount = 1 + (hashSeed(seed, 0x4c49) % 2);
  const lies = new Set(shuffle(createRng(hashSeed(seed, 0x4c4a)), [1, 2, 3]).slice(0, lieCount));
  return Array.from({ length: ZONE_COUNT }, (_, index) => {
    const truthful = !lies.has(index);
    const pool = truthful ? TRUE_RULES : FALSE_RULES;
    return {
      truthful,
      item: index === 0 ? 'eyedrops' : hashSeed(seed, index, 0x49) % 2 === 0 ? 'eyedrops' : 'stim',
      rule: pool[hashSeed(seed, index, 0x52) % pool.length],
    };
  });
}

/** Compass word from one point to another; screen-up is north and a tie goes east/west. */
export function directionTo(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

export function instructionLine(ins, dir) {
  return `${DIR_NAMES[dir]} 곁방에 ${ITEM_SUBJECT[ins.item]} 있다. 가져가라. ${ins.rule}`;
}

export function outcomeFor(instruction, followed) {
  if (!instruction) return 'none';
  return followed ? 'followed' : 'refused';
}
