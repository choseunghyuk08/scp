import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFrom } from '../helpers/grid.js';
import { DOOR_INTERACT_DIST } from '../../src/config.js';
import {
  breakDoor,
  createDoors,
  cycleDoor,
  doorAtTile,
  doorCenter,
  isBlocking,
  nearestDoor,
  occupies,
  openDoor,
  withDoors,
} from '../../src/logic/doors.js';

const vertical = [{ tx: 4, ty: 2 }, { tx: 4, ty: 3 }]; // x 64..80, y 32..64
const [door] = createDoors([vertical]);

test('the interact distance is 24px', () => assert.equal(DOOR_INTERACT_DIST, 24));

test('createDoors numbers doors in order and starts them open and whole', () => {
  const doors = createDoors([vertical, [{ tx: 9, ty: 1 }, { tx: 10, ty: 1 }]]);
  assert.deepEqual(doors.map((d) => [d.id, d.state, d.broken]), [[0, 'open', false], [1, 'open', false]]);
});

test('cycle order is open -> closed -> locked -> open', () => {
  const closed = cycleDoor(door, false);
  const locked = cycleDoor(closed, false);
  const open = cycleDoor(locked, false);
  assert.deepEqual([closed.state, locked.state, open.state], ['closed', 'locked', 'open']);
  assert.equal(door.state, 'open', 'input not mutated');
});

test('an occupied open door does not close; occupied closed/locked doors still cycle', () => {
  assert.equal(cycleDoor(door, true).state, 'open');
  assert.equal(cycleDoor({ ...door, state: 'closed' }, true).state, 'locked');
  assert.equal(cycleDoor({ ...door, state: 'locked' }, true).state, 'open');
});

test('a broken door ignores cycling and never blocks', () => {
  const broken = breakDoor({ ...door, state: 'locked' });
  assert.deepEqual([broken.state, broken.broken], ['open', true]);
  assert.equal(cycleDoor(broken, false), broken);
  assert.equal(isBlocking(broken), false);
});

test('isBlocking is true for closed and locked whole doors only', () => {
  assert.deepEqual(
    ['open', 'closed', 'locked'].map((state) => isBlocking({ ...door, state })),
    [false, true, true],
  );
  assert.equal(openDoor({ ...door, state: 'locked' }).state, 'open');
});

test('occupies: an actor overlapping a door tile by radius counts, touching the edge does not', () => {
  assert.equal(occupies(door, [{ pos: { x: 59, y: 40 }, radius: 5 }]), false);
  assert.equal(occupies(door, [{ pos: { x: 60, y: 40 }, radius: 5 }]), true);
  assert.equal(occupies(door, [{ pos: { x: 24, y: 24 }, radius: 5 }, { pos: { x: 72, y: 60 }, radius: 5 }]), true);
  assert.equal(occupies(door, []), false);
});

test('doorCenter of a vertical two-tile door is between its tiles', () => {
  assert.deepEqual(doorCenter(createDoors([[{ tx: 13, ty: 4 }, { tx: 13, ty: 5 }]])[0]), { x: 216, y: 80 });
});

test('nearestDoor picks the closest door within 24px and returns null beyond', () => {
  const doors = createDoors([[{ tx: 13, ty: 4 }, { tx: 13, ty: 5 }], [{ tx: 16, ty: 4 }, { tx: 16, ty: 5 }]]);
  assert.equal(nearestDoor(doors, { x: 236, y: 80 }).id, 0); // 20px from door 0, 28px from door 1
  assert.equal(nearestDoor(doors, { x: 248, y: 80 }).id, 1);
  assert.equal(nearestDoor(doors, { x: 216, y: 104 }).id, 0); // exactly 24px
  assert.equal(nearestDoor(doors, { x: 216, y: 104.5 }), null);
});

test('withDoors walls off closed and locked doors only, without mutating the grid', () => {
  const grid = gridFrom(['######', '#....#', '#....#', '#....#', '######']);
  const doors = createDoors([[{ tx: 1, ty: 1 }], [{ tx: 2, ty: 1 }], [{ tx: 3, ty: 1 }], [{ tx: 4, ty: 1 }]]);
  const set = [doors[0], { ...doors[1], state: 'closed' }, { ...doors[2], state: 'locked' }, breakDoor(doors[3])];
  const out = withDoors(grid, set);
  assert.deepEqual(out[1], [true, false, true, true, false, true]);
  assert.deepEqual(grid[1], [true, false, false, false, false, true]);
});

test('doorAtTile finds the door owning a tile', () => {
  assert.equal(doorAtTile([door], { tx: 4, ty: 3 }).id, 0);
  assert.equal(doorAtTile([door], { tx: 5, ty: 3 }), null);
});
