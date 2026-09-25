/* Wires the game core and AI to the DOM: placement phase, firing, log and end state. */

(function () {
  const { BOARD_SIZE, SHIP_TYPES, Board, ComputerPlayer, shipCells } = window.Battleship;

  const el = {
    status: document.getElementById('status'),
    fleetList: document.getElementById('fleet-list'),
    rotateBtn: document.getElementById('rotate-btn'),
    randomBtn: document.getElementById('random-btn'),
    resetBtn: document.getElementById('reset-btn'),
    startBtn: document.getElementById('start-btn'),
    restartBtn: document.getElementById('restart-btn'),
    setupHint: document.getElementById('setup-hint'),
    playerBoard: document.getElementById('player-board'),
    enemyBoard: document.getElementById('enemy-board'),
    log: document.getElementById('log'),
    playerRemaining: document.getElementById('player-remaining'),
    enemyRemaining: document.getElementById('enemy-remaining'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayText: document.getElementById('overlay-text'),
    overlayBtn: document.getElementById('overlay-btn'),
  };

  const COLUMN_LABELS = 'ABCDEFGHIJ';
  const coord = (row, col) => `${COLUMN_LABELS[col]}${row + 1}`;

  const state = {
    phase: 'setup',
    orientation: 'horizontal',
    selectedShipId: SHIP_TYPES[0].id,
    playerBoard: new Board(),
    enemyBoard: new Board(),
    ai: new ComputerPlayer(Math.min(...SHIP_TYPES.map((s) => s.size))),
    busy: false,
    enemyTurnTimer: null,
  };

  const playerCells = [];
  const enemyCells = [];

  function buildGrid(container, cells, onClick, onHover, onLeave) {
    container.innerHTML = '';
    cells.length = 0;

    container.appendChild(document.createElement('div')).className = 'label corner';
    for (let col = 0; col < BOARD_SIZE; col++) {
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = COLUMN_LABELS[col];
      container.appendChild(label);
    }

    for (let row = 0; row < BOARD_SIZE; row++) {
      const rowLabel = document.createElement('div');
      rowLabel.className = 'label';
      rowLabel.textContent = String(row + 1);
      container.appendChild(rowLabel);
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute('aria-label', coord(row, col));
        if (onClick) cell.addEventListener('click', () => onClick(row, col));
        if (onHover) cell.addEventListener('mouseenter', () => onHover(row, col));
        if (onLeave) cell.addEventListener('mouseleave', onLeave);
        container.appendChild(cell);
        cells.push(cell);
      }
    }
  }

  const cellAt = (cells, row, col) => cells[row * BOARD_SIZE + col];

  function selectedShipType() {
    return SHIP_TYPES.find((type) => type.id === state.selectedShipId) || null;
  }

  function nextUnplacedShip() {
    return SHIP_TYPES.find((type) => !state.playerBoard.ships.some((ship) => ship.id === type.id)) || null;
  }

  function renderFleet() {
    el.fleetList.innerHTML = '';
    for (const type of SHIP_TYPES) {
      const ship = state.playerBoard.ships.find((s) => s.id === type.id);
      const item = document.createElement('li');
      item.className = [
        ship ? 'placed' : '',
        state.selectedShipId === type.id && state.phase === 'setup' ? 'selected' : '',
        ship && ship.hits >= ship.size ? 'sunk' : '',
      ]
        .filter(Boolean)
        .join(' ');
      item.innerHTML = `<span>${type.name}</span><span class="pips">${'<i></i>'.repeat(type.size)}</span>`;
      if (state.phase === 'setup') {
        item.addEventListener('click', () => {
          state.selectedShipId = type.id;
          renderFleet();
        });
      }
      el.fleetList.appendChild(item);
    }
  }

  function renderPlayerBoard() {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = cellAt(playerCells, row, col);
        const ship = state.playerBoard.shipAt(row, col);
        const shot = state.playerBoard.shotAt(row, col);
        cell.className = 'cell';
        if (ship) cell.classList.add('ship');
        if (shot === 'miss') cell.classList.add('miss');
        if (shot === 'hit') cell.classList.add(ship && ship.hits >= ship.size ? 'sunk' : 'hit');
      }
    }
  }

  function renderEnemyBoard() {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = cellAt(enemyCells, row, col);
        const shot = state.enemyBoard.shotAt(row, col);
        const ship = state.enemyBoard.shipAt(row, col);
        cell.className = 'cell';
        if (shot === 'miss') cell.classList.add('miss');
        if (shot === 'hit') cell.classList.add(ship && ship.hits >= ship.size ? 'sunk' : 'hit');
      }
    }
  }

  function clearPreview() {
    for (const cell of playerCells) cell.classList.remove('preview', 'preview-bad');
  }

  function previewPlacement(row, col) {
    if (state.phase !== 'setup') return;
    const type = selectedShipType();
    clearPreview();
    if (!type) return;
    const ok = state.playerBoard.canPlace(row, col, type.size, state.orientation, type.id);
    for (const c of shipCells(row, col, type.size, state.orientation)) {
      if (!window.Battleship.inBounds(c.row, c.col)) continue;
      cellAt(playerCells, c.row, c.col).classList.add(ok ? 'preview' : 'preview-bad');
    }
  }

  function handlePlacement(row, col) {
    if (state.phase !== 'setup') return;
    const type = selectedShipType();
    if (!type) return;
    if (!state.playerBoard.place(type, row, col, state.orientation)) {
      setStatus("That ship doesn't fit there.");
      return;
    }
    const next = nextUnplacedShip();
    state.selectedShipId = next ? next.id : type.id;
    clearPreview();
    renderPlayerBoard();
    renderFleet();
    updateSetupControls();
  }

  function updateSetupControls() {
    const allPlaced = state.playerBoard.ships.length === SHIP_TYPES.length;
    el.startBtn.disabled = !allPlaced;
    if (state.phase === 'setup') {
      setStatus(allPlaced ? 'Fleet ready — start the battle.' : 'Place your fleet to begin.');
    }
    updateCounters();
  }

  function updateCounters() {
    const setup = state.phase === 'setup';
    el.playerRemaining.textContent = String(setup ? SHIP_TYPES.length : state.playerBoard.remainingShips().length);
    el.enemyRemaining.textContent = String(setup ? SHIP_TYPES.length : state.enemyBoard.remainingShips().length);
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  function addLog(text, who) {
    const item = document.createElement('li');
    item.textContent = text;
    if (who === 'enemy') item.classList.add('enemy');
    el.log.appendChild(item);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function startBattle() {
    if (state.playerBoard.ships.length !== SHIP_TYPES.length) return;
    state.enemyBoard.placeRandomly(SHIP_TYPES);
    state.ai.reset();
    state.phase = 'battle';
    el.enemyBoard.classList.remove('locked');
    el.startBtn.disabled = true;
    el.rotateBtn.disabled = true;
    el.randomBtn.disabled = true;
    el.resetBtn.disabled = true;
    el.setupHint.textContent = 'Click enemy waters to fire.';
    renderFleet();
    updateCounters();
    setStatus('Your turn — fire at enemy waters.');
    addLog('Battle stations! Enemy fleet deployed.');
  }

  function playerFire(row, col) {
    if (state.phase !== 'battle' || state.busy) return;
    const shot = state.enemyBoard.receiveShot(row, col);
    if (!shot) return;

    renderEnemyBoard();
    if (shot.result === 'hit') {
      addLog(shot.sunk ? `You sank the enemy ${shot.ship.name} at ${coord(row, col)}!` : `Hit at ${coord(row, col)}.`);
    } else {
      addLog(`Miss at ${coord(row, col)}.`);
    }
    updateCounters();

    if (state.enemyBoard.allSunk()) {
      endGame(true);
      return;
    }

    state.busy = true;
    setStatus('Enemy is taking aim...');
    state.enemyTurnTimer = setTimeout(enemyTurn, 650);
  }

  function enemyTurn() {
    state.enemyTurnTimer = null;
    if (state.phase !== 'battle') return;
    const target = state.ai.nextShot(state.playerBoard);
    if (!target) {
      state.busy = false;
      return;
    }
    const shot = state.playerBoard.receiveShot(target.row, target.col);
    state.ai.registerResult(state.playerBoard, shot);

    renderPlayerBoard();
    if (shot.result === 'hit') {
      addLog(
        shot.sunk
          ? `Enemy sank your ${shot.ship.name} at ${coord(shot.row, shot.col)}!`
          : `Enemy hit your ${shot.ship.name} at ${coord(shot.row, shot.col)}.`,
        'enemy'
      );
    } else {
      addLog(`Enemy missed at ${coord(shot.row, shot.col)}.`, 'enemy');
    }
    renderFleet();
    updateCounters();

    if (state.playerBoard.allSunk()) {
      endGame(false);
      return;
    }

    state.busy = false;
    setStatus('Your turn — fire at enemy waters.');
  }

  function endGame(playerWon) {
    clearTimeout(state.enemyTurnTimer);
    state.enemyTurnTimer = null;
    state.phase = 'over';
    state.busy = false;
    el.enemyBoard.classList.add('locked');
    revealEnemyFleet();
    setStatus(playerWon ? 'You win!' : 'Your fleet was destroyed.');
    el.overlayTitle.textContent = playerWon ? 'Victory' : 'Defeat';
    el.overlayText.textContent = playerWon
      ? 'The enemy fleet lies at the bottom of the sea.'
      : 'Every one of your ships has been sunk.';
    el.overlay.classList.remove('hidden');
  }

  function revealEnemyFleet() {
    for (const ship of state.enemyBoard.ships) {
      for (const c of ship.cells) {
        const cell = cellAt(enemyCells, c.row, c.col);
        if (!cell.classList.contains('hit') && !cell.classList.contains('sunk')) cell.classList.add('ship');
      }
    }
  }

  function newGame() {
    clearTimeout(state.enemyTurnTimer);
    state.enemyTurnTimer = null;
    state.phase = 'setup';
    state.orientation = 'horizontal';
    state.selectedShipId = SHIP_TYPES[0].id;
    state.playerBoard = new Board();
    state.enemyBoard = new Board();
    state.ai.reset();
    state.busy = false;

    el.overlay.classList.add('hidden');
    el.enemyBoard.classList.add('locked');
    el.log.innerHTML = '';
    el.rotateBtn.disabled = false;
    el.randomBtn.disabled = false;
    el.resetBtn.disabled = false;
    el.setupHint.textContent = 'Pick a ship, hover your waters, click to place.';

    renderPlayerBoard();
    renderEnemyBoard();
    renderFleet();
    updateSetupControls();
  }

  buildGrid(el.playerBoard, playerCells, handlePlacement, previewPlacement, clearPreview);
  buildGrid(el.enemyBoard, enemyCells, playerFire);

  el.rotateBtn.addEventListener('click', () => {
    state.orientation = state.orientation === 'horizontal' ? 'vertical' : 'horizontal';
    setStatus(`Orientation: ${state.orientation}.`);
  });

  el.randomBtn.addEventListener('click', () => {
    state.playerBoard.placeRandomly(SHIP_TYPES);
    renderPlayerBoard();
    renderFleet();
    updateSetupControls();
  });

  el.resetBtn.addEventListener('click', () => {
    state.playerBoard.clear();
    state.selectedShipId = SHIP_TYPES[0].id;
    renderPlayerBoard();
    renderFleet();
    updateSetupControls();
  });

  el.startBtn.addEventListener('click', startBattle);
  el.restartBtn.addEventListener('click', newGame);
  el.overlayBtn.addEventListener('click', newGame);

  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r' && state.phase === 'setup') el.rotateBtn.click();
  });

  newGame();
})();
