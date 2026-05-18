# Futbol '99

Futbol '99 is a soccer simulator played through cardplay and deckbuilding mechanics. Outmaneuver and outwit your opponent with tactical gameplay and abstracted soccer strategies.

This repo currently contains an HTML/CSS/JavaScript tactical soccer card game prototype.

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

- `gametransfer.txt` is the original transferred HTML text.
- `index.html` is the runnable working copy.
- `dev-server.js` is a tiny static server for local testing.
- `RULES.md` is a shareable rules summary for the current prototype.

## Hosting

This is currently a static site. To host it, upload the project files to GitHub and enable GitHub Pages, or connect the repo to Render as a Static Site.

For Render:

- Build command: leave blank
- Publish directory: `.`
