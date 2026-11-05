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

// 40x9 side-room map (v0.4): the DOOR_ROOM wall at x=23 with its 2-tile door, the right part x 24..38 all side-room
// floor ','; eye drops 'a' at (30,4); exit X at (20,7) in the left room; no 173, no 096.
const side = Array.from({ length: DH }, (_, y) =>
  Array.from({ length: DW }, (_, x) => {
    if (x === 0 || y === 0 || x === DW - 1 || y === DH - 1 || x === 23) return '#';
    return x > 23 ? ',' : '.';
  }),
);
side[4][23] = 'D';
side[5][23] = 'D';
side[4][4] = '@';
side[1][1] = 'K';
side[7][20] = 'X';
side[4][30] = 'a';

const SIDE_ROOM = side.map((row) => row.join(''));

module.exports = { OPEN_ROOM, DOOR_ROOM, SIDE_ROOM };
