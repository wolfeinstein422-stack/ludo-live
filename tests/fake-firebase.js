// A stand-in for the Firebase scripts, as strict as the real Firestore about the data it accepts.
// Browsers on the same page origin share one store through localStorage.
(() => { if (window.firebase) return;
const K = p => "fakefs:" + p, read = p => { const v = localStorage.getItem(K(p)); return v ? JSON.parse(v) : null; };
const subs = {}; const notify = p => (subs[p] || []).forEach(f => setTimeout(f, 5));
addEventListener("storage", e => { if (e.key && e.key.startsWith("fakefs:")) notify(e.key.slice(7)); });
const nested = v => Array.isArray(v) ? v.some(x => Array.isArray(x) || nested(x)) : v && typeof v === "object" ? Object.values(v).some(nested) : false;
const write = (p, v) => { if (nested(v)) throw Object.assign(new Error("Nested arrays are not supported"), { code: "invalid-argument" }); localStorage.setItem(K(p), JSON.stringify(v)); notify(p); };
const snap = p => { const d = read(p); return { exists: !!d, id: p.split("/").pop(), data: () => d ? JSON.parse(JSON.stringify(d)) : undefined, metadata: { fromCache: false, hasPendingWrites: false } }; };
const docRef = p => ({ get: async () => snap(p), set: async d => write(p, d), update: async d => { const c = read(p); if (!c) throw { code: "not-found" }; write(p, { ...c, ...d }); },
  delete: async () => { localStorage.removeItem(K(p)); notify(p); },
  onSnapshot: (next) => { const f = () => next(snap(p)); (subs[p] = subs[p] || []).push(f); setTimeout(f, 5); return () => { subs[p] = subs[p].filter(x => x !== f); }; } });
const query = (c, filters = [], order = null, lim = 1e9) => ({
  where: (f, op, v) => query(c, [...filters, [f, op, v]], order, lim), orderBy: (f, dir) => query(c, filters, [f, dir], lim), limit: n => query(c, filters, order, n),
  get: async () => { let docs = Object.keys(localStorage).filter(k => k.startsWith("fakefs:" + c + "/")).map(k => snap(k.slice(7)));
    const ok = (a, op, b) => op === "==" ? a === b : op === ">" ? a > b : op === "<" ? a < b : op === ">=" ? a >= b : a <= b;
    docs = docs.filter(s => filters.every(([f, op, v]) => ok(s.data()[f], op, v)));
    if (order) docs.sort((x, y) => (order[1] === "desc" ? -1 : 1) * ((x.data()[order[0]] || 0) - (y.data()[order[0]] || 0)));
    return { docs: docs.slice(0, lim) }; } });
const FS = { doc: docRef, collection: c => query(c), runTransaction: async fn => fn({ get: async r => r.get(), update: (r, d) => r.update(d) }) };
const uid = "u_" + Math.random().toString(36).slice(2, 8);
function Timestamp(ms) { this.ms = ms; }
Timestamp.fromMillis = ms => new Timestamp(ms);
window.firebase = { apps: [], initializeApp: () => ({}), app: () => ({}), auth: () => ({ signInAnonymously: async () => ({ user: { uid } }) }), firestore: Object.assign(() => FS, { Timestamp }) };
})();
