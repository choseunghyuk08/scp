// 20x9 open room for deterministic smoke checks: border walls, everything else floor.
const W = 20;
const H = 9;
const grid = Array.from({ length: H }, (_, y) =>
  Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')),
);
grid[4][4] = '@';
grid[4][13] = 'S';
grid[1][1] = 'K';
grid[7][17] = 'X';

const OPEN_ROOM = grid.map((row) => row.join(''));

module.exports = { OPEN_ROOM };
