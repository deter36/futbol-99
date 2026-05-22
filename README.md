# Futbol '99

Futbol '99 is a two-player tactical soccer card game prototype. The HTML version is mainly a playtest tool for the physical-card-game rules.

The current design uses a fixed 12-card command deck, lane/third positioning, planned card resolution, marking, tackling, passing, and shooting. The upgrade/deckbuilding system is paused while the base game is tested.

## Run

Open `index.html` directly in a browser, or run the local Node server:

```powershell
node dev-server.js
```

Then open:

```text
http://127.0.0.1:8765/
```

## Source Files

### Root

| File | What it does |
|------|-------------|
| `index.html` | The game page — just HTML markup that loads the styles and scripts below |
| `printable-pitch.html` | A two-page printable pitch for physical playtesting |
| `dev-server.js` | Tiny static server for local testing |
| `RULES.md` | Shareable rules summary for the current prototype |

### styles/

| File | What it does |
|------|-------------|
| `layout.css` | Page structure, header, grid, buttons, game log, responsive breakpoints |
| `pitch.css` | Soccer field container, hex cells, zone coloring, player tokens |
| `cards.css` | Card appearance, hand/market containers, planned cards area, action panel |
| `animations.css` | Keyframe animations (pulse, etc.) |

### game/

Scripts load in this order — each one builds on the ones above it.

| File | What it does |
|------|-------------|
| `settings.js` | Game constants (field size, hand size, card types and colors) |
| `state.js` | The central game-state object that everything reads and writes |
| `pitch-math.js` | Hex math (distance, adjacency, pathfinding), cell lookups, draw/shuffle, marks |
| `card-definitions.js` | Card data (the 12 starter cards, market cards) and card factory helpers |
| `deck-management.js` | Shuffling, drawing, and discarding cards |
| `rules.js` | Core game mechanics — turns, passing, shooting, tackles, marking, crosses, clears |
| `ai-opponent.js` | How the computer decides what to do (move, pass, shoot, buy) |
| `display.js` | Drawing the field, cards, and scoreboard on screen |
| `startup.js` | Kicks off the game, hooks up buttons and keyboard |

### sim/

Python scripts for running game simulations and balancing experiments.

| File | What it does |
|------|-------------|
| `simulate.py` | Core simulation engine — plays games without a browser |
| `run_matrix.py` | Runs parameter sweeps across move/shot combos |
| `run_focused_matrix.py` | Targeted simulations for specific balance questions |
| `results/` | CSV output from simulation runs |

## Hosting

This is currently a static site. To host it, upload the project files to GitHub and enable GitHub Pages, or connect the repo to Render as a Static Site.

For Render:

- Build command: leave blank
- Publish directory: `.`
