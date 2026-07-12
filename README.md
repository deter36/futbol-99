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

In one terminal, run the game from this folder:

```powershell
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
COACH_MAX_SESSION_MESSAGES=20
```

`.env` is ignored by git so the key stays local.

Then open:

```text
http://127.0.0.1:8765/
```

Turn on `LLM Auto`. It also enables `Coach Assist`, auto-advances forced Red choices, and asks `http://127.0.0.1:8790/coach-choice` for tactical decisions. The browser creates a fresh coach session for each new match so the local bridge can keep a rolling conversation and tactical memory for Red. If the coach bridge is not running or the API key is missing, the game leaves the prompt/options visible so you can still use copy/paste.

The standing coach instructions live in `coach-system-prompt.md`.

## Friendly Multiplayer Relay

For remote playtesting, run the game server and the local relay:

```powershell
node dev-server.js
node multiplayer-server.js
```

Then open:

```text
http://127.0.0.1:8765/
```

Both players use the same room code in `Friendly Room`, choose a side, and click `Connect Room`. The relay defaults to:

```text
http://127.0.0.1:8795
```

This is a lightweight trust-based playtest relay. It broadcasts game-state snapshots after logged play events so the other browser can follow each committed step, but it is not a secure hidden-information server.

To test with friends over the internet, deploy `multiplayer-server.js` as a Render Web Service:

- Service type: `Web Service`
- Runtime: `Node`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

The included `render.yaml` has those settings. After Render deploys, copy the public Render URL into the game's relay URL field, for example:

```text
https://futbol-99-relay.onrender.com
```

## Source

- `index.html` is the runnable working copy.
- `coach-server.js` is the optional local OpenAI bridge for automated Red coaching.
- `coach-system-prompt.md` contains the standing local coach instructions.
- `multiplayer-server.js` is the local friendly-room relay for trust-based remote playtesting.
- `printable-pitch.html` is a two-page printable pitch for physical playtesting.
- `printable-cards.html` is a 12-card starter deck sheet at 2.5in x 3.5in sleeve size.
- `printable-player-aids.html` is a two-copy rules reference for table play.
- `dev-server.js` is a tiny static server for local testing.
- `RULES.md` is a shareable rules summary for the current prototype.
- `gametransfer.txt` is the original transferred HTML text and is kept as project history.

## Working Copy

Use this folder as the source of truth:

```text
C:\Users\shepp\OneDrive\Documents\Coding\futbol-99-push
```

Older folders such as `Slay the Pitch` and `C:\Users\shepp\futbol-99` are archival only.

## Hosting

This is currently a static site. To host it, upload the project files to GitHub and enable GitHub Pages, or connect the repo to Render as a Static Site.

For Render:

- Build command: leave blank
- Publish directory: `.`
