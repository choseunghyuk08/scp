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

// 40x9 two-room map for the door checks: a wall at x=23 whose only opening is a 2-tile door (rows 4 and 5).
// Left room x 1..22, right room x 24..38, an SCP-096 at (30,4) facing right, no 173.
const DW = 40;
const DH = 9;
const door = Array.from({ length: DH }, (_, y) =>
  Array.from({ length: DW }, (_, x) => (x === 0 || y === 0 || x === DW - 1 || y === DH - 1 || x === 23 ? '#' : '.')),
);
door[4][23] = 'D';
door[5][23] = 'D';
door[4][4] = '@';
door[1][1] = 'K';
door[7][37] = 'X';
door[4][30] = '>';

const DOOR_ROOM = door.map((row) => row.join(''));

module.exports = { OPEN_ROOM, DOOR_ROOM };
