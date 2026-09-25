# Battleship

Classic 10x10 Battleship in the browser: place your fleet, then trade salvoes with a computer opponent.
No build step, no dependencies — plain HTML, CSS and JavaScript.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

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
| `js/ui.js` | DOM wiring for the setup and battle phases |
| `test/simulate.js` | Headless rule/AI sanity check |

## Tests

```bash
node test/simulate.js
```

Runs 500 simulated games and asserts ships never overlap or leave the board, shots are never repeated, and the AI
always clears the board within 100 shots.

## Roadmap

- Online multiplayer (two players over a WebSocket server).
