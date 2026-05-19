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

## Source

- `index.html` is the runnable working copy.
- `printable-pitch.html` is a two-page printable pitch for physical playtesting.
- `dev-server.js` is a tiny static server for local testing.
- `RULES.md` is a shareable rules summary for the current prototype.
- `gametransfer.txt` is the original transferred HTML text and is kept as project history.

## Hosting

This is currently a static site. To host it, upload the project files to GitHub and enable GitHub Pages, or connect the repo to Render as a Static Site.

For Render:

- Build command: leave blank
- Publish directory: `.`
