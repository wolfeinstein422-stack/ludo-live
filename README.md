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
1. Change `ludo-live.html`.
2. Run `python3 build.py ludo-live.html`.
3. Commit and push (including the regenerated `index.html` and `sw.js`). GitHub Pages republishes in about a minute.

## One-time Firebase setup
1. Authentication → Sign-in method → enable **Anonymous**.
2. Firestore Database → Rules → paste `firestore.rules` → **Publish**.
3. Firestore Database → **Time-to-live** → add a policy on collection group `games`, field `expireAt`, so tables nobody touches for a day are cleaned up.
4. Authentication → Settings → **Authorized domains** → add your GitHub Pages domain (for example `yourname.github.io`).
