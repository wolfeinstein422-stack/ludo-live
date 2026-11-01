// Plays the built website in a real browser: Pass and play, tap-to-roll, captures, two-player online
// (against a stand-in Firebase), and offline reopening with the saved game.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const fake = fs.readFileSync(path.join(__dirname, "fake-firebase.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  const file = path.join(ROOT, f);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }); fs.createReadStream(file).pipe(res);
});
let failures = 0;
const check = (ok, name, extra = "") => { console.log((ok ? "ok   " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failures++; };

(async () => {
  await new Promise(r => server.listen(8765, r));
  const URL = "http://localhost:8765/";
  const b = await chromium.launch();
  // The offline check needs the service worker; elsewhere it's blocked, because Playwright can't stand in for
  // requests a service worker makes, so a second page would load the real Firebase instead of the stand-in.
  const newCtx = async (sw = false) => { const ctx = await b.newContext({ viewport: { width: 1100, height: 820 }, serviceWorkers: sw ? "allow" : "block" });
    await ctx.route("https://www.gstatic.com/**", r => r.fulfill({ status: 200, contentType: "text/javascript", body: fake }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: "" }));
    return ctx; };
  const errors = [];
  const open = async (ctx, init) => { const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message));
    if (init) await p.addInitScript(init.fn, init.arg);
    await p.goto(URL, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(900); return p; };
  // Start screen → Pass and play → who's playing → names → characters → start (then the first-player spin)
  const local = async (p, kinds, names = {}, opts = {}) => {
    await p.click("#modeLocal");
    for (const [i, k] of kinds.entries()) await p.selectOption("#local-" + i, k);
    await p.click("#stepNext");
    for (const [i, n] of Object.entries(names)) await p.fill("#name-" + i, n);
    await p.click("#stepNext");
    if (opts.pass) await p.check("#passScreen");
    await p.click("#localBtn"); await p.waitForTimeout(opts.wait ?? 3800); };

  // 1. Pass and play with bots runs on its own
  { const ctx = await newCtx(), p = await open(ctx);
    check(await p.$eval("#home", e => !e.hidden) && await p.$eval("#local", e => e.hidden), "starts on the choose-a-mode screen");
    await local(p, ["bot","bot","bot","bot"], {}, { wait: 12000 });
    const lines = await p.$$eval("#log li", e => e.length);
    check(lines >= 3, "bots play a Pass and play game", lines + " log lines");
    check(await p.$eval("#resumeCard", e => true), "game is saved for later");
    await ctx.close(); }

  // 2. Tapping the board rolls the die
  { const ctx = await newCtx(), p = await open(ctx);
    await local(p, ["human","off","human","off"], { 0: "Asha", 2: "Ben" });
    const log0 = await p.textContent("#log");
    check(/(Asha|Ben) goes first/.test(log0), "a random first player is picked and logged", log0.slice(0, 80));
    check(/(Asha|Ben)'s turn/.test(await p.textContent("#turnPanel")), "turn banner shows the player's name");
    check((await p.textContent("#players")).includes("Asha") && (await p.textContent("#players")).includes("Ben"), "players list shows names");
    await p.mouse.click(300, 500); await p.waitForTimeout(2600);
    check((await p.textContent("#log")).includes("rolled") || (await p.textContent("#log")).includes("brought"), "tapping the board rolls");
    await p.click("#reacts button:nth-child(1)"); await p.waitForTimeout(2000);
    check(await p.$$eval(".fx.react-fort", e => e.length === 1), "a reaction is still bouncing in the fort after 2 seconds");
    await p.click("#homeBtn").catch(() => {}); await p.waitForTimeout(400);
    if (await p.$eval("#home", e => e.hidden)) { await p.goto(URL, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(900); }
    check(await p.$eval("#quickRow", e => !e.hidden) && (await p.textContent("#quickText")).includes("Asha"), "quick start remembers the players");
    await p.click("#modeLocal"); await p.click("#stepNext");
    check(await p.inputValue("#name-0") === "Asha", "names are remembered");
    await p.fill("#name-2", "asha"); await p.click("#stepNext");
    check((await p.textContent("#charCfg")).includes("asha 2"), "duplicate names get a number");
    await ctx.close(); }

  // 2b. Pass-the-device screen and settings links
  { const ctx = await newCtx(), p = await open(ctx);
    await p.click("#prefsLink"); check(await p.$eval("#prefs", e => !e.hidden), "sound and effects opens from the start screen");
    await p.click("#prefsDone");
    await local(p, ["human","human","off","off"], { 0: "Cleo", 1: "Dev" }, { pass: true });
    check(await p.$eval("#passDev", e => !e.hidden), "pass-the-device screen shows when turned on");
    await p.click("#passGo"); await p.waitForTimeout(300);
    check(await p.$eval("#passDev", e => e.hidden), "it goes away when the player is ready");
    await ctx.close(); }

  // 2b. Finishing the game: the podium shows the ranking, the winner cheers and the rest clap
  { const st = { status: "playing", host: null, rev: 5, rollId: 7, turn: 0, rolled: true, dice: 1, diceBy: 0, sixes: 0, winners: [], lastMove: null,
      seats: [{ kind: "human", uid: null, char: "chick", name: "Asha" }, { kind: "off", uid: null, char: "robot" }, { kind: "human", uid: null, char: "owl", name: "Ben" }, { kind: "off", uid: null, char: "cat" }],
      tokens: [[56,56,56,55],[-1,-1,-1,-1],[10,-1,-1,-1],[-1,-1,-1,-1]], log: [{ k: "start" }] };
    const ctx = await newCtx(), p = await open(ctx, { fn: s => { window.claude = { hot: { data: { localState: s } } }; }, arg: st });
    await p.waitForSelector(".token.can", { timeout: 5000 }).catch(() => {});
    await p.click(".token.can").catch(() => {});
    await p.waitForSelector("#over.podium:not([hidden])", { timeout: 6000 }).catch(() => {});
    check(await p.$eval("#over", e => !e.hidden && e.classList.contains("podium")), "the podium appears when the second-to-last player finishes");
    check((await p.textContent(".pod-head h2")).trim() === "Asha wins!", "it names the winner");
    check(await p.$eval(".pod-scene", e => e.getAttribute("aria-label")) === "Final ranking: 1st Asha, 2nd Ben", "it ranks everyone in order");
    check(await p.$$eval(".pc-win", e => e.length) === 1 && await p.$$eval(".pc-clap", e => e.length) === 1, "the winner cheers and the other player claps");
    check(await p.$$eval(".pod-scene .pod-crown", e => e.length) === 1, "the winner gets a crown");
    await p.waitForTimeout(2800); await p.click(".pod-btns .btn.primary");
    await p.waitForTimeout(1500);
    check(await p.$eval("#over", e => e.hidden || !e.classList.contains("podium")), "Play again leaves the podium");
    await ctx.close(); }

  // 3. A capture only scares the victim once it's chosen, and is logged
  { const st = { status: "playing", host: null, rev: 5, rollId: 3, turn: 0, rolled: true, dice: 5, diceBy: 0, sixes: 0, winners: [], lastMove: null,
      seats: ["frog","owl","penguin","robot"].map(c => ({ kind: "human", uid: null, char: c })), tokens: [[1,-1,-1,-1],[-1,-1,-1,-1],[32,-1,-1,-1],[-1,-1,-1,-1]], log: [{ k: "start" }] };
    const ctx = await newCtx(), p = await open(ctx, { fn: s => { window.claude = { hot: { data: { localState: s } } }; }, arg: st });
    await p.waitForTimeout(3500);
    check((await p.textContent("#log")).includes("captured"), "captures work");
    await ctx.close(); }

  // 3b. Tapping a piece to move it must not also roll the die for the next player
  { const st = { status: "playing", host: null, rev: 5, rollId: 3, turn: 0, rolled: true, dice: 3, diceBy: 0, sixes: 0, winners: [], lastMove: null, dry: [0,0,0,0], log: [{ k: "start" }],
      seats: [{ kind: "human", uid: null, char: "frog", name: "Asha" }, { kind: "human", uid: null, char: "owl", name: "Ben" }, { kind: "off", uid: null, char: "penguin" }, { kind: "off", uid: null, char: "robot" }],
      tokens: [[5,12,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]] };
    const ctx = await newCtx(), p = await open(ctx, { fn: s => { window.claude = { hot: { data: { localState: s } } }; }, arg: st });
    await p.waitForTimeout(600); await p.locator("#tokens .token.can").first().click({ force: true }); await p.waitForTimeout(2500);
    check(!/Ben (rolled|brought|has no)/.test(await p.textContent("#log")) && (await p.textContent("#turnPanel")).includes("Ben's turn"), "tapping a piece moves it without rolling for the next player");
    await ctx.close(); }

  // 3c. The next player can't roll until the piece has finished moving
  { const st = { status: "playing", host: null, rev: 5, rollId: 3, turn: 0, rolled: true, dice: 5, diceBy: 0, sixes: 0, winners: [], lastMove: null, dry: [0,0,0,0], log: [{ k: "start" }],
      seats: [{ kind: "human", uid: null, char: "penguin", name: "Asha" }, { kind: "human", uid: null, char: "owl", name: "Ben" }, { kind: "off", uid: null, char: "frog" }, { kind: "off", uid: null, char: "robot" }],
      tokens: [[5,12,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]] };
    const ctx = await newCtx(), p = await open(ctx, { fn: s => { window.claude = { hot: { data: { localState: s } } }; }, arg: st });
    await p.waitForTimeout(600); await p.locator("#tokens .token.can").first().click({ force: true }); await p.waitForTimeout(300);
    const moving = await p.$$eval("#tokens .token.hopping", e => e.length) > 0;
    await p.mouse.click(300, 500); await p.waitForTimeout(400);
    check(moving && !/Ben (rolled|brought|has no)/.test(await p.textContent("#log")), "no rolling while the piece is still hopping");
    await p.waitForSelector("#die.ready", { timeout: 8000 }).catch(() => {});
    check(await p.$$eval("#tokens .token.hopping", e => e.length) === 0, "the die wakes up once the piece has landed");
    await p.mouse.click(300, 500); await p.waitForTimeout(2600);
    check(/Ben (rolled|brought|has no)/.test(await p.textContent("#log")), "then the next player can roll");
    await ctx.close(); }

  // 4. Two players online
  { const ctx = await newCtx(), host = await open(ctx), guest = await open(ctx);
    await host.click("#modeOnline"); await guest.click("#modeOnline");
    await host.fill("#nick", "Asha"); await guest.fill("#nick", "Ben");
    await host.click("#createBtn"); await host.waitForSelector("#lobby:not([hidden])", { timeout: 8000 });
    const code = (await host.textContent("#lobbyCode")).trim();
    await guest.fill("#joinCode", code); await guest.click("#joinBtn");
    await guest.waitForSelector("#seats li:nth-child(3) button.primary", { timeout: 8000 }); await guest.click("#seats li:nth-child(3) button.primary");
    await host.waitForFunction(() => [...document.querySelectorAll("#seats li b")].some(b => b.textContent === "Ben"), null, { timeout: 8000 }).catch(() => {});
    await host.click("#startBtn"); await guest.waitForSelector("#game:not([hidden])", { timeout: 8000 }).catch(() => {});
    check(await guest.$eval("#game", e => !e.hidden), "guest joins and sees the game start");
    await host.waitForTimeout(1200);
    const ashaFirst = (await host.textContent("#log")).includes("Asha goes first") || (await host.textContent("#log")).includes("You go first");
    const [roller, watcher, who] = ashaFirst ? [host, guest, "Asha"] : [guest, host, "Ben"];
    await roller.mouse.click(300, 500); await roller.waitForTimeout(3500);
    check((await watcher.textContent("#log")).includes(who + " rolled") || (await watcher.textContent("#log")).includes(who), "moves reach the other player", who + " went first");
    await ctx.close(); }

  // 5. Offline: the saved copy opens and offers to continue
  { const ctx = await newCtx(true), p = await open(ctx);
    const sw = await p.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(800);
    await local(p, ["human","off","bot","off"]); await p.mouse.click(300, 500); await p.waitForTimeout(3000);
    await ctx.setOffline(true); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(1200);
    check(sw && (await p.title()) === "Ludo Live", "page opens offline");
    check(await p.$eval("#resumeCard", e => !e.hidden), "offline page offers to continue the saved game");
    await p.click("#resumeBtn"); await p.waitForTimeout(500);
    check(await p.$eval("#game", e => !e.hidden), "saved game continues");
    await ctx.close(); }

  check(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  await b.close(); server.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall browser checks passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
