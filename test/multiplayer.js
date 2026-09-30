/* Headless check of the multiplayer hub: rooms, fleet validation, turn order, disconnects.
   Run with: node test/multiplayer.js */

const { SHIP_TYPES, Board } = require('../js/game.js');
const { Hub } = require('../server/rooms.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeClient(hub, name) {
  const inbox = [];
  const client = hub.connect((message) => inbox.push(message));
  client.name = name;
  client.inbox = inbox;
  client.last = (type) => [...inbox].reverse().find((m) => m.type === type) || null;
  client.send_ = (message) => hub.handle(client, JSON.stringify(message));
  return client;
}

function legalFleet(startRow = 0) {
  return SHIP_TYPES.map((type, index) => ({
    id: type.id,
    row: (startRow + index) % 10,
    col: 0,
    orientation: 'horizontal',
  }));
}

function boardFor(ships) {
  const board = new Board();
  for (const placement of ships) {
    const type = SHIP_TYPES.find((t) => t.id === placement.id);
    board.place(type, placement.row, placement.col, placement.orientation);
  }
  return board;
}

/* --- room lifecycle --- */
{
  const hub = new Hub();
  const host = makeClient(hub, 'host');
  const guest = makeClient(hub, 'guest');

  host.send_({ type: 'create' });
  const room = host.last('room');
  assert(room && room.code.length === 4, 'create should return a 4 character room code');
  assert(room.players === 1, 'a new room holds one player');

  const stranger = makeClient(hub, 'stranger');
  stranger.send_({ type: 'join', code: 'ZZZZ' });
  assert(stranger.last('error'), 'joining an unknown code should error');

  guest.send_({ type: 'join', code: room.code.toLowerCase() });
  assert(guest.last('room').players === 2, 'join should report a full room');
  assert(host.last('place') && guest.last('place'), 'both players are asked to place fleets');

  const third = makeClient(hub, 'third');
  third.send_({ type: 'join', code: room.code });
  assert(third.last('error').message.includes('full'), 'a third player cannot join');
}

/* --- fleet validation --- */
{
  const hub = new Hub();
  const host = makeClient(hub, 'host');
  const guest = makeClient(hub, 'guest');
  host.send_({ type: 'create' });
  guest.send_({ type: 'join', code: host.last('room').code });

  const overlapping = legalFleet().map((ship) => ({ ...ship, row: 0 }));
  host.send_({ type: 'ready', ships: overlapping });
  assert(host.last('error'), 'overlapping fleets are rejected');

  const offBoard = legalFleet().map((ship) => ({ ...ship, col: 8 }));
  host.send_({ type: 'ready', ships: offBoard });
  assert(host.last('error'), 'fleets running off the board are rejected');

  host.send_({ type: 'ready', ships: legalFleet().slice(0, 4) });
  assert(host.last('error'), 'incomplete fleets are rejected');

  host.send_({ type: 'fire', row: 0, col: 0 });
  assert(host.last('error').message.includes('No battle'), 'firing before the battle is rejected');
}

/* --- a full game --- */
{
  const hub = new Hub();
  const host = makeClient(hub, 'host');
  const guest = makeClient(hub, 'guest');
  host.send_({ type: 'create' });
  guest.send_({ type: 'join', code: host.last('room').code });

  const hostShips = legalFleet(0);
  const guestShips = legalFleet(3);

  host.send_({ type: 'ready', ships: hostShips });
  assert(guest.last('opponent-ready'), 'the opponent is told when a fleet is locked in');
  assert(!host.last('start'), 'the battle waits for both fleets');

  guest.send_({ type: 'ready', ships: guestShips });
  assert(host.last('start').yourTurn === true, 'the host fires first');
  assert(guest.last('start').yourTurn === false, 'the guest waits');

  guest.send_({ type: 'fire', row: 0, col: 0 });
  assert(guest.last('error').message.includes('not your turn'), 'firing out of turn is rejected');

  host.send_({ type: 'fire', row: '3', col: 0 });
  assert(host.last('error').message.includes('Invalid target'), 'non-integer coordinates are rejected');
  assert(!host.last('shot'), 'an invalid target does not count as a shot');

  const guestBoard = boardFor(guestShips);
  const targets = [];
  for (const ship of guestBoard.ships) for (const cell of ship.cells) targets.push(cell);

  const hostBoard = boardFor(hostShips);
  const guestMisses = [];
  for (let row = 9; row >= 0; row--) {
    for (let col = 9; col >= 0; col--) if (!hostBoard.shipAt(row, col)) guestMisses.push({ row, col });
  }

  let shots = 0;
  for (const target of targets) {
    host.send_({ type: 'fire', row: target.row, col: target.col });
    const shot = host.last('shot');
    assert(shot.by === 'you' && shot.result === 'hit', 'shots at known ship cells should hit');
    assert(guest.last('shot').by === 'opponent', 'the defender sees the same shot');
    shots += 1;
    if (shots === targets.length) break;

    assert(host.last('turn').yours === false, 'the turn passes to the opponent');
    const miss = guestMisses[shots - 1];
    guest.send_({ type: 'fire', row: miss.row, col: miss.col });
    assert(guest.last('shot').result === 'miss', 'an empty cell is a miss');
    assert(host.last('turn').yours === true, 'the turn comes back to the host');

    if (shots === 1) {
      const errors = host.inbox.filter((m) => m.type === 'error').length;
      host.send_({ type: 'fire', row: target.row, col: target.col });
      assert(host.last('error').message.includes('already fired'), 'repeat shots are rejected');
      assert(host.inbox.filter((m) => m.type === 'error').length === errors + 1, 'repeat shot reports one error');
    }
  }

  const over = host.last('game-over');
  assert(over && over.won === true, 'sinking the last ship wins the game');
  assert(guest.last('game-over').won === false, 'the defender is told they lost');
  assert(guest.last('game-over').fleet.length === SHIP_TYPES.length, 'the loser sees the winning fleet');

  host.send_({ type: 'fire', row: 5, col: 5 });
  assert(host.last('error').message.includes('No battle'), 'the board is closed once the game is over');

  host.send_({ type: 'rematch' });
  assert(host.last('place') && guest.last('place'), 'a rematch returns both players to placement');
  host.send_({ type: 'ready', ships: hostShips });
  guest.send_({ type: 'ready', ships: guestShips });
  assert(host.inbox.filter((m) => m.type === 'start').length === 2, 'the rematch starts a second battle');
}

/* --- disconnects --- */
{
  const hub = new Hub();
  const host = makeClient(hub, 'host');
  const guest = makeClient(hub, 'guest');
  host.send_({ type: 'create' });
  const code = host.last('room').code;
  guest.send_({ type: 'join', code });

  hub.disconnect(guest);
  assert(host.last('opponent-left'), 'the remaining player is told the opponent left');

  const replacement = makeClient(hub, 'replacement');
  replacement.send_({ type: 'join', code });
  assert(replacement.last('room').players === 2, 'someone else can take the empty seat');

  hub.disconnect(host);
  hub.disconnect(replacement);
  assert(hub.rooms.size === 0, 'empty rooms are cleaned up');
}

/* --- malformed input --- */
{
  const hub = new Hub();
  const client = makeClient(hub, 'client');
  hub.handle(client, 'not json');
  assert(client.last('error'), 'malformed payloads are rejected');
  client.send_({ type: 'nonsense' });
  assert(client.last('error').message.includes('Unknown'), 'unknown message types are rejected');
  client.send_({ type: 'ready', ships: legalFleet() });
  assert(client.last('error'), 'placing a fleet outside a room is rejected');
}

console.log('OK — multiplayer hub: rooms, validation, turn order, rematch and disconnects.');
