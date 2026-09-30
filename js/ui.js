/* Wires the game core, the AI and the online hub to the DOM:
   placement phase, firing, log and end state. */

(function () {
  const { BOARD_SIZE, SHIP_TYPES, Board, ComputerPlayer, NetClient, shipCells } = window.Battleship;

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
    modeAiBtn: document.getElementById('mode-ai'),
    modeOnlineBtn: document.getElementById('mode-online'),
    onlinePanel: document.getElementById('online-panel'),
    createRoomBtn: document.getElementById('create-room-btn'),
    joinRoomBtn: document.getElementById('join-room-btn'),
    joinCode: document.getElementById('join-code'),
    onlineStatus: document.getElementById('online-status'),
    roomCode: document.getElementById('room-code'),
  };

  const COLUMN_LABELS = 'ABCDEFGHIJ';
  const coord = (row, col) => `${COLUMN_LABELS[col]}${row + 1}`;
  const key = (row, col) => `${row},${col}`;

  const state = {
    mode: 'ai',
    phase: 'setup',
    orientation: 'horizontal',
    selectedShipId: SHIP_TYPES[0].id,
    playerBoard: new Board(),
    enemyBoard: new Board(),
    ai: new ComputerPlayer(Math.min(...SHIP_TYPES.map((s) => s.size))),
    busy: false,
    enemyTurnTimer: null,
    online: {
      net: null,
      code: null,
      inRoom: false,
      canReady: false,
      fleetLocked: false,
      yourTurn: false,
      marks: new Map(),
      enemySunk: 0,
    },
  };

  const playerCells = [];
  const enemyCells = [];

  const isOnline = () => state.mode === 'online';
  const canEditFleet = () => state.phase === 'setup' && !state.online.fleetLocked;

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
        state.selectedShipId === type.id && canEditFleet() ? 'selected' : '',
        ship && ship.hits >= ship.size ? 'sunk' : '',
      ]
        .filter(Boolean)
        .join(' ');
      item.innerHTML = `<span>${type.name}</span><span class="pips">${'<i></i>'.repeat(type.size)}</span>`;
      if (canEditFleet()) {
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
        cell.className = 'cell';
        if (isOnline()) {
          const mark = state.online.marks.get(key(row, col));
          if (mark) cell.classList.add(mark);
          continue;
        }
        const shot = state.enemyBoard.shotAt(row, col);
        const ship = state.enemyBoard.shipAt(row, col);
        if (shot === 'miss') cell.classList.add('miss');
        if (shot === 'hit') cell.classList.add(ship && ship.hits >= ship.size ? 'sunk' : 'hit');
      }
    }
  }

  function clearPreview() {
    for (const cell of playerCells) cell.classList.remove('preview', 'preview-bad');
  }

  function previewPlacement(row, col) {
    if (!canEditFleet()) return;
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
    if (!canEditFleet()) return;
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
    const canStart = allPlaced && canEditFleet() && (!isOnline() || state.online.canReady);
    el.startBtn.disabled = !canStart;
    if (state.phase === 'setup') {
      if (isOnline() && !state.online.inRoom) {
        setStatus('Create a room or join one with a code.');
      } else if (isOnline() && !state.online.canReady) {
        setStatus('Waiting for an opponent to join...');
      } else {
        setStatus(allPlaced ? 'Fleet ready — start the battle.' : 'Place your fleet to begin.');
      }
    }
    updateCounters();
  }

  function updateCounters() {
    const setup = state.phase === 'setup';
    el.playerRemaining.textContent = String(setup ? SHIP_TYPES.length : state.playerBoard.remainingShips().length);
    if (setup) {
      el.enemyRemaining.textContent = String(SHIP_TYPES.length);
    } else if (isOnline()) {
      el.enemyRemaining.textContent = String(SHIP_TYPES.length - state.online.enemySunk);
    } else {
      el.enemyRemaining.textContent = String(state.enemyBoard.remainingShips().length);
    }
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

  function lockSetupControls(locked) {
    el.rotateBtn.disabled = locked;
    el.randomBtn.disabled = locked;
    el.resetBtn.disabled = locked;
  }

  function startBattle() {
    if (state.playerBoard.ships.length !== SHIP_TYPES.length) return;
    if (isOnline()) {
      sendFleet();
      return;
    }
    state.enemyBoard.placeRandomly(SHIP_TYPES);
    state.ai.reset();
    state.phase = 'battle';
    el.enemyBoard.classList.remove('locked');
    el.startBtn.disabled = true;
    lockSetupControls(true);
    el.setupHint.textContent = 'Click enemy waters to fire.';
    renderFleet();
    updateCounters();
    setStatus('Your turn — fire at enemy waters.');
    addLog('Battle stations! Enemy fleet deployed.');
  }

  function playerFire(row, col) {
    if (state.phase !== 'battle') return;
    if (isOnline()) {
      if (!state.online.yourTurn || state.online.marks.has(key(row, col))) return;
      state.online.yourTurn = false;
      setStatus('Opponent is taking aim...');
      state.online.net.send({ type: 'fire', row, col });
      return;
    }
    if (state.busy) return;
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
    if (state.phase !== 'battle' || isOnline()) return;
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
    if (!isOnline()) revealEnemyFleet();
    setStatus(playerWon ? 'You win!' : 'Your fleet was destroyed.');
    el.overlayTitle.textContent = playerWon ? 'Victory' : 'Defeat';
    el.overlayText.textContent = playerWon
      ? 'The enemy fleet lies at the bottom of the sea.'
      : 'Every one of your ships has been sunk.';
    el.overlayBtn.textContent = isOnline() ? 'Rematch' : 'Play again';
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

  function resetBoards() {
    clearTimeout(state.enemyTurnTimer);
    state.enemyTurnTimer = null;
    state.phase = 'setup';
    state.orientation = 'horizontal';
    state.selectedShipId = SHIP_TYPES[0].id;
    state.playerBoard = new Board();
    state.enemyBoard = new Board();
    state.ai.reset();
    state.busy = false;
    state.online.marks = new Map();
    state.online.enemySunk = 0;
    state.online.yourTurn = false;
    state.online.fleetLocked = false;

    el.overlay.classList.add('hidden');
    el.enemyBoard.classList.add('locked');
    lockSetupControls(false);
    el.setupHint.textContent = 'Pick a ship, hover your waters, click to place.';

    renderPlayerBoard();
    renderEnemyBoard();
    renderFleet();
    updateSetupControls();
  }

  function newGame() {
    if (isOnline()) {
      leaveRoom();
      el.log.innerHTML = '';
      resetBoards();
      return;
    }
    el.log.innerHTML = '';
    resetBoards();
  }

  /* ---- online play ---- */

  function setOnlineStatus(text) {
    el.onlineStatus.textContent = text;
  }

  function showRoomCode(code) {
    state.online.code = code;
    el.roomCode.textContent = code || '';
    el.roomCode.classList.toggle('hidden', !code);
  }

  function ensureConnection() {
    if (!state.online.net) {
      state.online.net = new NetClient(handleServerMessage, handleDisconnect);
    }
    return state.online.net.connect();
  }

  function withConnection(action) {
    setOnlineStatus('Connecting...');
    ensureConnection().then(
      () => {
        setOnlineStatus('');
        action();
      },
      () => {
        setOnlineStatus('Could not reach the game server. Start it with "npm start" and reload.');
      }
    );
  }

  function sendFleet() {
    const ships = state.playerBoard.ships.map((ship) => ({
      id: ship.id,
      row: ship.cells[0].row,
      col: ship.cells[0].col,
      orientation: ship.orientation,
    }));
    state.online.net.send({ type: 'ready', ships });
    state.online.fleetLocked = true;
    clearPreview();
    renderFleet();
    el.startBtn.disabled = true;
    lockSetupControls(true);
    setStatus('Fleet locked in — waiting for your opponent.');
  }

  function leaveRoom() {
    if (state.online.net) state.online.net.close();
    state.online.net = null;
    state.online.inRoom = false;
    state.online.canReady = false;
    showRoomCode(null);
    setOnlineStatus('');
  }

  function handleDisconnect() {
    if (!isOnline()) return;
    state.online.inRoom = false;
    state.online.canReady = false;
    showRoomCode(null);
    setOnlineStatus('Disconnected from the game server.');
  }

  function handleServerMessage(message) {
    if (message.type !== 'error' && message.type !== 'room' && message.type !== 'opponent-left') setOnlineStatus('');
    switch (message.type) {
      case 'room':
        state.online.inRoom = true;
        state.online.canReady = message.players === 2;
        showRoomCode(message.code);
        setOnlineStatus(
          message.players === 2 ? 'Opponent connected.' : 'Share this code with your opponent.'
        );
        updateSetupControls();
        break;

      case 'place':
        el.log.innerHTML = '';
        state.online.canReady = true;
        resetBoards();
        addLog('Opponent connected — place your fleet.');
        break;

      case 'opponent-ready':
        addLog('Opponent has placed their fleet.', 'enemy');
        break;

      case 'waiting':
        setStatus('Fleet locked in — waiting for your opponent.');
        break;

      case 'start':
        state.phase = 'battle';
        state.online.yourTurn = !!message.yourTurn;
        el.enemyBoard.classList.toggle('locked', !message.yourTurn);
        el.startBtn.disabled = true;
        lockSetupControls(true);
        el.setupHint.textContent = 'Click enemy waters to fire.';
        renderFleet();
        updateCounters();
        addLog('Battle stations! Both fleets are deployed.');
        setStatus(message.yourTurn ? 'Your turn — fire at enemy waters.' : 'Opponent fires first.');
        break;

      case 'shot':
        applyOnlineShot(message);
        break;

      case 'turn':
        state.online.yourTurn = !!message.yours;
        el.enemyBoard.classList.toggle('locked', !message.yours);
        setStatus(message.yours ? 'Your turn — fire at enemy waters.' : 'Opponent is taking aim...');
        break;

      case 'game-over':
        if (message.fleet) revealOnlineFleet(message.fleet, message.won);
        endGame(!!message.won);
        break;

      case 'opponent-left':
        state.online.canReady = false;
        addLog('Opponent left the room.', 'enemy');
        setOnlineStatus('Opponent left — waiting for someone to join with your code.');
        el.overlay.classList.add('hidden');
        resetBoards();
        break;

      case 'error':
        setOnlineStatus(message.message);
        if (state.phase === 'battle' && !state.online.yourTurn && message.message.includes('already fired')) {
          state.online.yourTurn = true;
          setStatus('Your turn — fire at enemy waters.');
        }
        break;

      default:
        break;
    }
  }

  function applyOnlineShot(message) {
    const { row, col, result, sunk, ship, by } = message;
    if (by === 'you') {
      const mark = result === 'hit' ? (sunk ? 'sunk' : 'hit') : 'miss';
      state.online.marks.set(key(row, col), mark);
      if (sunk && Array.isArray(message.cells)) {
        for (const c of message.cells) state.online.marks.set(key(c.row, c.col), 'sunk');
        state.online.enemySunk += 1;
      }
      renderEnemyBoard();
      addLog(
        result === 'hit'
          ? sunk
            ? `You sank the enemy ${ship} at ${coord(row, col)}!`
            : `Hit at ${coord(row, col)}.`
          : `Miss at ${coord(row, col)}.`
      );
    } else {
      state.playerBoard.receiveShot(row, col);
      renderPlayerBoard();
      renderFleet();
      addLog(
        result === 'hit'
          ? sunk
            ? `Opponent sank your ${ship} at ${coord(row, col)}!`
            : `Opponent hit your ${ship} at ${coord(row, col)}.`
          : `Opponent missed at ${coord(row, col)}.`,
        'enemy'
      );
    }
    updateCounters();
  }

  function revealOnlineFleet(fleet, won) {
    if (won) return;
    for (const ship of fleet) {
      for (const c of ship.cells) {
        if (!state.online.marks.has(key(c.row, c.col))) state.online.marks.set(key(c.row, c.col), 'ship');
      }
    }
    renderEnemyBoard();
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    if (isOnline()) leaveRoom();
    state.mode = mode;
    el.modeAiBtn.classList.toggle('active', mode === 'ai');
    el.modeOnlineBtn.classList.toggle('active', mode === 'online');
    el.onlinePanel.classList.toggle('hidden', mode !== 'online');
    el.log.innerHTML = '';
    resetBoards();
  }

  /* ---- wiring ---- */

  buildGrid(el.playerBoard, playerCells, handlePlacement, previewPlacement, clearPreview);
  buildGrid(el.enemyBoard, enemyCells, playerFire);

  el.rotateBtn.addEventListener('click', () => {
    if (!canEditFleet()) return;
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

  el.overlayBtn.addEventListener('click', () => {
    if (isOnline() && state.online.net && state.online.net.connected) {
      state.online.net.send({ type: 'rematch' });
      el.overlay.classList.add('hidden');
      setStatus('Waiting for the rematch...');
      return;
    }
    newGame();
  });

  el.modeAiBtn.addEventListener('click', () => setMode('ai'));
  el.modeOnlineBtn.addEventListener('click', () => setMode('online'));

  el.createRoomBtn.addEventListener('click', () => {
    withConnection(() => state.online.net.send({ type: 'create' }));
  });

  el.joinRoomBtn.addEventListener('click', () => {
    const code = el.joinCode.value.trim().toUpperCase();
    if (!code) {
      setOnlineStatus('Enter a room code first.');
      return;
    }
    withConnection(() => state.online.net.send({ type: 'join', code }));
  });

  el.joinCode.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') el.joinRoomBtn.click();
  });

  document.addEventListener('keydown', (event) => {
    if (event.target === el.joinCode) return;
    if (event.key.toLowerCase() === 'r' && canEditFleet()) el.rotateBtn.click();
  });

  newGame();
})();
