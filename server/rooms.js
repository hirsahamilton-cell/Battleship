/* Authoritative multiplayer rules: rooms, fleet validation, turn order.
   Transport-agnostic — a client is anything with a send(message) function. */

const { SHIP_TYPES, Board } = require('../js/game.js');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

function randomCode(random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

function fleetFrom(ships) {
  if (!Array.isArray(ships) || ships.length !== SHIP_TYPES.length) return null;
  const board = new Board();
  for (const type of SHIP_TYPES) {
    const placement = ships.find((ship) => ship && ship.id === type.id);
    if (!placement) return null;
    const { row, col, orientation } = placement;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
    if (orientation !== 'horizontal' && orientation !== 'vertical') return null;
    if (!board.place(type, row, col, orientation)) return null;
  }
  return board;
}

function fleetLayout(board) {
  return board.ships.map((ship) => ({ id: ship.id, name: ship.name, cells: ship.cells }));
}

class Hub {
  constructor({ random = Math.random } = {}) {
    this.rooms = new Map();
    this.random = random;
    this.nextClientId = 1;
  }

  connect(send) {
    return { id: this.nextClientId++, send, room: null, board: null, ready: false };
  }

  handle(client, raw) {
    let message = raw;
    if (typeof raw === 'string') {
      try {
        message = JSON.parse(raw);
      } catch (err) {
        return this.fail(client, 'Malformed message.');
      }
    }
    if (!message || typeof message.type !== 'string') return this.fail(client, 'Malformed message.');

    switch (message.type) {
      case 'create':
        return this.create(client);
      case 'join':
        return this.join(client, message.code);
      case 'ready':
        return this.ready(client, message.ships);
      case 'fire':
        return this.fire(client, message.row, message.col);
      case 'rematch':
        return this.rematch(client);
      case 'leave':
        return this.disconnect(client);
      default:
        return this.fail(client, `Unknown message type: ${message.type}`);
    }
  }

  fail(client, reason) {
    client.send({ type: 'error', message: reason });
  }

  freeCode() {
    let code = randomCode(this.random);
    while (this.rooms.has(code)) code = randomCode(this.random);
    return code;
  }

  create(client) {
    if (client.room) return this.fail(client, 'You are already in a room.');
    const code = this.freeCode();
    const room = { code, clients: [client], phase: 'waiting', turn: null };
    this.rooms.set(code, room);
    client.room = room;
    client.send({ type: 'room', code, players: 1, host: true });
  }

  join(client, code) {
    if (client.room) return this.fail(client, 'You are already in a room.');
    const room = this.rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return this.fail(client, 'No room with that code.');
    if (room.clients.length >= 2) return this.fail(client, 'That room is full.');

    room.clients.push(client);
    client.room = room;
    room.phase = 'placing';
    for (const member of room.clients) {
      member.send({ type: 'room', code: room.code, players: 2, host: member === room.clients[0] });
      member.send({ type: 'place' });
    }
  }

  opponentOf(client) {
    if (!client.room) return null;
    return client.room.clients.find((member) => member !== client) || null;
  }

  ready(client, ships) {
    const room = client.room;
    if (!room || room.phase !== 'placing') return this.fail(client, 'Not ready for fleet placement.');
    const board = fleetFrom(ships);
    if (!board) return this.fail(client, 'That fleet is not a legal placement.');

    client.board = board;
    client.ready = true;

    const opponent = this.opponentOf(client);
    if (!opponent || !opponent.ready) {
      if (opponent) opponent.send({ type: 'opponent-ready' });
      client.send({ type: 'waiting' });
      return;
    }

    room.phase = 'battle';
    room.turn = room.clients[0].id;
    for (const member of room.clients) {
      member.send({ type: 'start', yourTurn: member.id === room.turn });
    }
  }

  fire(client, row, col) {
    const room = client.room;
    if (!room || room.phase !== 'battle') return this.fail(client, 'No battle in progress.');
    if (room.turn !== client.id) return this.fail(client, 'It is not your turn.');

    if (!Number.isInteger(row) || !Number.isInteger(col)) return this.fail(client, 'Invalid target.');
    const opponent = this.opponentOf(client);
    if (!opponent) return this.fail(client, 'Your opponent left.');

    const shot = opponent.board.receiveShot(row, col);
    if (!shot) return this.fail(client, 'You already fired at that cell.');

    const payload = {
      type: 'shot',
      row: shot.row,
      col: shot.col,
      result: shot.result,
      sunk: shot.sunk,
      ship: shot.ship ? shot.ship.name : null,
      cells: shot.sunk ? shot.ship.cells : null,
    };
    client.send({ ...payload, by: 'you' });
    opponent.send({ ...payload, by: 'opponent' });

    if (opponent.board.allSunk()) {
      room.phase = 'over';
      room.turn = null;
      client.send({ type: 'game-over', won: true, fleet: fleetLayout(opponent.board) });
      opponent.send({ type: 'game-over', won: false, fleet: fleetLayout(client.board) });
      return;
    }

    room.turn = opponent.id;
    client.send({ type: 'turn', yours: false });
    opponent.send({ type: 'turn', yours: true });
  }

  rematch(client) {
    const room = client.room;
    if (!room || room.phase !== 'over') return this.fail(client, 'No finished game to replay.');
    room.phase = 'placing';
    room.turn = null;
    for (const member of room.clients) {
      member.board = null;
      member.ready = false;
      member.send({ type: 'place' });
    }
  }

  disconnect(client) {
    const room = client.room;
    client.room = null;
    client.board = null;
    client.ready = false;
    if (!room) return;

    room.clients = room.clients.filter((member) => member !== client);
    if (room.clients.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    room.phase = 'waiting';
    room.turn = null;
    for (const member of room.clients) {
      member.board = null;
      member.ready = false;
      member.send({ type: 'opponent-left', code: room.code });
    }
  }
}

module.exports = { Hub, fleetFrom, randomCode };
