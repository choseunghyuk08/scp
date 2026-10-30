import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFrom } from '../helpers/grid.js';
import { findPath } from '../../src/logic/pathfinding.js';

test('straight corridor returns each step', () =>
  assert.deepEqual(findPath(gridFrom(['#####', '#...#', '#####']), { tx: 1, ty: 1 }, { tx: 3, ty: 1 }), [
    { tx: 2, ty: 1 },
    { tx: 3, ty: 1 },
  ]));

test('same tile returns empty path', () =>
  assert.deepEqual(findPath(gridFrom(['###', '#.#', '###']), { tx: 1, ty: 1 }, { tx: 1, ty: 1 }), []));

test('routes around a wall', () =>
  assert.deepEqual(findPath(gridFrom(['#####', '#.#.#', '#...#', '#####']), { tx: 1, ty: 1 }, { tx: 3, ty: 1 }), [
    { tx: 1, ty: 2 },
    { tx: 2, ty: 2 },
    { tx: 3, ty: 2 },
    { tx: 3, ty: 1 },
  ]));

test('unreachable goal returns null', () =>
  assert.equal(findPath(gridFrom(['#####', '#.#.#', '#####']), { tx: 1, ty: 1 }, { tx: 3, ty: 1 }), null));

test('goal inside a wall returns null', () =>
  assert.equal(findPath(gridFrom(['#####', '#.#.#', '#...#', '#####']), { tx: 1, ty: 1 }, { tx: 2, ty: 1 }), null));

test('goal outside the grid returns null', () =>
  assert.equal(findPath(gridFrom(['###', '#.#', '###']), { tx: 1, ty: 1 }, { tx: 9, ty: 9 }), null));
