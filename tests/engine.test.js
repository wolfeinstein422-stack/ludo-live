// Rules, dice and dice-physics checks. Runs the game's own code, pulled out of ludo-live.html.
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "ludo-live.html"), "utf8");
const a = src.indexOf("const COLORS"), b = src.indexOf("/* ---------- App state");
assert(a > 0 && b > a, "could not find the game rules in ludo-live.html");
const code = src.slice(a, b).replace(/const reduceMotion[^\n]*\n/, "");
const api = new Function(code + "; return {startPlay, doRoll, doMove, botPick, movable, stuckInYard, rollFor, throwDie, M3, FACE_N, PATH};")();
let failures = 0;
const test = (name, fn) => { try { fn(); console.log("ok   " + name); } catch (e) { failures++; console.log("FAIL " + name + "\n     " + e.message); } };

test("the track has 52 distinct squares", () => assert.strictEqual(new Set(api.PATH.map(String)).size, 52));

for (const kinds of [["bot","off","bot","off"], ["bot","bot","bot","off"], ["bot","bot","bot","bot"]]) {
  const n = kinds.filter(k => k !== "off").length;
  test(`${n}-player bot games always finish with a full, unique ranking`, () => {
    for (let g = 0; g < 120; g++) {
      let s = api.startPlay({ seats: kinds.map(k => ({ kind: k, uid: null })), rev: 0, turn: 0, rollId: 0 });
      let steps = 0;
      while (s.status === "playing" && steps++ < 20000) {
        s = s.rolled ? api.doMove(s, api.botPick(s)) : api.doRoll(s, api.rollFor(s));
        for (const row of s.tokens) for (const p of row) assert(p >= -1 && p <= 56, "piece position out of range: " + p);
      }
      assert.strictEqual(s.status, "done", "game did not finish");
      assert.strictEqual(new Set(s.winners).size, n, "ranking is incomplete or repeats a player");
    }
  });
}

test("nobody waits more than 7 rolls for a 6 when all pieces are in the yard", () => {
  let worst = 0;
  for (let g = 0; g < 200; g++) {
    let s = api.startPlay({ seats: [0,1,2,3].map(() => ({ kind: "bot", uid: null })), rev: 0, turn: 0, rollId: 0 });
    const wait = [0,0,0,0]; let steps = 0;
    while (s.status === "playing" && steps++ < 20000) {
      if (!s.rolled) { const seat = s.turn, stuck = api.stuckInYard(s, seat), d = api.rollFor(s);
        if (stuck) { if (d === 6) { worst = Math.max(worst, wait[seat] + 1); wait[seat] = 0; } else wait[seat]++; }
        s = api.doRoll(s, d); }
      else s = api.doMove(s, api.botPick(s));
    }
  }
  assert(worst <= 7, "worst wait was " + worst);
});

test("each die face still comes up about a sixth of the time overall", () => {
  const c = [0,0,0,0,0,0]; let n = 0;
  for (let g = 0; g < 150; g++) {
    let s = api.startPlay({ seats: [0,1,2,3].map(() => ({ kind: "bot", uid: null })), rev: 0, turn: 0, rollId: 0 }); let steps = 0;
    while (s.status === "playing" && steps++ < 20000) { if (!s.rolled) { const d = api.rollFor(s); c[d-1]++; n++; s = api.doRoll(s, d); } else s = api.doMove(s, api.botPick(s)); }
  }
  for (const x of c) assert(Math.abs(x / n - 1/6) < 0.035, "face share " + (x / n).toFixed(3));
});

test("thrown dice land on the rolled number, stay on the board and take 1 to 2 seconds", () => {
  for (let i = 0; i < 240; i++) {
    const fin = 1 + (i % 6), r = api.throwDie(i % 4, fin), F = r.frames, last = F[F.length - 1];
    assert(api.M3.mulv(last.R, api.FACE_N[fin])[2] > 0.999, "die did not land on " + fin);
    assert(F.every(f => f.p[0] >= 0 && f.p[0] <= 15 && f.p[1] >= 0 && f.p[1] <= 15), "die left the board");
    assert(r.dur >= 0.9 && r.dur <= 2.0, "throw took " + r.dur.toFixed(2) + "s");
  }
});

console.log(failures ? `\n${failures} check(s) failed` : "\nall rule checks passed");
process.exit(failures ? 1 : 0);
