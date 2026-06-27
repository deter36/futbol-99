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

## Local LLM Coach

The prototype can ask a local coach bridge for Red's choices.

In one terminal, run the game:

```powershell
$env:PORT=8787
node dev-server.js
```

In another terminal, run the coach bridge:

```powershell
node coach-server.js
```

Before the first run, copy `.env.example` to `.env` and put your OpenAI API key in `.env`:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
COACH_PORT=8790
```

`.env` is ignored by git so the key stays local.

Then open:

```text
http://127.0.0.1:8787/
```

Turn on `LLM Auto`. It also enables `Coach Assist`, auto-advances forced Red choices, and asks `http://127.0.0.1:8790/coach-choice` for tactical decisions. If the coach bridge is not running or the API key is missing, the game leaves the prompt/options visible so you can still use copy/paste.

The standing coach instructions live in `coach-system-prompt.md`.

## Source

- `index.html` is the runnable working copy.
- `coach-server.js` is the optional local OpenAI bridge for automated Red coaching.
- `coach-system-prompt.md` contains the standing local coach instructions.
- `printable-pitch.html` is a two-page printable pitch for physical playtesting.
- `dev-server.js` is a tiny static server for local testing.
- `RULES.md` is a shareable rules summary for the current prototype.
- `gametransfer.txt` is the original transferred HTML text and is kept as project history.

## Hosting

This is currently a static site. To host it, upload the project files to GitHub and enable GitHub Pages, or connect the repo to Render as a Static Site.

For Render:

- Build command: leave blank
- Publish directory: `.`
