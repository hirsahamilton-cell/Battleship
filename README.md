# Battleship

Classic 10x10 Battleship in the browser: place your fleet, then trade salvoes with a computer opponent or
another player online. No build step — plain HTML, CSS and JavaScript, plus a small Node server for online play.

## Play

```bash
npm install
npm start
# then visit http://localhost:8080   (set PORT to change it)
```

The server hosts the page and the multiplayer WebSocket hub. For computer-only play you can also open `index.html`
directly or serve the folder with any static server (`python3 -m http.server 8000`).

### Online play

1. Pick **Online** at the top of the left panel.
2. One player clicks **Create room** and shares the 4-character code.
3. The other player types the code and clicks **Join**.
4. Both place their fleets and press **Start battle**; the room creator fires first. After the game, **Rematch**
   replays in the same room.

Both players must reach the same server. For play over the internet, deploy the server to any Node host
(Render, Railway, Fly.io, a VPS) or expose a local one with a tunnel.

The server is authoritative: it validates fleets, enforces turn order and resolves every shot, so a client never sees
the opponent's ship positions until the game ends.

## How to play

1. **Place your fleet** — pick a ship in the left panel, hover your waters for a placement preview, click to drop it.
   Press `R` (or the Rotate button) to switch between horizontal and vertical. `Random fleet` places everything for you.
2. **Start battle** — the enemy fleet is deployed at random.
3. **Fire** — click a cell in enemy waters. Hits, misses and sinkings appear in the battle log; the first fleet to lose
   all five ships loses.

Fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Styling |
| `js/game.js` | Board state and rules (placement, firing, sinking) — no DOM access |
| `js/ai.js` | Computer opponent: parity hunting, then targeting along a line of hits |
| `js/net.js` | WebSocket client for online play |
| `js/ui.js` | DOM wiring for the setup and battle phases, AI and online modes |
| `server/rooms.js` | Multiplayer rules: rooms, fleet validation, turns, rematch, disconnects |
| `server/server.js` | Static file server + WebSocket hub |
| `test/simulate.js` | Headless rule/AI sanity check |
| `test/multiplayer.js` | Headless multiplayer hub check |

## Tests

```bash
npm test
```

`test/simulate.js` runs 500 simulated games and asserts ships never overlap or leave the board, shots are never
repeated, and the AI always clears the board within 100 shots. `test/multiplayer.js` drives the room hub through
joins, illegal fleets, out-of-turn and repeat shots, a full game, rematch and disconnects.
