# Ludo Live

Online Ludo for 2–4 players with characters, settings, board skins and bots. Create a table, share the 5-letter code, and play live, or pass and play on one device.

## How it's put together
- `ludo-live.html`: the game source. The same file runs inside Claude and on this site.
- `build.py`: wraps the source into `index.html`, the page GitHub Pages serves.
- `config.js`: the Firebase web config for online tables (public by design).
- `firestore.rules`: who may read and change tables and reactions.
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`: lets the site be installed like an app.
- `sw.template.js`: offline support. `build.py` turns it into `sw.js` with a fresh version stamp, so every update replaces the saved copy on players' devices.

## Updating the game
1. Change `ludo-live.html` (the readable source; the Claude version uses it as is).
2. `npm install` once, then `python3 build.py ludo-live.html`. This writes a minified `index.html` and a new `sw.js` version.
3. `npm test` runs the rule, dice and browser checks.
4. Commit and push. GitHub Pages republishes in about a minute. Players who have the app saved see a
   "new version is ready" prompt and switch with one tap.

## Automatic tests
`.github/workflows/test.yml` runs on every push: the rules and dice simulations, a check that `index.html`
was rebuilt from the current source, and a real-browser run of Pass and play, tap-to-roll, captures,
two-player online play (against a stand-in Firebase) and offline reopening. Results show as a green tick
or red cross next to each commit on GitHub.

## One-time Firebase setup
1. Authentication → Sign-in method → enable **Anonymous**.
2. Firestore Database → Rules → paste `firestore.rules` → **Publish**.
3. Firestore Database → **Time-to-live** → add a policy on collection group `games`, field `expireAt`, so tables nobody touches for a day are cleaned up.
4. Authentication → Settings → **Authorized domains** → add your GitHub Pages domain (for example `yourname.github.io`).
