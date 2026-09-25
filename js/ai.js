/* Computer opponent: hunts on a parity grid, then targets around hits until a ship sinks. */

(function () {
  const { BOARD_SIZE, Board } = window.Battleship;

  const NEIGHBOURS = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  class ComputerPlayer {
    constructor(smallestShipSize = 2) {
      this.parity = smallestShipSize;
      this.targets = [];
      this.currentHits = [];
    }

    nextShot(board) {
      while (this.targets.length) {
        const candidate = this.targets.shift();
        if (!board.alreadyShot(candidate.row, candidate.col)) return candidate;
      }
      return this.randomHuntShot(board);
    }

    randomHuntShot(board) {
      const preferred = [];
      const fallback = [];
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board.alreadyShot(row, col)) continue;
          ((row + col) % this.parity === 0 ? preferred : fallback).push({ row, col });
        }
      }
      const pool = preferred.length ? preferred : fallback;
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    registerResult(board, shot) {
      if (!shot) return;
      if (shot.result !== 'hit') return;

      this.currentHits.push({ row: shot.row, col: shot.col });

      if (shot.sunk) {
        // Keep only hits belonging to ships still afloat, then re-aim at those.
        this.currentHits = this.currentHits.filter((cell) => {
          const ship = board.shipAt(cell.row, cell.col);
          return ship && ship.hits < ship.size;
        });
        this.targets = this.currentHits.length ? this.alignedTargets(board) : [];
        if (this.currentHits.length && !this.targets.length) {
          this.targets = this.adjacentTargets(board, this.currentHits[0]);
        }
        return;
      }

      const aligned = this.alignedTargets(board);
      this.targets = aligned.length ? aligned : this.adjacentTargets(board, shot);
    }

    /** Once two hits line up, only extend along that line. */
    alignedTargets(board) {
      if (this.currentHits.length < 2) return [];
      const rows = new Set(this.currentHits.map((c) => c.row));
      const cols = new Set(this.currentHits.map((c) => c.col));
      const targets = [];

      if (rows.size === 1) {
        const row = this.currentHits[0].row;
        const sorted = this.currentHits.map((c) => c.col).sort((a, b) => a - b);
        targets.push({ row, col: sorted[0] - 1 }, { row, col: sorted[sorted.length - 1] + 1 });
      } else if (cols.size === 1) {
        const col = this.currentHits[0].col;
        const sorted = this.currentHits.map((c) => c.row).sort((a, b) => a - b);
        targets.push({ row: sorted[0] - 1, col }, { row: sorted[sorted.length - 1] + 1, col });
      }

      return targets.filter((c) => window.Battleship.inBounds(c.row, c.col) && !board.alreadyShot(c.row, c.col));
    }

    adjacentTargets(board, shot) {
      return NEIGHBOURS.map((offset) => ({ row: shot.row + offset.row, col: shot.col + offset.col }))
        .filter((c) => window.Battleship.inBounds(c.row, c.col) && !board.alreadyShot(c.row, c.col));
    }

    reset() {
      this.targets = [];
      this.currentHits = [];
    }
  }

  window.Battleship.ComputerPlayer = ComputerPlayer;
  window.Battleship.BoardRef = Board;
})();
