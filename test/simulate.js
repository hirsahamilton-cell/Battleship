/* Headless sanity check: runs many AI-vs-random games and asserts the rules hold.
   Run with: node test/simulate.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ['js/game.js', 'js/ai.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}

const { SHIP_TYPES, BOARD_SIZE, Board, ComputerPlayer } = sandbox.window.Battleship;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const totalCells = SHIP_TYPES.reduce((sum, type) => sum + type.size, 0);
const GAMES = 500;
let shotTotal = 0;

for (let game = 0; game < GAMES; game++) {
  const board = new Board();
  board.placeRandomly(SHIP_TYPES);

  const occupied = new Set();
  for (const ship of board.ships) {
    assert(ship.cells.length === ship.size, 'ship has wrong cell count');
    for (const cell of ship.cells) {
      const key = `${cell.row},${cell.col}`;
      assert(!occupied.has(key), 'ships overlap');
      assert(cell.row >= 0 && cell.row < BOARD_SIZE && cell.col >= 0 && cell.col < BOARD_SIZE, 'ship off board');
      occupied.add(key);
    }
  }
  assert(occupied.size === totalCells, 'unexpected number of occupied cells');

  const ai = new ComputerPlayer(Math.min(...SHIP_TYPES.map((s) => s.size)));
  let shots = 0;
  while (!board.allSunk()) {
    const target = ai.nextShot(board);
    assert(target, 'AI ran out of targets before sinking the fleet');
    const shot = board.receiveShot(target.row, target.col);
    assert(shot, 'AI fired at an already-targeted cell');
    ai.registerResult(board, shot);
    shots += 1;
    assert(shots <= BOARD_SIZE * BOARD_SIZE, 'AI exceeded the board size in shots');
  }
  shotTotal += shots;
  assert(board.receiveShot(board.ships[0].cells[0].row, board.ships[0].cells[0].col) === null, 'repeat shot allowed');
}

const edge = new Board();
assert(!edge.canPlace(0, 7, 5, 'horizontal'), 'placement should not run off the right edge');
assert(!edge.canPlace(7, 0, 5, 'vertical'), 'placement should not run off the bottom edge');
assert(edge.place(SHIP_TYPES[0], 0, 0, 'horizontal'), 'valid placement rejected');
assert(!edge.place(SHIP_TYPES[1], 0, 2, 'horizontal'), 'overlapping placement accepted');
assert(edge.place(SHIP_TYPES[0], 0, 1, 'horizontal'), 'moving a ship onto its own cells rejected');

console.log(`OK — ${GAMES} games, average ${(shotTotal / GAMES).toFixed(1)} AI shots to clear the board.`);
