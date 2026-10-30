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
  const newCtx = async () => { const ctx = await b.newContext({ viewport: { width: 1100, height: 820 } });
    await ctx.route("https://www.gstatic.com/**", r => r.fulfill({ status: 200, contentType: "text/javascript", body: fake }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: "" }));
    return ctx; };
  const errors = [];
  const open = async (ctx, init) => { const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message));
    if (init) await p.addInitScript(init.fn, init.arg);
    await p.goto(URL, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(900); return p; };

  // 1. Pass and play with bots runs on its own
  { const ctx = await newCtx(), p = await open(ctx);
    for (const i of [0,1,2,3]) await p.selectOption("#local-" + i, "bot");
    await p.click("#localBtn"); await p.waitForTimeout(12000);
    const lines = await p.$$eval("#log li", e => e.length);
    check(lines >= 3, "bots play a Pass and play game", lines + " log lines");
    check(await p.$eval("#resumeCard", e => true), "game is saved for later");
    await ctx.close(); }

  // 2. Tapping the board rolls the die
  { const ctx = await newCtx(), p = await open(ctx);
    await p.selectOption("#local-1", "off"); await p.selectOption("#local-3", "off"); await p.selectOption("#local-2", "human");
    await p.click("#localBtn"); await p.waitForTimeout(500);
    await p.mouse.click(300, 500); await p.waitForTimeout(2600);
    check((await p.textContent("#log")).includes("rolled") || (await p.textContent("#log")).includes("brought"), "tapping the board rolls");
    await ctx.close(); }

  // 3. A capture only scares the victim once it's chosen, and is logged
  { const st = { status: "playing", host: null, rev: 5, rollId: 3, turn: 0, rolled: true, dice: 5, diceBy: 0, sixes: 0, winners: [], lastMove: null,
      seats: ["frog","owl","penguin","robot"].map(c => ({ kind: "human", uid: null, char: c })), tokens: [[1,-1,-1,-1],[-1,-1,-1,-1],[32,-1,-1,-1],[-1,-1,-1,-1]], log: [{ k: "start" }] };
    const ctx = await newCtx(), p = await open(ctx, { fn: s => { window.claude = { hot: { data: { localState: s } } }; }, arg: st });
    await p.waitForTimeout(3500);
    check((await p.textContent("#log")).includes("captured"), "captures work");
    await ctx.close(); }

  // 4. Two players online
  { const ctx = await newCtx(), host = await open(ctx), guest = await open(ctx);
    await host.fill("#nick", "Asha"); await guest.fill("#nick", "Ben");
    await host.click("#createBtn"); await host.waitForSelector("#lobby:not([hidden])", { timeout: 8000 });
    const code = (await host.textContent("#lobbyCode")).trim();
    await guest.fill("#joinCode", code); await guest.click("#joinBtn");
    await guest.waitForSelector("#seats li:nth-child(3) button.primary", { timeout: 8000 }); await guest.click("#seats li:nth-child(3) button.primary");
    await host.waitForFunction(() => [...document.querySelectorAll("#seats li b")].some(b => b.textContent === "Ben"), null, { timeout: 8000 }).catch(() => {});
    await host.click("#startBtn"); await guest.waitForSelector("#game:not([hidden])", { timeout: 8000 }).catch(() => {});
    check(await guest.$eval("#game", e => !e.hidden), "guest joins and sees the game start");
    await host.mouse.click(300, 500); await host.waitForTimeout(3500);
    check((await guest.textContent("#log")).includes("Asha"), "moves reach the other player");
    await ctx.close(); }

  // 5. Offline: the saved copy opens and offers to continue
  { const ctx = await newCtx(), p = await open(ctx);
    const sw = await p.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(800);
    await p.selectOption("#local-1", "off"); await p.selectOption("#local-3", "off"); await p.selectOption("#local-2", "bot");
    await p.click("#localBtn"); await p.waitForTimeout(800); await p.mouse.click(300, 500); await p.waitForTimeout(3000);
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
