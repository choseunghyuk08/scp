import { TILE } from '../config.js';

// Point = {x, y} in pixels. Tile = {tx, ty}. Grid = boolean[][] indexed grid[ty][tx], true = wall.

export function tileOf(px) {
  return Math.floor(px / TILE);
}

export function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function isSolid(grid, tx, ty) {
  if (ty < 0 || ty >= grid.length) return true;
  if (tx < 0 || tx >= grid[ty].length) return true;
  return grid[ty][tx] === true;
}

export function pointSolid(grid, p) {
  return isSolid(grid, tileOf(p.x), tileOf(p.y));
}
