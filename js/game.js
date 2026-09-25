/* Core Battleship rules: board state, ship placement, firing. No DOM access. */

const BOARD_SIZE = 10;

const SHIP_TYPES = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 },
];

const CELL = {
  EMPTY: 'empty',
  MISS: 'miss',
  HIT: 'hit',
};

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function shipCells(row, col, size, orientation) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(orientation === 'horizontal' ? { row, col: col + i } : { row: row + i, col });
  }
  return cells;
}

class Board {
  constructor() {
    this.size = BOARD_SIZE;
    this.ships = [];
    this.shots = new Map();
  }

  static key(row, col) {
    return `${row},${col}`;
  }

  shipAt(row, col) {
    return this.ships.find((ship) => ship.cells.some((c) => c.row === row && c.col === col)) || null;
  }

  canPlace(row, col, size, orientation, ignoreShipId = null) {
    const cells = shipCells(row, col, size, orientation);
    return cells.every((c) => {
      if (!inBounds(c.row, c.col)) return false;
      const occupant = this.shipAt(c.row, c.col);
      return !occupant || occupant.id === ignoreShipId;
    });
  }

  place(type, row, col, orientation) {
    if (!this.canPlace(row, col, type.size, orientation, type.id)) return false;
    this.remove(type.id);
    this.ships.push({
      id: type.id,
      name: type.name,
      size: type.size,
      orientation,
      cells: shipCells(row, col, type.size, orientation),
      hits: 0,
    });
    return true;
  }

  remove(shipId) {
    this.ships = this.ships.filter((ship) => ship.id !== shipId);
  }

  clear() {
    this.ships = [];
    this.shots.clear();
  }

  placeRandomly(types = SHIP_TYPES) {
    this.clear();
    for (const type of types) {
      let placed = false;
      while (!placed) {
        const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        const row = Math.floor(Math.random() * BOARD_SIZE);
        const col = Math.floor(Math.random() * BOARD_SIZE);
        placed = this.place(type, row, col, orientation);
      }
    }
  }

  alreadyShot(row, col) {
    return this.shots.has(Board.key(row, col));
  }

  /** Fires at a cell. Returns null for an invalid or repeated shot. */
  receiveShot(row, col) {
    if (!inBounds(row, col) || this.alreadyShot(row, col)) return null;
    const ship = this.shipAt(row, col);
    if (!ship) {
      this.shots.set(Board.key(row, col), CELL.MISS);
      return { result: CELL.MISS, row, col, ship: null, sunk: false };
    }
    this.shots.set(Board.key(row, col), CELL.HIT);
    ship.hits += 1;
    const sunk = ship.hits >= ship.size;
    return { result: CELL.HIT, row, col, ship, sunk };
  }

  shotAt(row, col) {
    return this.shots.get(Board.key(row, col)) || null;
  }

  isSunk(shipId) {
    const ship = this.ships.find((s) => s.id === shipId);
    return !!ship && ship.hits >= ship.size;
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((ship) => ship.hits >= ship.size);
  }

  remainingShips() {
    return this.ships.filter((ship) => ship.hits < ship.size);
  }
}

window.Battleship = { BOARD_SIZE, SHIP_TYPES, CELL, Board, shipCells, inBounds };
