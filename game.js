'use strict';
// ================= CONFIG — tune the economy here =================
const CFG = {
  weekSec: 180,             // real seconds per game week at 1x
  turn: 0.75,               // hours on the ground between legs
  planes: [                 // L1..L6 upgrade path; L7 = Super Jet (events/cheats only)
    { seats: 20,  kmh: 500,  range: 2500,  cost: 0.5e6 },
    { seats: 50,  kmh: 600,  range: 4500,  cost: 2e6 },
    { seats: 100, kmh: 700,  range: 7000,  cost: 6e6 },
    { seats: 180, kmh: 800,  range: 10000, cost: 15e6 },
    { seats: 300, kmh: 850,  range: 14000, cost: 40e6 },
    { seats: 450, kmh: 900,  range: 20100, cost: 90e6 },
    { seats: 800, kmh: 1800, range: 20100, cost: 90e6 },
  ],
  routeBase: 1e5, routePerKm: 20,
  fareBase: 30, farePerKm: 0.08, wealthRef: 40, // fare = (base + perKm*km) * sqrt(avg GDP per cap / ref)
  remoteFare: 2,            // fare multiplier when either end is remote/polar/island
  demandK: 0.1, traitPopFloor: 0.1,
  apCap:  [60, 150, 400, 1000, 2500, 6000, 15000],
  apCost: [0, 3e5, 1e6, 3e6, 8e6, 20e6, 50e6],
  loungeLvl: 2, loungeFare: 1.1, dutyLvl: 4, dutyFree: 6,
  fullPenalty: 0.7,
  hubCost: 10e6, hubBonus: 10, hubCapMult: 2,
  unlockBase: 2e6, unlockGrowth: 1.15,
  startCash: 5e6, loanRate: 0.01,
  eventChance: 0.35, unlockAllWeeks: 6,
  focusMult: 1.6,           // demand boost for the core markets below
  focus: ['United States of America', 'China', 'Hong Kong', 'Macao', 'Taiwan', 'Japan', 'South Korea',
    'France', 'United Kingdom', 'Germany', 'Netherlands', 'Belgium', 'Luxembourg'],
  apPopScale: true,         // airport capacity × (1 + sqrt(metro pop in M)): NYC ≈ 5.5×, a tiny island ≈ 1×
  histWk: 26, histMax: 520, // per-airport/route weekly history kept; global history cap (older weeks get pair-averaged)
};
const FOCUS = new Set(CFG.focus);

// ================= DATA =================
const R = Math.PI / 180;
const C = CITIES, NC = C.length, KEY = new Map(); // KEY: "name|country" → index (save files store these, never indices)
C.forEach((c, i) => {
  c.i = i; c.k = c.n + '|' + c.c; c.x = c.lon + 180; c.y = 90 - c.lat; c.sl = Math.sin(c.lat * R); c.cl = Math.cos(c.lat * R);
  c.score = Math.sqrt(c.pop) * c.e + (c.t && c.t !== 'finance' ? 2 : 0);
  c.reg = c.lat < -60 ? 'ant' : c.r; KEY.set(c.k, i);
});
const RANK = [...C].sort((a, b) => b.score - a.score).map(c => c.i);
const RANKOF = new Int16Array(NC); RANK.forEach((ci, k) => RANKOF[ci] = k);
const COUNTRY = new Map();
for (const c of C) {
  let k = COUNTRY.get(c.c);
  if (!k) COUNTRY.set(c.c, k = { n: c.c, cities: [], pop: 0, g: c.g });
  k.cities.push(c.i); k.pop += c.pop;
}
const DROW = new Array(NC); // distance rows, filled lazily: only cities you touch cost memory/time (2,300 cities = 2.6M acos otherwise)
function drow(i) { const a = C[i], row = DROW[i] = new Float32Array(NC);
  for (let j = 0; j < NC; j++) { const b = C[j]; row[j] = 6371 * Math.acos(Math.max(-1, Math.min(1, a.sl * b.sl + a.cl * b.cl * Math.cos((b.lon - a.lon) * R)))); }
  return row; }
const dist = (a, b) => (DROW[a] || drow(a))[b];
const LNAME = new Map(); for (const c of C) if (!LNAME.has(c.n.toLowerCase())) LNAME.set(c.n.toLowerCase(), c.i);
const byName = n => { const l = n.toLowerCase(); if (LNAME.has(l)) return LNAME.get(l); const k = C.findIndex(c => c.n.toLowerCase().startsWith(l)); return k; };
const tkey = (i, j) => i * NC + j;
// real-world traffic ties beyond plain gravity
const TIE = new Map();
[['London','New York',3],['New York','Los Angeles',2],['Sydney','Melbourne',3],['Dubai','Mumbai',3],['Dubai','Delhi',2.5],
 ['Dubai','London',2],['Dubai','Karachi',2.5],['Dubai','Dhaka',2],['Paris','Algiers',3],['Paris','Casablanca',2.5],['Paris','Tunis',2],
 ['Los Angeles','Mexico City',2.5],['New York','San Juan',2.5],['Miami','Havana',2],['Hong Kong','Taipei',3],['Beijing','Shanghai',3],
 ['Tokyo','Sapporo',3],['Tokyo','Fukuoka',3],['Tokyo','Osaka',2],['Singapore','Kuala Lumpur',3],['Jakarta','Singapore',2.5],
 ['Madrid','Buenos Aires',2],['Lisbon','São Paulo',2],['New York','Tel Aviv',2],['Los Angeles','Manila',2],['London','Mumbai',2],
 ['London','Hong Kong',2],['Jeddah','Jakarta',2],['Seoul','Jeju',3],['Mumbai','Delhi',3],['Toronto','London',1.8],['Moscow','Saint Petersburg',3],
 ['London','Dublin',2.5],['Frankfurt','New York',1.8],['Istanbul','Berlin',2],['Riyadh','Cairo',2],['Johannesburg','Cape Town',3],
 ['Lagos','London',2],['São Paulo','Rio de Janeiro',3],['Bogotá','Miami',2],['Honolulu','Los Angeles',2.5],['Auckland','Sydney',2.5],
, ...TIES_DATA].forEach(([a, b, m]) => { // TIES_DATA = real busiest routes (data/ties.json); the larger multiplier wins
  const i = byName(a), j = byName(b); if (i < 0 || j < 0) return; m = Math.max(m, TIE.get(tkey(i, j)) || 0); TIE.set(tkey(i, j), m); TIE.set(tkey(j, i), m); });

const PATHS = WORLD.map(w => {
  const p = new Path2D();
  for (const r of w.p) { p.moveTo(r[0] + 180, 90 - r[1]); for (let k = 2; k < r.length; k += 2) (Math.abs(r[k] - r[k - 2]) > 180 ? p.moveTo : p.lineTo).call(p, r[k] + 180, 90 - r[k + 1]); p.closePath(); } // split rings at the antimeridian (Russia, Fiji) or they draw a line across the map
  return { n: w.n, path: p };
});

// ================= HELPERS =================
const $ = s => document.querySelector(s);
const fmt$ = n => { if (!isFinite(n)) return '∞'; const s = n < 0 ? '-' : '', a = Math.abs(n);
  return s + '$' + (a >= 1e12 ? (a / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(0)); };
const fmtN = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n) + '';
const fmtPop = p => p >= 1 ? p.toFixed(1) + 'M' : p >= 0.001 ? Math.round(p * 1000) + 'K' : Math.round(p * 1e6) + '';
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const wrapD = d => ((d + 180) % 360 + 360) % 360 - 180;
const TRAIT = { remote: '🧭 Remote: 2× fares, few travellers', polar: '❄️ Polar: 2× fares, few travellers', island: '🏝 Island: 2× fares, few travellers',
  geo: '🏴 Geopolitical oddity', tourist: '📸 Tourist magnet', finance: '💹 Financial centre', pilgrimage: '🕋 Pilgrimage site' };
const REGNAME = { na: 'North America', latam: 'Latin America', eu: 'Europe', mea: 'Middle East & Africa', sca: 'South & Central Asia', eao: 'East Asia & Oceania', ant: 'Antarctica' };
function bsearch(cum, v) { let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < v) lo = m + 1; else hi = m; } return lo; }

function arc(a, b, n = 48) { // great-circle polyline in map degrees, x unwrapped (continuous)
  const v = c => [Math.cos(c.lat * R) * Math.cos(c.lon * R), Math.cos(c.lat * R) * Math.sin(c.lon * R), Math.sin(c.lat * R)];
  const A = v(a), B = v(b), d = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  const pts = []; let px = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n, s1 = d < 1e-6 ? 1 - t : Math.sin((1 - t) * d) / Math.sin(d), s2 = d < 1e-6 ? t : Math.sin(t * d) / Math.sin(d);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    let X = Math.atan2(y, x) / R + 180; const Y = 90 - Math.atan2(z, Math.hypot(x, y)) / R;
    if (px !== null) { while (X - px > 180) X -= 360; while (X - px < -180) X += 360; }
    px = X; pts.push(X, Y);
  }
  return pts;
}

// ================= SETTINGS / ACHIEVEMENTS (global, per device) =================
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
// v2 writes only fc2_* keys. fc_* are v1's (still playable at this origin) and the permanent backup: read once as a seed, never written.
const SET = Object.assign({ mute: false, cheats: false, theme: 'auto', filter: 0 }, ls.get('fc2_set', null) || ls.get('fc_set', {}));
const saveSet = () => ls.set('fc2_set', SET);
const ACH = ls.get('fc2_ach', null) || ls.get('fc_ach', {});
const saveAch = () => ls.set('fc2_ach', ACH);

// ================= GAME STATE =================
let S = null, ADJ = new Map(), NH = new Map(), COMP = new Map(), DEM = new Map(), NODES = [];
let speed = 1, bgDirty = true, sel = null, linkFrom = null; // sel: {type:'city'|'route', id}; linkFrom: city index while in tap-tap route mode

function newState(mode) {
  return { mode, week: 0, hour: 0, cash: CFG.startCash, infinite: mode === 'sandbox', allOpen: mode === 'sandbox',
    unlocked: new Set(), routes: [], ap: {}, home: -1, hubs: new Set(), effects: [], cheated: false, pm: {},
    ch: { free: false, range: false, instant: false, noEvents: false },
    stats: { pax: 0, inc: 0, calm: 0 }, wkInc: 0, wkPax: 0, lastWkInc: 0, deadline: 0, scen: null, rid: 1, maxHops: 0, picking: mode === 'free' || mode === 'unlockall',
    hist: [] }; // hist: [week, income, pax delivered, cash] per week (see weekTick for the cap)
}
const isOpen = i => S.allOpen || S.unlocked.has(C[i].c);
const apWk = () => ({ inc: 0, orig: 0, arr: 0, xf: 0, unmet: 0, um: new Map(), flows: new Map() }); // um: dest → turned away; flows: 'prev>next' → transfer pax
function ap(i) { return S.ap[i] || (S.ap[i] = { lvl: 0, q: new Map(), wait: 0, xfer: 0, acc: 0, full: false, inc: 0, wk: apWk(), last: apWk(), h: [] }); } // h: [wait, inc, orig, arr, xf, unmet] per week
const cap = i => Math.round(CFG.apCap[ap(i).lvl] * (CFG.apPopScale ? 1 + Math.sqrt(C[i].pop) : 1) * (S.hubs.has(i) ? CFG.hubCapMult : 1));
const fxMatch = (e, c) => e.all || e.city === c.i || e.country === c.c || (e.countries && e.countries.includes(c.c)) || (e.trait && e.trait === c.t) ||
  (e.region && e.region === c.r && (e.latMin == null || c.lat >= e.latMin) && (e.latMax == null || c.lat <= e.latMax));
const closed = i => S.effects.some(e => e.kind === 'close' && fxMatch(e, C[i]));
const dMult = i => S.effects.reduce((m, e) => e.kind === 'demand' && fxMatch(e, C[i]) ? m * e.mult : m, 1) * (S.pm[i] || 1);
const gMult = k => S.effects.reduce((m, e) => e.kind === k ? m * e.mult : m, 1);
const planeCost = L => CFG.planes[L].cost * gMult('cost');
const routeCost = km => CFG.routeBase + CFG.routePerKm * km;
const minLevel = km => S.ch.range ? 0 : Math.max(0, CFG.planes.slice(0, 6).findIndex(p => p.range >= km));
const unlockCost = n => CFG.unlockBase * Math.pow(CFG.unlockGrowth, S.unlocked.size) * (0.6 + 0.4 * Math.log10(1 + COUNTRY.get(n).pop));
const nPlanes = () => S.routes.reduce((s, r) => s + r.planes.length, 0);
function fare(a, b) {
  const A = C[a], B = C[b], w = Math.min(1.6, Math.max(0.3, Math.sqrt((A.g + B.g) / 2 / CFG.wealthRef)));
  const rem = [A, B].some(c => c.t === 'remote' || c.t === 'polar' || c.t === 'island') ? CFG.remoteFare : 1;
  return (CFG.fareBase + CFG.farePerKm * dist(a, b)) * w * rem;
}
function spend(x, what) {
  if (S.infinite || S.ch.free) return true;
  if (S.cash < x) { toast(`Need ${fmt$(x)}${what ? ' for ' + what : ''}`); sfx('no'); return false; }
  S.cash -= x; return true;
}
function earn(x) { S.cash += x; S.stats.inc += x; S.wkInc += x; }
const push = (h, v, n = CFG.histWk) => { h.push(v); if (h.length > n) h.shift(); };
function markCheat() { S.cheated = true; }

// ================= NETWORK =================
function rebuild() {
  ADJ = new Map();
  for (const r of S.routes) for (const [u, v] of [[r.a, r.b], [r.b, r.a]]) { if (!ADJ.has(u)) ADJ.set(u, []); ADJ.get(u).push(v); }
  NODES = [...ADJ.keys()]; NH = new Map(); COMP = new Map(); S.maxHops = 0;
  for (const s of NODES) { // layered BFS: fewest hops, ties broken by shortest total km (exact)
    const nh = new Int16Array(NC).fill(-1), d = new Map([[s, 0]]), seen = new Set([s]);
    let layer = [s], h = 0;
    while (layer.length) {
      const next = new Map();
      for (const u of layer) for (const v of ADJ.get(u)) {
        if (seen.has(v)) continue;
        const dd = d.get(u) + dist(u, v), f = u === s ? v : nh[u], cur = next.get(v);
        if (!cur || dd < cur[0]) next.set(v, [dd, f]);
      }
      for (const [v, [dd, f]] of next) { seen.add(v); d.set(v, dd); nh[v] = f; }
      layer = [...next.keys()]; if (layer.length) h++;
    }
    S.maxHops = Math.max(S.maxHops, h); NH.set(s, nh); COMP.set(s, [...seen]);
  }
  buildDemand(); requeue(); bgDirty = true;
}
function buildDemand() {
  DEM = new Map();
  const P = i => { const c = C[i]; const p = c.t && c.t !== 'finance' ? Math.max(c.pop, CFG.traitPopFloor) : c.pop; return Math.pow(p, 0.6) * dMult(i) * (FOCUS.has(c.c) ? CFG.focusMult : 1); };
  const PV = new Map(NODES.map(i => [i, P(i)]));
  for (const i of NODES) {
    const js = COMP.get(i).filter(j => j !== i), cum = new Float64Array(js.length), pi = PV.get(i); let t = 0;
    js.forEach((j, k) => { t += CFG.demandK * pi * PV.get(j) * (C[i].e + C[j].e) / 6 * (TIE.get(tkey(i, j)) || 1) / Math.pow(dist(i, j) / 1000 + 1, 0.7); cum[k] = t; });
    DEM.set(i, { js, cum, t });
  }
}
function enq(i, hop, d, n) { const a = ap(i); let m = a.q.get(hop); if (!m) a.q.set(hop, m = new Map()); m.set(d, (m.get(d) || 0) + n); a.wait += n; }
function requeue() {
  for (const k in S.ap) {
    const i = +k, a = S.ap[k], old = a.q, nh = NH.get(i); a.q = new Map(); a.wait = 0;
    for (const m of old.values()) for (const [d, n] of m) if (nh && d !== i && nh[d] >= 0) enq(i, nh[d], d, n);
    a.full = a.wait >= cap(i);
  }
}

// ================= SIMULATION =================
function spawn(dt) {
  for (const i of NODES) {
    const D = DEM.get(i); if (!D || !D.t || closed(i)) continue;
    const a = ap(i); a.acc += D.t * dt; let n = Math.floor(a.acc); if (!n) continue; a.acc -= n;
    const over = n - Math.max(0, cap(i) - a.wait); n -= Math.max(0, over);
    if (over > 0) { a.wk.unmet += over; const d = D.js[bsearch(D.cum, Math.random() * D.t)]; a.wk.um.set(d, (a.wk.um.get(d) || 0) + over); } // turned away: sample one destination for the batch
    if (n <= 0) { a.full = true; continue; }
    const k = Math.min(n, 8), nh = NH.get(i); a.wk.orig += n;
    for (let s = 0; s < k; s++) { const m = Math.floor(n / k) + (s < n % k ? 1 : 0), d = D.js[bsearch(D.cum, Math.random() * D.t)]; enq(i, nh[d], d, m); }
    a.full = a.wait >= cap(i);
  }
}
function board(r, p, i, to) {
  const a = ap(i), m = a.q.get(to); let free = p.seats;
  if (m) for (const [d, n] of m) { const k = Math.min(n, free); if (!k) break; p.load.set(d, (p.load.get(d) || 0) + k); free -= k; a.wait -= k; if (k === n) m.delete(d); else m.set(d, n - k); }
  p.n = p.seats - free; r.wk.seats += p.seats; r.wk.pax += p.n; a.full = a.wait >= cap(i);
}
function land(r, p) {
  const x = p.from === r.a ? r.b : r.a, A = ap(x), F = ap(p.from); p.at = x; p.hold = S.ch.instant ? 0 : CFG.turn;
  if (!p.n) return;
  const lounge = (F.lvl >= CFG.loungeLvl || A.lvl >= CFG.loungeLvl) ? CFG.loungeFare : 1, pen = (F.full || A.full) ? CFG.fullPenalty : 1;
  let inc = p.n * r.fare * lounge * pen * gMult('fare'), xf = 0, dir = 0; const nh = NH.get(x), fl = A.wk.flows;
  for (const [d, n] of p.load) { if (d === x) { S.stats.pax += n; S.wkPax += n; dir += n; } else if (nh && nh[d] >= 0) { enq(x, nh[d], d, n); xf += n; const k = p.from + '>' + nh[d]; fl.set(k, (fl.get(k) || 0) + n); } }
  if (xf) { A.xfer += xf; A.wk.xf += xf; inc += xf * ((S.hubs.has(x) ? CFG.hubBonus : 0) + (A.lvl >= CFG.dutyLvl ? CFG.dutyFree : 0)); }
  A.full = A.wait >= cap(x); A.wk.arr += dir; r.wk.dir += dir; r.wk.xf += xf;
  earn(inc); r.wk.inc += inc; r.inc += inc; A.wk.inc += inc; A.inc += inc; p.load.clear(); p.n = 0; coin();
}
function stepPlanes(dt) {
  for (const r of S.routes) for (const p of r.planes) {
    let t = dt;
    while (t > 0) {
      if (p.at >= 0) {
        if (p.hold > t) { p.hold -= t; break; }
        t -= p.hold; p.hold = 0;
        const to = p.at === r.a ? r.b : r.a;
        if (closed(p.at) || closed(to)) { p.hold = 1; continue; }
        board(r, p, p.at, to); p.from = p.at; p.at = -1; p.t = 0;
      } else {
        const need = (1 - p.t) * r.km / p.kmh;
        if (need > t) { p.t += t * p.kmh / r.km; break; }
        t -= need; land(r, p);
      }
    }
  }
}
function step(dt) { spawn(dt); stepPlanes(dt); S.hour += dt; if (S.hour >= 168) { S.hour -= 168; weekTick(); } }

function mkPlane(r, L, paid, custom) {
  const P = custom || CFG.planes[L], at = r.planes.length % 2 ? r.b : r.a;
  return { lvl: L, seats: P.seats, kmh: P.kmh, custom: !!custom, paid, at, from: at, hold: Math.random() * CFG.turn, t: 0, load: new Map(), n: 0 };
}
const rtWk = () => ({ inc: 0, pax: 0, seats: 0, dir: 0, xf: 0 });
function mkRoute(a, b, cost, id) {
  const r = { id: id || S.rid++, a, b, km: dist(a, b), fare: fare(a, b), cost, planes: [], wk: rtWk(), last: rtWk(), inc: 0, h: [] }; // h: [load %, inc] per week
  r.pts = arc(C[a], C[b]); r.bx0 = Math.min(...r.pts.filter((_, k) => k % 2 === 0)); r.bx1 = Math.max(...r.pts.filter((_, k) => k % 2 === 0));
  return r;
}

// ================= ACTIONS =================
const hasRoute = (a, b) => S.routes.some(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
function routeQuote(a, b) { const km = dist(a, b), L = minLevel(km); return { km, L, rc: routeCost(km), pc: planeCost(L), cost: routeCost(km) + planeCost(L) }; }
function rawRoute(a, b, q) { const r = mkRoute(a, b, q.rc); r.planes.push(mkPlane(r, q.L, q.pc)); S.routes.push(r); ap(a); ap(b); return r; }
function tryRoute(a, b) {
  if (a === b) return;
  if (hasRoute(a, b)) { toast('Route already exists: tap it to add planes'); return; }
  for (const i of [a, b]) if (!isOpen(i)) { toast(`🔒 Unlock ${C[i].c} first`); sfx('no'); return; }
  const q = routeQuote(a, b);
  if (!spend(q.cost, 'this route')) return;
  rawRoute(a, b, q); rebuild(); sfx('route');
  toast(`✈️ ${C[a].n} ⇄ ${C[b].n} · ${Math.round(q.km).toLocaleString()} km · L${q.L + 1} · ${fmt$(q.cost)}`);
  checkMiles();
}
function addPlane(r, L) { const c = planeCost(L); if (!spend(c, 'a plane')) return; r.planes.push(mkPlane(r, L, c)); sfx('buy'); }
const upCost = p => p.custom || p.lvl >= 5 ? Infinity : planeCost(p.lvl + 1) - CFG.planes[p.lvl].cost * gMult('cost');
function rawUpgrade(p, c) { p.lvl++; p.paid += c; p.seats = CFG.planes[p.lvl].seats; p.kmh = CFG.planes[p.lvl].kmh; }
function upgradePlane(r, p) {
  const c = upCost(p); if (!isFinite(c) || !spend(c, 'upgrade')) return;
  rawUpgrade(p, c); sfx('buy');
}
function sellPlane(r, p) { r.planes.splice(r.planes.indexOf(p), 1); if (!S.infinite) S.cash += p.paid; sfx('sell'); }
function deleteRoute(r) {
  if (!S.infinite) S.cash += r.cost + r.planes.reduce((s, p) => s + p.paid, 0);
  S.routes.splice(S.routes.indexOf(r), 1); rebuild(); sfx('sell');
}
function unlockCountry(n) { if (!spend(unlockCost(n), n)) return; S.unlocked.add(n); bgDirty = true; sfx('unlock');
  if (S.mode === 'unlockall') S.deadline = S.week + CFG.unlockAllWeeks; toast(`🔓 ${n} unlocked`); checkMiles(); }
function rawApUp(i) { const a = ap(i); a.lvl++; a.full = a.wait >= cap(i); }
function upgradeAirport(i) { const a = ap(i); if (a.lvl >= 6) return; if (!spend(CFG.apCost[a.lvl + 1], 'airport upgrade')) return; rawApUp(i); sfx('buy'); }
function makeHub(i) { const c = CFG.hubCost * S.hubs.size; if (!spend(c, 'hub')) return; S.hubs.add(i); sfx('unlock'); toast(`⭐ ${C[i].n} is now a hub`); }

// ================= EVENTS =================
const netCities = f => NODES.filter(i => !f || f(C[i]));
function addFx(e, weeks) { e.until = S.week + weeks; S.effects.push(e); }
const EVENTS = [
  { id: 'olympics', name: 'Olympics', w: 2, fire() { const c = pick(netCities(c => c.e >= 4)); if (c == null) return; addFx({ kind: 'demand', city: c, mult: 3, label: 'Olympics' }, 3); return `🏅 ${C[c].n} hosts the Olympics: demand ×3 for 3 weeks`; } },
  { id: 'worldcup', name: 'World Cup', w: 1, fire() { const c = pick(netCities()); if (c == null) return; addFx({ kind: 'demand', country: C[c].c, mult: 2, label: 'World Cup' }, 2); return `⚽ ${C[c].c} hosts the World Cup: demand ×2 for 2 weeks`; } },
  { id: 'hajj', name: 'Hajj', w: 1, fire() { addFx({ kind: 'demand', trait: 'pilgrimage', mult: 5, label: 'Hajj' }, 2); return '🕋 Hajj season: pilgrimage cities ×5 demand for 2 weeks'; } },
  { id: 'aurora', name: 'Aurora season', w: 1, fire() { addFx({ kind: 'demand', trait: 'polar', mult: 3, label: 'Aurora' }, 2); return '🌌 Aurora season: polar cities ×3 demand for 2 weeks'; } },
  { id: 'tourism', name: 'Tourism boom', w: 1, fire() { addFx({ kind: 'demand', trait: 'tourist', mult: 2.5, label: 'Tourism boom' }, 2); return '📸 Tourism boom: tourist cities ×2.5 demand for 2 weeks'; } },
  { id: 'typhoon', name: 'Typhoon', w: 1, fire() { const c = pick(netCities(c => c.r === 'eao' && c.lat > 0 && c.lat < 40)); if (c == null) return; addFx({ kind: 'close', city: c, label: 'Typhoon' }, 1); return `🌀 Typhoon: ${C[c].n} airport closed for a week`; } },
  { id: 'monsoon', name: 'Monsoon', w: 1, fire() { const c = pick(netCities(c => c.r === 'sca' && c.lat < 30)); if (c == null) return; addFx({ kind: 'close', city: c, label: 'Monsoon' }, 1); return `🌧 Monsoon flooding: ${C[c].n} closed for a week`; } },
  { id: 'hurricane', name: 'Hurricane', w: 1, fire() { const c = pick(netCities(c => c.r === 'na' && c.lat < 35 && c.lon > -100)); if (c == null) return; addFx({ kind: 'close', city: c, label: 'Hurricane' }, 1); return `🌪 Hurricane: ${C[c].n} closed for a week`; } },
  { id: 'strike', name: 'Factory strike', w: 1, fire() { addFx({ kind: 'cost', mult: 2, label: 'Strike' }, 1); return '🪧 Plane factory strike: plane prices ×2 for a week'; } },
  { id: 'fareboost', name: 'Fare boost', w: 1, fire() { addFx({ kind: 'fare', mult: 1.5, label: 'Fare boost' }, 1); return '💸 Peak season: all fares ×1.5 for a week'; } },
  { id: 'investor', name: 'Investor', w: 1, fire() { const g = Math.max(2e6, S.lastWkInc * 2); earn(g); return `💼 An investor injects ${fmt$(g)}`; } },
  { id: 'superjet', name: 'Super Jet', w: 1, fire() { if (!S.routes.length) return; const r = pick(S.routes); r.planes.push(mkPlane(r, 6, 0)); return `🚀 Your factory built a Super Jet! Deployed on ${C[r.a].n} ⇄ ${C[r.b].n}`; } },
  { id: 'ash', name: 'Volcanic ash', w: 1, choice() { const c = Math.max(2e6, S.cash * 0.05); return { title: '🌋 Icelandic volcano erupts', text: 'An ash cloud is drifting over northern Europe. Pay to reroute around it, or ground northern Europe for a week.', opts: [
    [`Reroute (${fmt$(c)})`, () => { if (!S.infinite) S.cash -= c; }], ['Ground flights', () => addFx({ kind: 'close', region: 'eu', latMin: 45, label: 'Ash cloud' }, 1)]] }; } },
  { id: 'fuel', name: 'Fuel crisis', w: 1, choice() { const c = Math.max(1e6, S.lastWkInc * 0.5); return { title: '⛽ Oil price spike', text: 'Jet fuel prices just doubled. Buy a fuel hedge, or eat it with lower margins for two weeks.', opts: [
    [`Hedge (${fmt$(c)})`, () => { if (!S.infinite) S.cash -= c; }], ['Fares ×0.7 for 2 weeks', () => addFx({ kind: 'fare', mult: 0.7, label: 'Fuel crisis' }, 2)]] }; } },
  { id: 'tradein', name: 'Trade-in offer', w: 1, choice() { const ps = S.routes.flatMap(r => r.planes.filter(p => p.lvl === 0 && !p.custom).map(p => [r, p])); if (!ps.length) return;
    const c = ps.length * (CFG.planes[1].cost - CFG.planes[0].cost) * 0.5; return { title: '🛫 Trade-in offer', text: `The factory offers to upgrade all ${ps.length} L1 planes to L2 at half price.`, opts: [
    [`Accept (${fmt$(c)})`, () => { if (!S.infinite) S.cash -= c; for (const [, p] of ps) { p.lvl = 1; p.seats = CFG.planes[1].seats; p.kmh = CFG.planes[1].kmh; p.paid += c / ps.length; } }], ['Decline', () => {}]] }; } },
  { id: 'block', name: 'Border closure', w: 1, choice() { const cs = [...S.unlocked].filter(n => n !== C[S.home]?.c && COUNTRY.get(n).cities.some(i => ADJ.has(i))); if (!cs.length) return; const n = pick(cs), c = unlockCost(n) * 0.3;
    return { title: `🚧 ${n} threatens to close its airspace`, text: 'Pay landing-rights fees to keep flying, or accept a one-week closure.', opts: [
    [`Pay (${fmt$(c)})`, () => { if (!S.infinite) S.cash -= c; }], ['Accept closure', () => addFx({ kind: 'close', country: n, label: 'Border closure' }, 1)]] }; } },
  { id: 'rival', name: 'Rival offer', w: 1, choice() { if (!S.routes.length) return; const r = pick(S.routes), v = 2 * (r.cost + r.planes.reduce((s, p) => s + p.paid, 0));
    return { title: '🤝 A rival wants your route', text: `They offer ${fmt$(v)} (2× what you paid) for ${C[r.a].n} ⇄ ${C[r.b].n} and its planes.`, opts: [
    [`Sell (+${fmt$(v)})`, () => { earn(v); S.routes.splice(S.routes.indexOf(r), 1); rebuild(); }], ['Keep it', () => {}]] }; } },
];
function fireEvent(id) {
  const pool = id ? EVENTS.filter(e => e.id === id) : EVENTS;
  for (let tries = 0; tries < 6; tries++) {
    const tot = pool.reduce((s, e) => s + e.w, 0); let x = Math.random() * tot, ev = pool[0];
    for (const e of pool) { x -= e.w; if (x <= 0) { ev = e; break; } }
    if (ev.choice) { const ch = ev.choice(); if (ch) { showChoice(ch); return; } }
    else { const msg = ev.fire(); if (msg) { toast(msg, 'event'); sfx('event'); buildDemand(); return; } }
    if (id) { toast('That event has no valid target right now'); return; }
  }
}

// ================= WEEK / MODES / MILESTONES =================
// Seasonal events fire on their real week of the year (game week % 52), on top of the random ones.
const CN_SPHERE = ['China', 'Hong Kong', 'Macao', 'Taiwan', 'South Korea'];
const CALENDAR = [
  [5, () => { addFx({ kind: 'demand', countries: CN_SPHERE, mult: 2.5, label: 'Lunar New Year' }, 2); return '🧧 Lunar New Year: the largest annual migration on Earth. China, Taiwan, HK & Korea demand ×2.5 for 2 weeks'; }],
  [6, () => { const c = byName('New Orleans') >= 0 ? byName('New Orleans') : byName('Las Vegas'); if (c < 0) return; addFx({ kind: 'demand', city: c, mult: 3, label: 'Super Bowl' }, 1); return `🏈 Super Bowl week in ${C[c].n}: demand ×3`; }],
  [9, () => { addFx({ kind: 'demand', city: byName('Paris'), mult: 3, label: 'Fashion Week' }, 1); return '👗 Paris Fashion Week: Paris demand ×3 this week'; }],
  [13, () => { addFx({ kind: 'demand', country: 'Japan', mult: 2, label: 'Sakura' }, 2); return '🌸 Cherry blossom season: Japan demand ×2 for 2 weeks'; }],
  [18, () => { addFx({ kind: 'demand', country: 'Japan', mult: 2.5, label: 'Golden Week' }, 1); return '🎌 Golden Week: Japan\'s biggest holiday. Japan demand ×2.5 this week'; }],
  [27, () => { addFx({ kind: 'demand', country: 'United States of America', mult: 1.5, label: 'Fourth of July' }, 1); return '🎆 Fourth of July: US demand ×1.5 this week'; }],
  [38, () => { addFx({ kind: 'demand', country: 'South Korea', mult: 2.5, label: 'Chuseok' }, 1); return '🌕 Chuseok: Korean harvest holiday. Korea demand ×2.5 this week'; }],
  [38, () => { addFx({ kind: 'demand', city: byName('Munich'), mult: 4, label: 'Oktoberfest' }, 2); return '🍺 Oktoberfest: Munich demand ×4 for 2 weeks'; }],
  [40, () => { addFx({ kind: 'demand', country: 'China', mult: 2, label: 'Golden Week (China)' }, 1); return '🇨🇳 National Day Golden Week: China demand ×2 this week'; }],
  [47, () => { addFx({ kind: 'demand', country: 'United States of America', mult: 2, label: 'Thanksgiving' }, 1); return '🦃 Thanksgiving: the busiest travel week in the US. US demand ×2'; }],
  [49, () => { addFx({ kind: 'demand', countries: ['Germany', 'France', 'Belgium', 'Netherlands', 'Luxembourg'], mult: 1.8, label: 'Christmas markets' }, 3); return '🎄 Christmas market season: Germany, France & Benelux demand ×1.8 for 3 weeks'; }],
  [51, () => { addFx({ kind: 'demand', countries: ['United States of America', 'United Kingdom', 'France', 'Germany', 'Netherlands', 'Belgium', 'Luxembourg'], mult: 1.7, label: 'Holidays' }, 2); return '🎁 Holiday travel rush: US & Western Europe demand ×1.7'; }],
];
function weekTick() {
  S.week++;
  for (const r of S.routes) { r.last = r.wk; r.wk = rtWk(); push(r.h, [r.last.seats ? Math.round(100 * r.last.pax / r.last.seats) : 0, Math.round(r.last.inc)]); }
  for (const k in S.ap) { const a = S.ap[k]; a.last = a.wk; a.wk = apWk(); push(a.h, [a.wait, Math.round(a.last.inc), a.last.orig, a.last.arr, a.last.xf, a.last.unmet]); }
  S.lastWkInc = S.wkInc; S.wkInc = 0;
  push(S.hist, [S.week, Math.round(S.lastWkInc), S.wkPax, Math.round(S.cash)], Infinity); S.wkPax = 0;
  if (S.hist.length > CFG.histMax) { const n = S.hist.length >> 1, old = S.hist.slice(0, n), m = []; // pair-average the older half; the graph uses explicit week x-values so uneven spacing is fine
    for (let k = 0; k < n; k += 2) m.push(old[k + 1] ? [old[k][0], (old[k][1] + old[k + 1][1]) / 2, (old[k][2] + old[k + 1][2]) / 2, (old[k][3] + old[k + 1][3]) / 2] : old[k]);
    S.hist = m.concat(S.hist.slice(n)); }
  if (S.cash < 0 && !S.infinite) S.cash *= 1 + CFG.loanRate;
  S.stats.calm = Object.values(S.ap).some(a => a.full) ? 0 : S.stats.calm + 1;
  const n0 = S.effects.length; S.effects = S.effects.filter(e => e.until > S.week);
  if (n0 !== S.effects.length) buildDemand();
  if (!S.ch.noEvents && S.routes.length) {
    for (const [wk, fire] of CALENDAR) if (S.week % 52 === wk) { const m = fire(); if (m) { toast(m, 'event'); sfx('event'); buildDemand(); } }
    if (Math.random() < CFG.eventChance) fireEvent();
  }
  if (S.mode === 'unlockall' && !S.picking && S.week >= S.deadline) runOver();
  checkScenario(); checkMiles();
  if (performance.now() - lastAuto > 5000) { lastAuto = performance.now(); save('auto'); } // at 1000× a week is 60ms; don't hit localStorage that often
  toast(`Week ${S.week} · ${S.lastWkInc >= 0 ? '+' : ''}${fmt$(S.lastWkInc)}`, 'week');
}
function runOver() {
  const n = S.unlocked.size;
  showChoice({ title: '⏰ Out of time', text: `You didn't unlock a country within ${CFG.unlockAllWeeks} weeks. Final score: ${n} countries, ${fmtN(S.stats.pax)} passengers.`,
    opts: [['Keep playing (Free Play)', () => { S.mode = 'free'; }], ['New game', () => showStart()]] });
}

const inNet = i => ADJ.has(i);
function biggestComp() { let best = []; for (const i of NODES) { const c = COMP.get(i); if (c.length > best.length) best = c; } return best; }
const MILES = [
  ['pax1k', 'First thousand', 'Deliver 1,000 passengers', () => S.stats.pax >= 1e3],
  ['pax1m', 'Mass transit', 'Deliver 1 million passengers', () => S.stats.pax >= 1e6],
  ['pax100m', 'Half of Europe', 'Deliver 100 million passengers', () => S.stats.pax >= 1e8],
  ['cash100m', 'Nine figures', 'Hold $100M', () => !S.infinite && S.cash >= 1e8],
  ['cash1b', 'Billionaire', 'Hold $1B', () => !S.infinite && S.cash >= 1e9],
  ['cash10b', 'Flag carrier of Earth', 'Hold $10B', () => !S.infinite && S.cash >= 1e10],
  ['fleet10', 'Squadron', 'Fly 10 planes', () => nPlanes() >= 10],
  ['fleet100', 'Armada', 'Fly 100 planes', () => nPlanes() >= 100],
  ['fleet1000', 'Swarm', 'Fly 1,000 planes', () => nPlanes() >= 1000],
  ['countries10', 'Diplomat', 'Unlock 10 countries', () => S.unlocked.size >= 10],
  ['countries50', 'Ambassador', 'Unlock 50 countries', () => S.unlocked.size >= 50],
  ['regions', 'Seven continents', 'Serve every region, including Antarctica', () => new Set(NODES.map(i => C[i].reg)).size >= 7],
  ['antarctica', 'Ice runway', 'Fly to Antarctica', () => NODES.some(i => C[i].lat < -60)],
  ['poles', 'Pole to pole', 'One network spanning the Arctic and Antarctica', () => NODES.some(i => C[i].lat > 66 && COMP.get(i).some(j => C[j].lat < -60))],
  ['remote10', 'Edge of the map', 'Serve 10 remote, polar or island cities', () => NODES.filter(i => ['remote', 'polar', 'island'].includes(C[i].t)).length >= 10],
  ['geo5', 'Grey zones', 'Serve 5 geopolitical oddities', () => NODES.filter(i => C[i].t === 'geo').length >= 5],
  ['longhaul', 'Ultra long haul', 'Open a route over 15,000 km', () => S.routes.some(r => r.km > 15000)],
  ['sixhop', 'The scenic route', 'A network where the shortest trip between two cities is 6+ hops', () => S.maxHops >= 6],
  ['circum', 'Circumnavigator', 'One network with cities in all 12 longitude bands of 30°', () => new Set(biggestComp().map(i => Math.floor(C[i].x / 30))).size >= 12],
  ['calm52', 'Smooth operator', 'A full year with no full airports (20+ airports)', () => S.stats.calm >= 52 && NODES.length >= 20],
  ['hub1m', 'Superconnector', '1 million transfers at one airport', () => Object.values(S.ap).some(a => a.xfer >= 1e6)],
];
function checkMiles() {
  for (const [id, name, , test] of MILES) {
    const had = ACH[id];
    if (had && !had.cheat) continue;
    if (had && S.cheated) continue;
    if (!test()) continue;
    ACH[id] = { cheat: S.cheated, when: Date.now() }; saveAch();
    toast(`🏆 ${name}${S.cheated ? ' 🧪' : ''}`, 'ach'); sfx('ach');
  }
}

const SCENARIOS = [
  { id: 'pacific', name: 'Pacific Hopper', desc: 'Connect 12 Pacific island or remote cities into one network within 40 weeks.', weeks: 40, cash: 30e6,
    setup() { S.allOpen = true; },
    goal() { const n = biggestComp().filter(i => C[i].r === 'eao' && ['island', 'remote'].includes(C[i].t)).length; return [n >= 12, `${n}/12 Pacific outposts linked`]; } },
  { id: 'polar', name: 'Polar Express', desc: 'Serve 6 polar cities in one network within 30 weeks.', weeks: 30, cash: 60e6,
    setup() { S.allOpen = true; },
    goal() { const n = biggestComp().filter(i => C[i].t === 'polar').length; return [n >= 6, `${n}/6 polar cities linked`]; } },
  { id: 'silk', name: 'Silk Road', desc: 'Link Beijing and London using only routes ≤ 2,500 km (L1 range) within 30 weeks.', weeks: 30, cash: 40e6,
    setup() { S.allOpen = true; },
    goal() { const a = byName('Beijing'), b = byName('London'); const adj = new Map();
      for (const r of S.routes) if (r.km <= 2500) for (const [u, v] of [[r.a, r.b], [r.b, r.a]]) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); }
      const seen = new Set([a]), st = [a]; while (st.length) for (const v of adj.get(st.pop()) || []) if (!seen.has(v)) { seen.add(v); st.push(v); }
      return [seen.has(b), seen.has(b) ? 'Connected!' : `${seen.size - 1} cities reachable from Beijing on short hops`]; } },
  { id: 'gulf', name: 'Gulf Superconnector', desc: 'Dubai is your hub. Push 20,000 transfer passengers through it within 20 weeks.', weeks: 20, cash: 40e6,
    setup() { S.allOpen = true; const d = byName('Dubai'); if (d >= 0) { S.home = d; S.hubs.add(d); } },
    goal() { const x = S.ap[byName('Dubai')]?.xfer || 0; return [x >= 2e4, `${fmtN(x)}/20K transfers at Dubai`]; } },
  { id: 'rising', name: 'Rising Sun', desc: 'Start with only Japan. Reach $3M weekly income within 30 weeks.', weeks: 30, cash: 5e6,
    setup() { S.unlocked.add('Japan'); const t = byName('Tokyo'); if (t >= 0) { S.home = t; S.hubs.add(t); } },
    goal() { return [S.lastWkInc >= 3e6, `${fmt$(S.lastWkInc)}/$3M per week`]; } },
];
function checkScenario() {
  if (!S.scen || S.scen.done) return;
  const sc = SCENARIOS.find(s => s.id === S.scen.id), [ok] = sc.goal();
  if (ok) { S.scen.done = true; ACH['scen_' + sc.id] = { cheat: S.cheated, when: Date.now() }; saveAch(); sfx('ach');
    showChoice({ title: `🏆 ${sc.name} complete!`, text: `Done in week ${S.week}.`, opts: [['Keep playing', () => {}], ['Menu', () => showStart()]] }); }
  else if (S.week >= sc.weeks) { S.scen.done = true;
    showChoice({ title: `⌛ ${sc.name} failed`, text: sc.goal()[1], opts: [['Keep playing anyway', () => {}], ['Retry', () => startScenario(sc.id)], ['Menu', () => showStart()]] }); }
}

// ================= SAVE / LOAD =================
// v2 saves (fc2_*) reference cities as indices into their own `keys` table of "name|country", so the city list can grow/reorder.
// A v1 save (fc_*) is the same shape with the frozen LEGACY_IDS as its implicit key table (see v1to2).
const r1 = x => Math.round(x);
const topN = (m, n) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n);
function serialize() {
  const ks = [], kid = new Map(), ck = i => { let k = kid.get(i); if (k == null) { k = ks.length; ks.push(C[i].k); kid.set(i, k); } return k; };
  const wk = a => ({ inc: r1(a.inc), orig: a.orig, arr: a.arr, xf: a.xf, unmet: a.unmet, um: topN(a.um, 10).map(([d, n]) => [ck(d), n]), flows: topN(a.flows, 5).map(([k, n]) => [k.split('>').map(i => ck(+i)).join('>'), n]) });
  const o = { v: 2, mode: S.mode, week: S.week, hour: S.hour, cash: S.cash, infinite: S.infinite, allOpen: S.allOpen, unlocked: [...S.unlocked], home: S.home >= 0 ? ck(S.home) : null,
    hubs: [...S.hubs].map(ck), effects: S.effects.map(e => e.city != null ? { ...e, city: ck(e.city) } : e), cheated: S.cheated, pm: Object.fromEntries(Object.entries(S.pm).map(([k, v]) => [ck(+k), v])),
    ch: S.ch, stats: S.stats, lastWkInc: S.lastWkInc, wkInc: S.wkInc, wkPax: S.wkPax, deadline: S.deadline, scen: S.scen, rid: S.rid, picking: S.picking, saved: Date.now(), hist: S.hist,
    ap: Object.fromEntries(Object.entries(S.ap).map(([k, a]) => [ck(+k), { lvl: a.lvl, xfer: a.xfer, inc: r1(a.inc), h: a.h, last: wk(a.last), q: [...a.q.values()].flatMap(m => [...m].map(([d, n]) => [ck(d), n])) }])),
    routes: S.routes.map(r => ({ id: r.id, a: ck(r.a), b: ck(r.b), cost: r.cost, inc: r1(r.inc), h: r.h, last: { ...r.last, inc: r1(r.last.inc) },
      planes: r.planes.map(p => ({ lvl: p.lvl, seats: p.seats, kmh: p.kmh, custom: p.custom, paid: p.paid })) })) };
  o.keys = ks; return o;
}
let DROP = null, idx = null; // DROP: counts of unmappable things dropped by the last deserialize/import
function deserialize(o) {
  DROP = { cities: 0, routes: 0, airports: 0, pax: 0 };
  idx = k => { const i = KEY.get(o.keys[k]); if (i == null) DROP.cities++; return i == null ? -1 : i; };
  const home = o.home != null && o.home >= 0 ? idx(o.home) : -1;
  S = Object.assign(newState(o.mode), o, { unlocked: new Set(o.unlocked), hubs: new Set(o.hubs.map(idx).filter(i => i >= 0)), home, ap: {}, routes: [], pm: {},
    effects: o.effects.map(e => e.city != null ? { ...e, city: idx(e.city) } : e).filter(e => e.city !== -1), hist: o.hist || [] });
  for (const [k, v] of Object.entries(o.pm || {})) { const i = idx(k); if (i >= 0) S.pm[i] = v; }
  for (const r0 of o.routes) {
    const a = idx(r0.a), b = idx(r0.b); if (a < 0 || b < 0 || a === b) { DROP.routes++; continue; }
    const r = mkRoute(a, b, r0.cost, r0.id); r.inc = r0.inc || 0; r.h = r0.h || []; if (r0.last) Object.assign(r.last, r0.last);
    for (const p0 of r0.planes) { const p = mkPlane(r, p0.lvl, p0.paid, p0.custom ? p0 : null); p.seats = p0.seats; p.kmh = p0.kmh; r.planes.push(p); }
    S.routes.push(r);
  }
  for (const [k, a0] of Object.entries(o.ap)) {
    const i = idx(k); if (i < 0) { DROP.airports++; DROP.pax += a0.q.reduce((s, [, n]) => s + n, 0); continue; }
    const a = ap(i); a.lvl = a0.lvl; a.xfer = a0.xfer; a.inc = a0.inc || 0; a.h = a0.h || []; const q = new Map(); a.q.set(-1, q);
    for (const [d, n] of a0.q) { const j = idx(d); if (j < 0) DROP.pax += n; else q.set(j, (q.get(j) || 0) + n); }
    if (a0.last) { const l = a0.last; Object.assign(a.last, l, { um: new Map((l.um || []).map(([d, n]) => [idx(d), n]).filter(x => x[0] >= 0)),
      flows: new Map((l.flows || []).map(([f, n]) => [f.split('>').map(idx).join('>'), n]).filter(x => !x[0].includes('-1'))) }); }
  }
  S.rid = Math.max(S.rid || 1, ...S.routes.map(r => r.id + 1));
  rebuild();
}
const v1to2 = o => ({ ...o, v: 2, keys: LEGACY_IDS }); // v1 indices are indices into the frozen v1 order; anything out of range or renamed is dropped by deserialize
function importV1(slot, quiet) { // fc_<slot> → fc2_<slot>; the v1 key is only ever read
  const o = ls.get('fc_' + slot, null); if (!o || o.v !== 1 || typeof LEGACY_IDS === 'undefined') return false; // legacy-ids.js missing = half-updated cache: skip, never crash at startup
  const keep = S, v2 = v1to2(o); deserialize(v2); const ok = ls.set('fc2_' + slot, serialize()), d = DROP; S = keep; if (S) rebuild();
  if (!quiet) toast(ok ? `⬇ Imported v1 ${slot === 'auto' ? 'autosave' : 'slot ' + slot.slice(1)}: ${v2.routes.length - d.routes} routes, ${Object.keys(v2.ap).length - d.airports} airports` +
    (d.routes + d.airports + d.pax ? ` · dropped ${d.routes} routes, ${d.airports} airports, ${fmtN(d.pax)} pax` : '') : 'Import failed (storage full?)', 'event');
  return ok;
}
function firstRunImport() { if (ls.get('fc2_auto', null) || !ls.get('fc_auto', null)) return; let n = 0; for (const s of ['auto', 's1', 's2', 's3', 's4', 's5']) if (importV1(s, true)) n++; if (n) toast(`⬇ Imported ${n} v1 save${n > 1 ? 's' : ''} (v1 data untouched)`, 'event'); }
let lastAuto = 0;
function save(slot) { if (!S) return; const ok = ls.set('fc2_' + slot, serialize()); if (!ok && slot !== 'auto') toast('Save failed (storage full?)'); return ok; }
function load(slot) { const o = ls.get('fc2_' + slot, null); if (!o) return false; deserialize(o); sel = null; linkFrom = null; closeSheet(); closeModal(); speed = 1; centerOn(S.home >= 0 ? S.home : null);
  if (DROP.routes + DROP.airports + DROP.cities) toast(`⚠️ Some cities no longer exist: dropped ${DROP.routes} routes, ${DROP.airports} airports`); return true; }

// ================= AUDIO =================
let AC = null, lastCoin = 0;
// iOS only lets a user gesture start audio: create/resume the context on every touch so the first coin() from the sim loop isn't stuck 'suspended'
document.addEventListener('pointerdown', () => { if (SET.mute) return; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch {} }, { passive: true });
function sfx(kind) {
  if (SET.mute) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    const notes = { route: [520, 780], buy: [440, 660], sell: [600, 400], unlock: [523, 659, 784], no: [220, 180], event: [700, 500, 700], ach: [523, 659, 784, 1046], coin: [1200] }[kind] || [600];
    notes.forEach((f, k) => {
      const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + k * 0.07;
      o.type = kind === 'coin' ? 'triangle' : 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'coin' ? 0.03 : 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.16);
    });
  } catch {}
  if (navigator.vibrate && kind !== 'coin') navigator.vibrate(kind === 'no' ? [20, 40, 20] : 15);
}
function coin() { const n = performance.now(); if (n - lastCoin > 400) { lastCoin = n; sfx('coin'); } }

// ================= RENDERING =================
const bg = $('#bg'), fg = $('#fg'), bgx = bg.getContext('2d'), fgx = fg.getContext('2d');
let W = 0, H = 0, DPR = 1;
const cam = { x: 180, y: 70, z: 3 };
const zMin = () => Math.min(H / 175, W / 360); // whole world fits on screen, even in portrait
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  for (const c of [bg, fg]) { c.width = W * DPR; c.height = H * DPR; c.style.width = W + 'px'; c.style.height = H + 'px'; }
  clampCam();
}
function clampCam() {
  cam.z = Math.max(zMin(), Math.min(250, cam.z));
  const half = H / 2 / cam.z; cam.y = half >= 90 ? 90 : Math.max(half - 2, Math.min(178 - half, cam.y));
  cam.x = ((cam.x % 360) + 360) % 360; bgDirty = true;
}
function centerOn(i, z) { if (i == null || i < 0) { cam.x = 180; cam.y = 70; cam.z = zMin(); } else { cam.x = C[i].x; cam.y = C[i].y; cam.z = z || 14; } clampCam(); }
const sheetH = () => sheet.classList.contains('full') ? 0.85 : 0.45; // fraction of the screen the open bottom sheet covers
function reveal(y) { const top = H * (1 - sheetH()); if (y > top - 40) { cam.y += (y - top / 2) / cam.z; clampCam(); } } // pan the tapped thing above the bottom sheet
const SX = X => W / 2 + wrapD(X - cam.x) * cam.z, SY = Y => H / 2 + (Y - cam.y) * cam.z;
// ---- themes: light = bright game-board, dark = flight tracker. Canvas colours live here, CSS ones in :root[data-theme]
const THEMES = {
  light: { sea: '#6fc3ec', void: '#4fa6d6', landOff: '#cfd6dc', border: 'rgba(255,255,255,.9)', borderOn: 'rgba(120,100,60,.45)', countryTint: true,
    city: '#fff', cityLk: '#aeb8c2', cityEdge: '#2f3b47', cityEdgeLk: '#7f8b96', dot: 'rgba(60,75,90,.55)', label: '#1f2a33', halo: 'rgba(255,255,255,.9)', sel: '#1c7ed6', dragLine: '#222', planeEdge: '#fff', glow: 0, routeW: 3.2,
    rcol: ['#e6194b', '#2bb34a', '#3f5fd8', '#f58231', '#8f2fc4', '#0aa5a5', '#e832d6', '#9a6324', '#7f8c00', '#1f2fa8', '#e6a700', '#008080'] },
  dark: { sea: '#0b1a33', void: '#06101f', landOff: '#1a2a40', landOn: '#243b58', border: 'rgba(90,130,170,.35)', borderOn: 'rgba(120,170,220,.5)', countryTint: false,
    city: '#dfe9f5', cityLk: '#4a5a6d', cityEdge: '#8fb4d8', cityEdgeLk: '#2c3a4b', dot: 'rgba(170,200,230,.5)', label: '#e6eef8', halo: 'rgba(5,15,30,.9)', sel: '#4dabf7', dragLine: '#fff', planeEdge: '#fff', glow: 1, routeW: 2,
    rcol: ['#ff4d6d', '#51e07a', '#5c8dff', '#ffa94d', '#c77dff', '#22d3ee', '#ff6bf0', '#ffd166', '#a3e635', '#8ab4ff', '#ffe066', '#2dd4bf'] },
};
let COL = THEMES.light, RCOL = COL.rcol;
const hue = s => { let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) % 360; return h; };
const tintOf = n => `hsl(${hue(n)},55%,88%)`; // soft distinct pastel per unlocked country (light theme)
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = SET.theme === 'dark' || (SET.theme === 'auto' && mq.matches);
  COL = THEMES[dark ? 'dark' : 'light']; RCOL = COL.rcol; document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = $('meta[name=theme-color]'); if (m) m.content = dark ? '#0b1a33' : '#6fc3ec'; bgDirty = true;
}
mq.addEventListener('change', applyTheme); applyTheme();
const LVCOL = ['#7a8a99', '#2f9e44', '#1971c2', '#7048e8', '#e8590c', '#c2255c', '#ffd43b'];
function drawBg() {
  bgDirty = false; const g = bgx;
  const x0 = W / 2 - cam.x * cam.z, y0 = H / 2 - cam.y * cam.z, span = 360 * cam.z;
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = COL.void; g.fillRect(0, 0, W, H); g.fillStyle = COL.sea; g.fillRect(0, y0, W, 180 * cam.z);
  const openNames = S ? (S.allOpen ? null : S.unlocked) : new Set();
  for (let k = -1; k <= 2; k++) {
    const ox = x0 + k * span; if (ox > W || ox + span < 0) continue;
    g.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, DPR * ox, DPR * y0);
    g.lineWidth = 0.7 / cam.z; g.lineJoin = 'round';
    for (const ct of PATHS) { const on = !openNames || openNames.has(ct.n); g.fillStyle = on ? (COL.countryTint ? tintOf(ct.n) : COL.landOn) : COL.landOff; g.fill(ct.path); }
    for (const ct of PATHS) { const on = !openNames || openNames.has(ct.n); g.strokeStyle = on ? COL.borderOn : COL.border; g.stroke(ct.path); }
  }
}
let VIS = [], drag = null;
const FILTERS = ['All cities', 'Big cities', 'Interesting', 'My network']; // hud() prefixes the icon (◆ for interesting)
const passFilter = c => SET.filter === 0 || (SET.filter === 1 ? c.pop >= 1 : SET.filter === 2 ? c.t && c.t !== 'finance' : false);
function drawFg() {
  const g = fgx; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  if (!S) return;
  const z = cam.z, x0 = W / 2 - cam.x * z, y0 = H / 2 - cam.y * z, span = 360 * z;
  // routes (dark theme: a wide faint pass under the thin bright one = cheap glow, no shadowBlur)
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = COL.glow ? 0 : 1; pass < 2; pass++) for (const r of S.routes) {
    const isSel = sel && sel.type === 'route' && sel.id === r.id, on = !!r.planes.length;
    g.strokeStyle = RCOL[r.id % RCOL.length]; g.lineWidth = pass ? (isSel ? COL.routeW + 2 : COL.routeW) : (isSel ? 12 : 7); g.globalAlpha = pass ? (on ? 0.9 : 0.35) : (on ? 0.22 : 0.08);
    for (let k = -2; k <= 2; k++) {
      const ox = x0 + k * span; if (ox + r.bx1 * z < -20 || ox + r.bx0 * z > W + 20) continue;
      g.beginPath(); for (let n = 0; n < r.pts.length; n += 2) { const X = ox + r.pts[n] * z, Y = y0 + r.pts[n + 1] * z; n ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
    }
  }
  g.globalAlpha = 1;
  // drag line (snaps to drag.to) / tap-tap origin
  const from = drag ? drag.from : linkFrom;
  if (from != null) { const c = C[from], tx = drag ? (drag.to != null ? SX(C[drag.to].x) : drag.x) : null, ty = drag ? (drag.to != null ? SY(C[drag.to].y) : drag.y) : null;
    g.setLineDash([6, 6]); g.strokeStyle = COL.dragLine; g.lineWidth = 2; g.beginPath(); g.moveTo(SX(c.x), SY(c.y)); if (drag) g.lineTo(tx, ty); else g.arc(SX(c.x), SY(c.y), 14, 0, 7); g.stroke(); g.setLineDash([]);
    if (drag && drag.to != null && drag.to !== drag.from) { const q = routeQuote(drag.from, drag.to);
      const txt = `${C[drag.to].n} · ${Math.round(q.km).toLocaleString()} km · L${q.L + 1} · ${fmt$(q.cost)}`;
      g.font = '600 13px -apple-system,system-ui,sans-serif'; const w = g.measureText(txt).width + 14; g.fillStyle = 'rgba(20,30,40,.88)'; g.fillRect(tx - w / 2, ty - 54, w, 22); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, tx, ty - 43); } }
  // cities: walk in importance order (so VIS is pre-sorted for labels); zoom reveals more, filter chip narrows, network/selected always drawn
  const nShow = Math.min(NC, Math.floor(25 * Math.pow(z, 1.3))), small = Math.floor(nShow * 0.6); // ~27 cities at world view, all 2,300 by z≈32
  VIS = []; const selId = sel && sel.type === 'city' ? sel.id : -1, pad = 30;
  for (let k = 0; k < NC; k++) {
    const i = RANK[k], c = C[i], net = inNet(i), isSel = i === selId || i === linkFrom;
    if (!net && !isSel && (SET.filter ? !passFilter(c) : k >= nShow)) continue; // a filter shows everything that passes it; "All" zoom-reveals by rank
    const x = SX(c.x), y = SY(c.y); if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
    VIS.push([i, x, y]);
    const open = isOpen(i);
    if (!net && !isSel && !SET.filter && k >= small) { g.fillStyle = COL.dot; g.fillRect(x - 1, y - 1, 2.5, 2.5); continue; } // tiny dot: minor city not yet zoomed in on
    const rad = 2.5 + Math.min(4, Math.log10(1 + c.pop * 10) * 1.6) + (net ? 1.5 : 0);
    g.fillStyle = open ? COL.city : COL.cityLk; g.strokeStyle = open ? COL.cityEdge : COL.cityEdgeLk; g.lineWidth = 1.3;
    g.beginPath();
    if (c.t && c.t !== 'finance') { g.moveTo(x, y - rad - 1); g.lineTo(x + rad + 1, y); g.lineTo(x, y + rad + 1); g.lineTo(x - rad - 1, y); g.closePath(); }
    else g.arc(x, y, rad, 0, 7);
    g.fill(); g.stroke();
    if (net) {
      const a = S.ap[i], f = a ? a.wait / cap(i) : 0;
      g.strokeStyle = closed(i) ? '#555' : f >= 1 ? '#e03131' : f > 0.75 ? '#f76707' : f > 0.5 ? '#f2c94c' : '#40c057';
      g.lineWidth = 3; g.beginPath(); g.arc(x, y, rad + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.08, Math.min(1, f))); g.stroke();
    }
    if (S.hubs.has(i)) { g.fillStyle = '#ffd43b'; g.strokeStyle = '#8a6d00'; g.lineWidth = 1; star(g, x + rad + 3, y - rad - 3, 5); }
    if (isSel || (drag && drag.to === i)) { g.strokeStyle = COL.sel; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, rad + 7, 0, 7); g.stroke(); }
  }
  // labels: greedy, most important first (VIS is already in rank order)
  g.font = '600 11px -apple-system,system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const occ = new Set(), labelN = Math.floor(nShow * 0.45);
  for (const [i, x, y] of VIS) {
    if (!SET.filter && RANKOF[i] > labelN && !inNet(i) && i !== selId && !(drag && drag.to === i)) continue;
    const cell = Math.floor((x + 8) / 70) + ',' + Math.floor(y / 16); if (occ.has(cell)) continue; occ.add(cell);
    g.lineWidth = 3; g.strokeStyle = COL.halo; g.strokeText(C[i].n, x + 8, y); g.fillStyle = COL.label; g.fillText(C[i].n, x + 8, y);
  }
  // planes
  for (const r of S.routes) for (const p of r.planes) {
    let f; if (p.at >= 0) continue; f = p.from === r.a ? p.t : 1 - p.t;
    const n = r.pts.length / 2 - 1, u = Math.min(n - 0.0001, f * n), k = Math.floor(u), w = u - k;
    const X = r.pts[2 * k] + (r.pts[2 * k + 2] - r.pts[2 * k]) * w, Y = r.pts[2 * k + 1] + (r.pts[2 * k + 3] - r.pts[2 * k + 1]) * w;
    let ang = Math.atan2(r.pts[2 * k + 3] - r.pts[2 * k + 1], r.pts[2 * k + 2] - r.pts[2 * k]); if (p.from !== r.a) ang += Math.PI;
    const x = SX(X), y = SY(Y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const lc = p.custom ? '#ff00aa' : LVCOL[p.lvl]; plane(g, x, y, ang, COL.glow ? '#fff' : lc, COL.glow ? lc : COL.planeEdge, 5 + p.lvl * 0.6); // dark theme: white planes, level-coloured outline
  }
}
function spark(h, k, w = 120, ht = 28, col = 'var(--pri)') { // inline SVG sparkline of column k of a history array
  if (!h || h.length < 2) return '<span class="sub">no history yet</span>';
  const v = h.map(r => r[k]), lo = Math.min(0, ...v), hi = Math.max(...v) || 1, n = v.length;
  const pts = v.map((y, i) => `${(i / (n - 1) * (w - 2) + 1).toFixed(1)},${(ht - 2 - (y - lo) / (hi - lo) * (ht - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function graph(h, k, label, fmt) { // bigger line graph for the dashboard: x = week (explicit, so downsampled history stays honest)
  if (h.length < 2) return `<div class="sub">${label}: no history yet</div>`;
  const w = 320, ht = 90, xs = h.map(r => r[0]), ys = h.map(r => r[k]), x0 = xs[0], x1 = xs[xs.length - 1], lo = Math.min(0, ...ys), hi = Math.max(...ys) || 1;
  const pts = h.map(r => `${((r[0] - x0) / (x1 - x0 || 1) * (w - 4) + 2).toFixed(1)},${(ht - 12 - (r[k] - lo) / (hi - lo) * (ht - 20)).toFixed(1)}`).join(' ');
  return `<div class="gr"><div class="sub">${label} · peak ${fmt(hi)} (wk ${h[ys.indexOf(hi)][0]})</div><svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--pri)" stroke-width="2" stroke-linejoin="round"/>
    <text x="2" y="${ht - 2}" class="ax">wk ${x0}</text><text x="${w - 2}" y="${ht - 2}" text-anchor="end" class="ax">wk ${x1}</text></svg></div>`;
}
function star(g, x, y, r) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } g.closePath(); g.fill(); g.stroke(); }
function plane(g, x, y, a, col, edge, s) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.strokeStyle = edge; g.lineWidth = 1;
  g.beginPath(); g.moveTo(s * 1.2, 0); g.lineTo(-s * 0.2, -s * 0.15); g.lineTo(-s * 0.3, -s); g.lineTo(-s * 0.55, -s); g.lineTo(-s * 0.55, -s * 0.15);
  g.lineTo(-s, -s * 0.12); g.lineTo(-s * 1.1, -s * 0.45); g.lineTo(-s * 1.25, -s * 0.45); g.lineTo(-s * 1.2, 0);
  g.lineTo(-s * 1.25, s * 0.45); g.lineTo(-s * 1.1, s * 0.45); g.lineTo(-s, s * 0.12); g.lineTo(-s * 0.55, s * 0.15); g.lineTo(-s * 0.55, s); g.lineTo(-s * 0.3, s); g.lineTo(-s * 0.2, s * 0.15);
  g.closePath(); g.fill(); g.stroke(); g.restore();
}

// ================= INPUT =================
function cityAt(x, y, r = 20) { let best = null, bd = r * r; for (const [i, cx, cy] of VIS) { const d = (cx - x) ** 2 + (cy - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
function routeAt(x, y) {
  const z = cam.z, x0 = W / 2 - cam.x * z, y0 = H / 2 - cam.y * z, span = 360 * z; let best = null, bd = 14 * 14;
  for (const r of S.routes) for (let k = -2; k <= 2; k++) {
    const ox = x0 + k * span; if (ox + r.bx1 * z < -20 || ox + r.bx0 * z > W + 20) continue;
    for (let n = 2; n < r.pts.length; n += 2) {
      const ax = ox + r.pts[n - 2] * z, ay = y0 + r.pts[n - 1] * z, bx = ox + r.pts[n] * z, by = y0 + r.pts[n + 1] * z;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
      const d = (ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2; if (d < bd) { bd = d; best = r; }
    }
  }
  return best;
}
const ptrs = new Map(); let gest = null;
fg.addEventListener('pointerdown', e => {
  try { fg.setPointerCapture(e.pointerId); } catch {} ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) { const c = S ? cityAt(e.clientX, e.clientY) : null;
    gest = { type: c != null && !S.picking ? 'drag' : 'pan', city: c, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false }; }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = null;
    gest = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.x, cy: cam.y }; }
});
fg.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!gest) return;
  if (gest.type === 'pinch' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const wx = gest.cx + (gest.mx - W / 2) / gest.z, wy = gest.cy + (gest.my - H / 2) / gest.z;
    cam.z = gest.z * d / gest.d; clampCam(); cam.x = wx - (mx - W / 2) / cam.z; cam.y = wy - (my - H / 2) / cam.z; clampCam(); return;
  }
  const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
  if (!gest.moved && dx * dx + dy * dy > 64) gest.moved = true;
  if (!gest.moved) return;
  if (gest.type === 'pan') { cam.x = gest.cx - dx / cam.z; cam.y = gest.cy - dy / cam.z; clampCam(); }
  else if (gest.type === 'drag') { const to = cityAt(e.clientX, e.clientY, 44); drag = { from: gest.city, x: e.clientX, y: e.clientY, to: to === gest.city ? null : to }; edgePan(e.clientX, e.clientY); } // generous radius: the nearest city "magnetically" snaps
});
function edgePan(x, y) { const m = 40, v = 6 / cam.z; if (x < m) cam.x -= v; if (x > W - m) cam.x += v; if (y < m + 50) cam.y -= v; if (y > H - m) cam.y += v; clampCam(); }
function endPtr(e) {
  ptrs.delete(e.pointerId); if (!gest) return;
  if (gest.type === 'pinch') { if (ptrs.size === 0) gest = null; return; }
  if (gest.type === 'drag' && gest.moved) { const to = drag && drag.to != null ? drag.to : cityAt(e.clientX, e.clientY, 44); if (to != null) tryRoute(gest.city, to); }
  else if (!gest.moved) tap(e.clientX, e.clientY);
  drag = null; gest = null;
}
fg.addEventListener('pointerup', endPtr); fg.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); gest = null; drag = null; });
fg.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.002), wx = cam.x + (e.clientX - W / 2) / cam.z, wy = cam.y + (e.clientY - H / 2) / cam.z;
  cam.z *= f; clampCam(); cam.x = wx - (e.clientX - W / 2) / cam.z; cam.y = wy - (e.clientY - H / 2) / cam.z; clampCam(); }, { passive: false });
function tap(x, y) {
  if (!S) return;
  const c = cityAt(x, y);
  if (c != null) { reveal(y); if (S.picking) return showPick(c); if (linkFrom != null && linkFrom !== c) return showLink(linkFrom, c); sel = { type: 'city', id: c }; showCity(c); return; }
  const r = routeAt(x, y);
  if (r) { reveal(y); sel = { type: 'route', id: r.id }; showRoute(r); return; }
  sel = null; linkFrom = null; closeSheet();
}
function showLink(a, b) { // tap-tap route building: confirm sheet
  const q = routeQuote(a, b), dup = hasRoute(a, b), lock = [a, b].find(i => !isOpen(i));
  openSheet(`<div class="hd"><div><div class="ttl">${esc(C[a].n)} → ${esc(C[b].n)}</div><div class="sub">${Math.round(q.km).toLocaleString()} km · needs L${q.L + 1} · route ${fmt$(q.rc)} + plane ${fmt$(q.pc)}</div></div>${btn('close', '', '✕', 'x')}</div>
    ${dup ? '<div class="warn">This route already exists</div>' : lock != null ? `<div class="warn">🔒 Unlock ${esc(C[lock].c)} first</div>` : ''}
    <div class="row">${dup || lock != null ? '' : btn('linkok', a + ':' + b, `✈️ Open route · ${fmt$(q.cost)}`, 'pri')}${btn('linkcancel', '', 'Cancel', 'ghost')}</div>`);
}

// ================= UI =================
const sheet = $('#sheet'), sheetBody = $('#sheetBody'), modal = $('#modal'), modalBox = $('#modalBox');
let liveFn = null;
function openSheet(html, live, full) { sheetBody.innerHTML = html; sheet.classList.add('open'); sheet.classList.toggle('full', !!full); sheet.scrollTop = 0; liveFn = live || null; refreshLive(); }
function closeSheet() { sheet.classList.remove('open', 'full'); sheet.style.transform = ''; liveFn = null; sel = null; }
// grip: drag up → 85vh, drag down → 45vh or close; tap → toggle half/full
const grip = $('.grip'); let gd = null;
grip.addEventListener('pointerdown', e => { gd = { y: e.clientY, h: sheet.offsetHeight, moved: false }; grip.setPointerCapture(e.pointerId); sheet.style.transition = 'none'; });
grip.addEventListener('pointermove', e => { if (!gd) return; const dy = e.clientY - gd.y; if (Math.abs(dy) > 6) gd.moved = true; if (gd.moved) sheet.style.transform = `translateY(${Math.max(-(H * 0.85 - gd.h), dy)}px)`; });
grip.addEventListener('pointerup', e => {
  if (!gd) return; const dy = e.clientY - gd.y, full = sheet.classList.contains('full'); sheet.style.transition = ''; sheet.style.transform = '';
  if (!gd.moved) sheet.classList.toggle('full'); else if (dy < -60) sheet.classList.add('full'); else if (dy > 60) { if (full) sheet.classList.remove('full'); else closeSheet(); }
  gd = null; if (sel && sheet.classList.contains('open')) { const c = sel.type === 'city' ? C[sel.id] : C[findRoute(sel.id).a]; reveal(SY(c.y)); }
});
grip.addEventListener('pointercancel', () => { gd = null; sheet.style.transition = ''; sheet.style.transform = ''; });
function refreshLive() { const el = $('#live'); if (el && liveFn) el.innerHTML = liveFn(); }
sheetBody.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; const fn = ACT[b.dataset.a]; if (fn) fn(b.dataset.v, b); });
modalBox.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; const fn = ACT[b.dataset.a]; if (fn) fn(b.dataset.v, b); });
let modalWasSpeed = null;
function openModal(html) { modalBox.innerHTML = html; modal.hidden = false; if (modalWasSpeed === null) { modalWasSpeed = speed; speed = 0; } }
function closeModal() { modal.hidden = true; if (modalWasSpeed !== null) { speed = modalWasSpeed || 1; modalWasSpeed = null; } }
let choiceOpts = [];
function showChoice(ch) {
  choiceOpts = ch.opts; sfx('event');
  openModal(`<h2>${esc(ch.title)}</h2><p>${esc(ch.text)}</p><div class="col">${ch.opts.map((o, k) => `<button class="btn ${k ? '' : 'pri'}" data-a="choice" data-v="${k}">${esc(o[0])}</button>`).join('')}</div>`);
}
const btn = (a, v, label, cls = '') => `<button class="btn ${cls}" data-a="${a}" data-v="${v}">${label}</button>`;
const cheatsOn = () => SET.cheats;

let cityTab = 'info';
const routesAt = i => S.routes.filter(r => r.a === i || r.b === i);
const lf = l => l.seats ? Math.round(100 * l.pax / l.seats) : 0;
const traffic = a => a.last.orig + a.last.arr + a.last.xf;
const rowTbl = rows => `<table>${rows.join('')}</table>`;
function showCity(i) {
  const c = C[i], a = S.ap[i], open = isOpen(i), net = inNet(i), stats = cityTab === 'stats' && a && net;
  let h = `<div class="hd"><div><div class="ttl">${esc(c.n)} <span class="iata">${esc(c.iata)}</span></div><div class="sub">${esc(c.c)} · ${REGNAME[c.reg]}</div></div>${btn('close', '', '✕', 'x')}</div>`;
  if (a && net) h += `<div class="tabs">${btn('ctab', 'info', 'Info', cityTab === 'info' ? 'on' : '')}${btn('ctab', 'stats', 'Stats', cityTab === 'stats' ? 'on' : '')}</div>`;
  if (stats) return openSheet(h + `<div id="live"></div>`, () => cityStats(i));
  if (c.t) h += `<div class="badge">${TRAIT[c.t] || c.t}</div>`;
  if (c.f) h += `<p class="fact">${esc(c.f)}</p>`;
  else h += `<div class="grid data">${c.ap ? `<div><b>${esc(c.ap)}</b><span>airport</span></div>` : ''}${c.el != null ? `<div><b>${c.el.toLocaleString()} ft</b><span>elevation</span></div>` : ''}${c.rw ? `<div><b>${c.rw.toLocaleString()} ft</b><span>longest runway</span></div>` : ''}<div><b>${REGNAME[c.reg]}</b><span>region</span></div>${c.iata ? `<div><b>${esc(c.iata)}</b><span>IATA</span></div>` : ''}</div>`;
  h += `<div class="grid"><div><b>${fmtPop(c.pop)}</b><span>metro pop</span></div><div><b>$${c.g}K</b><span>GDP/capita</span></div><div><b>${'★'.repeat(c.e)}</b><span>importance</span></div>`;
  if (a) h += `<div><b>L${a.lvl + 1}</b><span>airport · cap ${fmtN(cap(i))}</span></div>`;
  h += `</div><div id="live"></div><div class="row">`;
  if (!open) h += btn('unlock', c.c, `🔓 Unlock ${esc(c.c)} · ${fmt$(unlockCost(c.c))}`, 'pri');
  else {
    if (a && a.lvl < 6) h += btn('apup', i, `⬆ Airport L${a.lvl + 2} · ${fmt$(CFG.apCost[a.lvl + 1])}`, 'pri');
    if (a && !S.hubs.has(i)) h += btn('hub', i, `⭐ Make hub · ${fmt$(CFG.hubCost * S.hubs.size)}`);
    h += btn('linkfrom', i, linkFrom === i ? '✈️ Tap a destination…' : '✈️ Build route from here') + btn('spokes', i, '🕸 Build spokes');
  }
  h += `</div>`;
  if (!a) h += `<div class="hint">Or drag from this city to another to open a route.</div>`;
  if (cheatsOn()) h += `<div class="cheat"><div class="clab">🧪 Cheats</div><div class="row">${btn('pop', i + ':2', 'Pop ×2')}${btn('pop', i + ':0.5', 'Pop ×½')}${btn('pop', i + ':1', 'Pop reset')}
    ${btn('clearap', i, 'Clear airport')}${btn('maxap', i, 'Max airport')}${btn('freehub', i, 'Free hub')}</div></div>`;
  openSheet(h, () => {
    const a = S.ap[i]; if (!a || !net) return closed(i) ? '<div class="warn">Airport closed</div>' : '';
    const want = new Map(); for (const m of a.q.values()) for (const [d, n] of m) want.set(d, (want.get(d) || 0) + n);
    const tp = topN(want, 5).map(([d, n]) => `${esc(C[d].n)} ${n}`).join(' · ');
    const fx = S.effects.filter(e => fxMatch(e, c)).map(e => e.label).join(', ');
    return `<div class="livebox"><div>Waiting <b class="${a.full ? 'red' : ''}">${fmtN(a.wait)}/${fmtN(cap(i))}</b> · Transfers <b>${fmtN(a.xfer)}</b> · Last wk <b>${fmt$(a.last.inc)}</b></div>
      ${tp ? `<div class="sm">Wants: ${tp}</div>` : ''}${fx ? `<div class="sm">⚡ ${esc(fx)}</div>` : ''}${closed(i) ? '<div class="warn">Airport closed</div>' : ''}</div>`;
  });
}
function cityStats(i) {
  const a = S.ap[i], c = C[i], l = a.last;
  const all = NODES.map(j => [j, S.ap[j] ? traffic(S.ap[j]) : 0]).sort((x, y) => y[1] - x[1]), rank = all.findIndex(x => x[0] === i) + 1;
  const inC = all.filter(x => C[x[0]].c === c.c), crank = inC.findIndex(x => x[0] === i) + 1;
  const want = new Map(); for (const m of a.q.values()) for (const [d, n] of m) want.set(d, (want.get(d) || 0) + n);
  const unmet = new Map(l.um); for (const [d, n] of a.wk.um) unmet.set(d, (unmet.get(d) || 0) + n);
  const wanted = new Map(want); for (const [d, n] of unmet) wanted.set(d, (wanted.get(d) || 0) + n);
  const flows = new Map(l.flows); for (const [k, n] of a.wk.flows) flows.set(k, (flows.get(k) || 0) + n);
  const rs = routesAt(i).sort((x, y) => y.last.inc - x.last.inc);
  return `<div class="livebox"><b>#${rank}</b> busiest of ${all.length} in network · <b>#${crank}</b> of ${inC.length} in ${esc(c.c)}</div>
    <div class="grid"><div><b>${fmtN(l.orig)}</b><span>departing /wk</span></div><div><b>${fmtN(l.arr)}</b><span>arriving /wk</span></div><div><b>${fmtN(l.xf)}</b><span>transferring /wk</span></div>
    <div><b class="${l.unmet ? 'red' : ''}">${fmtN(l.unmet)}</b><span>turned away /wk</span></div><div><b>${fmt$(l.inc)}</b><span>income /wk</span></div><div><b>${fmt$(a.inc)}</b><span>lifetime income</span></div></div>
    <div class="sp">Waiting, last ${Math.min(12, a.h.length)} wk ${spark(a.h.slice(-12), 0)} <span class="sub">now ${fmtN(a.wait)}/${fmtN(cap(i))}</span></div>
    <div class="sp">Income, last ${Math.min(12, a.h.length)} wk ${spark(a.h.slice(-12), 1, 120, 28, '#2f9e44')}</div>
    <h3>Top wanted destinations</h3>${rowTbl(topN(wanted, 10).map(([d, n]) => `<tr data-a="gocity" data-v="${d}"><td>${esc(C[d].n)}</td><td>${fmtN(want.get(d) || 0)} waiting</td><td class="${unmet.get(d) ? 'red' : ''}">${fmtN(unmet.get(d) || 0)} unmet</td></tr>`))}
    <h3>Routes here (${rs.length})</h3>${rowTbl(rs.map(r => `<tr data-a="goroute" data-v="${r.id}"><td>${esc(C[r.a === i ? r.b : r.a].n)}</td><td>${lf(r.last)}% load</td><td>${fmt$(r.last.inc)}</td><td>${r.planes.length} ✈</td></tr>`))}
    ${flows.size ? `<h3>Top transfer flows</h3>${rowTbl(topN(flows, 5).map(([k, n]) => { const [f, t] = k.split('>'); return `<tr><td>${esc(C[+f].n)} → ${esc(C[+t].n)} via here</td><td>${fmtN(n)}/wk</td></tr>`; }))}` : ''}`;
}
function showRoute(r) {
  const L = minLevel(r.km);
  let h = `<div class="hd"><div><div class="ttl">${esc(C[r.a].n)} ⇄ ${esc(C[r.b].n)}</div><div class="sub">${Math.round(r.km).toLocaleString()} km · fare ${fmt$(r.fare)} · needs L${L + 1}+</div></div>${btn('close', '', '✕', 'x')}</div>`;
  h += `<div id="live"></div><div class="planes">`;
  r.planes.forEach((p, k) => {
    const up = !p.custom && p.lvl < 5 ? btn('pup', r.id + ':' + k, `⬆ L${p.lvl + 2} ${fmt$(planeCost(p.lvl + 1) - CFG.planes[p.lvl].cost * gMult('cost'))}`) : '';
    h += `<div class="pl"><span class="dot" style="background:${p.custom ? '#ff00aa' : LVCOL[p.lvl]}"></span><span>${p.custom ? 'Custom' : p.lvl === 6 ? 'Super Jet' : 'L' + (p.lvl + 1)} · ${p.seats} seats · ${p.kmh} km/h</span>${up}${btn('psell', r.id + ':' + k, `Sell +${fmt$(p.paid)}`, 'ghost')}</div>`;
  });
  h += `</div><div class="row">${btn('padd', r.id, `+ Plane L${L + 1} · ${fmt$(planeCost(L))}`, 'pri')}${btn('rdel', r.id, `Delete route (+${fmt$(r.cost + r.planes.reduce((s, p) => s + p.paid, 0))})`, 'ghost')}</div>
    <h3>Bulk</h3><div class="row">${btn('bulk', 'rup:' + r.id, '⬆ All planes +1 level')}${btn('bulk', 'rmax:' + r.id, '⏫ Max out (all → L6)')}${btn('bulk', 'radd:' + r.id + ':1', '+1 plane')}${btn('bulk', 'radd:' + r.id + ':3', '+3 planes')}${btn('bulk', 'radd:' + r.id + ':5', '+5 planes')}</div>`;
  if (cheatsOn()) h += `<div class="cheat"><div class="clab">🧪 Cheats</div><div class="row">${btn('superjet', r.id, '🚀 Spawn Super Jet')}</div>
    <div class="row"><input id="cs" type="number" placeholder="seats" value="1000"><input id="ck" type="number" placeholder="km/h" value="3000">${btn('custom', r.id, 'Add custom plane')}</div></div>`;
  openSheet(h, () => { const l = r.last, paid = r.cost + r.planes.reduce((s, p) => s + p.paid, 0), n = r.planes.length, mix = l.dir + l.xf;
    return `<div class="livebox">Last week: <b>${fmt$(l.inc)}</b> · load <b>${lf(l)}%</b> · <b>${fmtN(l.pax)}</b> pax · ${n} plane${n === 1 ? '' : 's'}
      <div class="sm">${fmt$(n ? l.inc / n : 0)}/plane/wk · payback ${l.inc > 0 ? (paid / l.inc).toFixed(1) + ' wk' : '—'} · lifetime ${fmt$(r.inc)}${mix ? ` · ${Math.round(100 * l.dir / mix)}% direct / ${Math.round(100 * l.xf / mix)}% connecting` : ''}</div>
      <div class="sp">Load ${spark(r.h.slice(-12), 0)} Income ${spark(r.h.slice(-12), 1, 120, 28, '#2f9e44')}</div></div>`; });
}
// ---- bulk actions: every one previews first (what, how many, total) with a budget cap, then applies in one go
let bulkCap = 100, bulkCur = null;
function bulk(title, items, opts = {}) { // items: [{t: label, c: cost, fn}] in priority order; cap trims to what fits in bulkCap% of cash
  bulkCur = { title, items, opts }; const free = S.infinite || S.ch.free, budget = free ? Infinity : Math.max(0, S.cash) * bulkCap / 100;
  let tot = 0; const go = []; for (const it of items) { if (tot + it.c > budget) continue; tot += it.c; go.push(it); }
  bulkCur.go = go; bulkCur.tot = tot;
  openModal(`<h2>${esc(title)}</h2><p>${go.length} of ${items.length} action${items.length === 1 ? '' : 's'} · total <b>${free ? 'free' : fmt$(tot)}</b>${free ? '' : ` · cash ${fmt$(S.cash)}`}</p>
    ${free ? '' : `<div class="row"><span class="sub">Spend at most</span>${[10, 25, 50, 100].map(p => btn('bulkcap', p, p + '%', p === bulkCap ? 'pri' : '')).join('')}</div>`}
    <div class="list">${go.slice(0, 40).map(it => `<div class="li">${it.t}<span>${fmt$(it.c)}</span></div>`).join('')}${go.length > 40 ? `<div class="sub">… and ${go.length - 40} more</div>` : ''}${go.length ? '' : '<div class="sub">Nothing fits the budget</div>'}</div>
    <div class="row">${go.length ? btn('bulkok', '', `Confirm · ${free ? 'free' : fmt$(tot)}`, 'pri') : ''}${btn('bulkno', '', 'Cancel', 'ghost')}</div>`);
}
function bulkApply() {
  const b = bulkCur; if (!b || !spend(b.tot, 'this')) return; for (const it of b.go) it.fn(); closeModal(); bulkCur = null;
  if (b.opts.rebuild) rebuild(); sfx('buy'); toast(`✅ ${b.title}: ${b.go.length} done · ${fmt$(b.tot)}`); checkMiles();
  if (b.opts.after) b.opts.after(); else if (sel && sheet.classList.contains('open')) sel.type === 'route' ? showRoute(findRoute(sel.id)) : showCity(sel.id); // re-render the card the action came from
}
const load_ = r => lf(r.last), byLoad = (x, y) => load_(y) - load_(x);
const BULK = { // id → items builder; route-level ones get the route, network ones a param
  rup: r => r.planes.filter(p => isFinite(upCost(p))).map(p => ({ t: `${C[r.a].n}–${C[r.b].n}: L${p.lvl + 1} → L${p.lvl + 2}`, c: upCost(p), fn: () => rawUpgrade(p, upCost(p)) })),
  rmax: r => r.planes.flatMap(p => { const out = []; for (let L = p.lvl; !p.custom && L < 5; L++) { const c = planeCost(L + 1) - CFG.planes[L].cost * gMult('cost'); out.push({ t: `${C[r.a].n}–${C[r.b].n}: L${L + 1} → L${L + 2}`, c, fn: () => rawUpgrade(p, c) }); } return out; }),
  radd: (r, n) => { const L = minLevel(r.km), c = planeCost(L); return Array.from({ length: +n }, () => ({ t: `${C[r.a].n}–${C[r.b].n}: + L${L + 1} plane`, c, fn: () => r.planes.push(mkPlane(r, L, c)) })); },
  lvl: X => S.routes.flatMap(r => r.planes.filter(p => p.lvl === +X && !p.custom).map(p => [r, p])).sort((x, y) => byLoad(x[0], y[0])).map(([r, p]) => ({ t: `${C[r.a].n}–${C[r.b].n}: L${p.lvl + 1} → L${p.lvl + 2}`, c: upCost(p), fn: () => rawUpgrade(p, upCost(p)) })),
  load: X => S.routes.filter(r => load_(r) > +X).sort(byLoad).map(r => { const L = minLevel(r.km), c = planeCost(L); return { t: `${C[r.a].n}–${C[r.b].n} (${load_(r)}%): + L${L + 1}`, c, fn: () => r.planes.push(mkPlane(r, L, c)) }; }),
  full: () => Object.keys(S.ap).map(Number).filter(i => inNet(i) && S.ap[i].full && S.ap[i].lvl < 6).sort((x, y) => S.ap[y].wait / cap(y) - S.ap[x].wait / cap(x)).map(i => ({ t: `${C[i].n}: airport L${S.ap[i].lvl + 1} → L${S.ap[i].lvl + 2}`, c: CFG.apCost[S.ap[i].lvl + 1], fn: () => rawApUp(i) })),
  hubs: () => [...S.hubs].flatMap(i => { const a = ap(i), out = []; for (let L = a.lvl; L < 6; L++) out.push({ t: `${C[i].n}: airport L${L + 1} → L${L + 2}`, c: CFG.apCost[L + 1], fn: () => rawApUp(i) }); return out; }),
};
const BULK_TITLE = { rup: 'Upgrade all planes on route', rmax: 'Max out route', radd: 'Add planes', lvl: 'Upgrade every plane of this level', load: 'Add a plane to busy routes', full: 'Upgrade full airports', hubs: 'Max out hub airports' };
function runBulk(v) { const [id, p1, p2] = v.split(':'); const items = id[0] === 'r' ? BULK[id](findRoute(p1), p2) : BULK[id](p1); if (!items.length) return toast('Nothing to do'); bulk(BULK_TITLE[id], items); }
function showBulk() {
  const lv = +($('#blvl')?.value ?? 0), ld = +($('#bload')?.value ?? 80);
  openSheet(`<div class="hd"><div class="ttl">🧰 Bulk actions</div>${btn('close', '', '✕', 'x')}</div><div class="hint">Each action previews what it will do and lets you cap the spend.</div>
    <h3>Planes</h3><div class="row"><select id="blvl">${[0, 1, 2, 3, 4].map(L => `<option value="${L}" ${L === lv ? 'selected' : ''}>L${L + 1} → L${L + 2}</option>`).join('')}</select>${btn('bulksel', 'lvl', '⬆ Upgrade every plane of that level', 'pri')}</div>
    <div class="row"><label class="sub">Routes over <b id="bloadv">${ld}</b>% load <input id="bload" type="range" min="50" max="100" step="5" value="${ld}"></label>${btn('bulksel', 'load', '+ Add a plane to each', 'pri')}</div>
    <h3>Airports</h3><div class="row">${btn('bulk', 'full', '🔴 Upgrade every full airport +1')}${btn('bulk', 'hubs', '⭐ Max out every hub airport')}</div>
    <h3>Network</h3><div class="row">${btn('country', '', '🌐 Connect a country')}</div>`);
  $('#bload').addEventListener('input', e => { $('#bloadv').textContent = e.target.value; });
}
// ---- spokes: searchable checklist of destinations from a city
let spk = null;
function spokeList() {
  const i = spk.from, conn = new Set(routesAt(i).map(r => r.a === i ? r.b : r.a)), q = spk.q.toLowerCase();
  const cs = C.filter(c => c.i !== i && isOpen(c.i) && !conn.has(c.i) && (!spk.ctry || c.c === spk.ctry) && (!q || c.n.toLowerCase().includes(q) || c.c.toLowerCase().includes(q)));
  cs.sort(spk.sort === 'pop' ? (a, b) => b.pop - a.pop : (a, b) => dist(i, a.i) - dist(i, b.i));
  return cs.slice(0, 300).map(c => { const q = routeQuote(i, c.i); return `<label class="li"><input type="checkbox" data-a="sptick" data-v="${c.i}" ${spk.sel.has(c.i) ? 'checked' : ''}><div><b>${esc(c.n)}</b><div class="sub">${esc(c.c)} · ${Math.round(q.km).toLocaleString()} km · L${q.L + 1}</div></div><span>${fmt$(q.cost)}</span></label>`; }).join('') +
    (cs.length > 300 ? '<div class="sub">Showing 300 · refine the search</div>' : cs.length ? '' : '<div class="sub">No open, unconnected cities match</div>');
}
function spokeCount() { const i = spk.from, total = [...spk.sel].reduce((s, j) => s + routeQuote(i, j).cost, 0); $('#spcount').textContent = `${spk.sel.size} selected · ${fmt$(total)}`; $('#spgo').textContent = `✈️ Open ${spk.sel.size} routes · ${fmt$(total)}`; }
function showSpokes(i) {
  if (!spk || spk.from !== i) spk = { from: i, q: '', sort: 'dist', ctry: '', sel: new Set() };
  const ctrys = [...new Set(C.filter(c => isOpen(c.i)).map(c => c.c))].sort();
  openSheet(`<div class="hd"><div><div class="ttl">🕸 Spokes from ${esc(C[i].n)}</div><div class="sub" id="spcount"></div></div>${btn('close', '', '✕', 'x')}</div>
    <div class="row"><input id="spq" type="search" placeholder="Search city or country" value="${esc(spk.q)}"><select id="spc"><option value="">All countries</option>${ctrys.map(n => `<option ${n === spk.ctry ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    ${btn('spsort', 'dist', 'By distance', spk.sort === 'dist' ? 'pri' : '')}${btn('spsort', 'pop', 'By pop', spk.sort === 'pop' ? 'pri' : '')}</div>
    <div class="list" id="splist">${spokeList()}</div><div class="row"><button class="btn pri" id="spgo" data-a="spgo" data-v="${i}"></button></div>`, null, true);
  spokeCount();
  $('#spq').addEventListener('input', e => { spk.q = e.target.value; $('#splist').innerHTML = spokeList(); });
  $('#spc').addEventListener('change', e => { spk.ctry = e.target.value; $('#splist').innerHTML = spokeList(); });
}
function spokeItems(i, dests) { return dests.map(j => { const q = routeQuote(i, j); return { t: `${C[i].n} ⇄ ${C[j].n} · L${q.L + 1}`, c: q.cost, fn: () => rawRoute(i, j, q) }; }).sort((x, y) => x.c - y.c); }
// ---- connect a country: star around its biggest city, or a nearest-neighbour chain
function showCountry() {
  const cs = (S.allOpen ? [...COUNTRY.keys()] : [...S.unlocked]).filter(n => COUNTRY.get(n).cities.length > 1).sort();
  openSheet(`<div class="hd"><div class="ttl">🌐 Connect a country</div>${btn('close', '', '✕', 'x')}</div><div class="hint">Opens routes between every open city of the country (existing routes are skipped), each with its minimum-level plane.</div>
    <div class="row"><select id="cnsel">${cs.map(n => `<option>${esc(n)}</option>`).join('')}</select></div><div class="row">${btn('cngo', 'star', '⭐ Star around biggest city', 'pri')}${btn('cngo', 'chain', '⛓ Nearest-neighbour chain')}</div>`);
}
function countryItems(n, how) {
  const cs = [...COUNTRY.get(n).cities].sort((a, b) => C[b].pop - C[a].pop), pairs = [];
  if (how === 'star') for (const j of cs.slice(1)) pairs.push([cs[0], j]);
  else { const left = new Set(cs.slice(1)); let cur = cs[0]; while (left.size) { let best = null, bd = Infinity; for (const j of left) { const d = dist(cur, j); if (d < bd) { bd = d; best = j; } } pairs.push([cur, best]); left.delete(best); cur = best; } }
  return pairs.filter(([a, b]) => !hasRoute(a, b)).map(([a, b]) => { const q = routeQuote(a, b); return { t: `${C[a].n} ⇄ ${C[b].n} · ${Math.round(q.km).toLocaleString()} km · L${q.L + 1}`, c: q.cost, fn: () => rawRoute(a, b, q) }; }).sort((x, y) => x.c - y.c);
}
function showPick(i) {
  const c = C[i];
  openSheet(`<div class="hd"><div><div class="ttl">${esc(c.n)}</div><div class="sub">${esc(c.c)}</div></div>${btn('close', '', '✕', 'x')}</div>${c.f ? `<p class="fact">${esc(c.f)}</p>` : ''}
    <p>Start here? <b>${esc(c.c)}</b> is unlocked for free and <b>${esc(c.n)}</b> becomes your home hub.</p><div class="row">${btn('startat', i, '🛫 Start here', 'pri')}</div>`);
}
function showMenu() {
  openSheet(`<div class="hd"><div class="ttl">Menu</div>${btn('close', '', '✕', 'x')}</div><div class="col">
    ${btn('stats', '', '📊 Stats dashboard')}${btn('bulkmenu', '', '🧰 Bulk actions')}${btn('miles', '', '🏆 Milestones')}${btn('saves', '', '💾 Save / Load')}${btn('settings', '', '⚙️ Settings, theme & cheats')}${btn('help', '', '❓ How to play')}${btn('newgame', '', '🆕 New game')}</div>`);
}
// ---- stats dashboard: full-screen sheet; tables sort by tapping a header, rows fly to the thing
let dash = { tab: 'overview', aSort: 'inc', rSort: 'inc' };
const SORTS = { airports: { inc: ['Income', a => a.last.inc], load: ['Load', (a, i) => a.wait / cap(i)], wait: ['Waiting', a => a.wait], xfer: ['Transfers', a => a.last.xf], life: ['Lifetime', a => a.inc] },
  routes: { inc: ['Income', r => r.last.inc], load: ['Load', r => lf(r.last)], dist: ['Distance', r => r.km], planes: ['Planes', r => r.planes.length], life: ['Lifetime', r => r.inc] } };
const hdr = (kind, key, cur) => Object.entries(SORTS[kind]).map(([k, [n]]) => btn('dsort', kind + ':' + k, n, k === cur ? 'pri' : '')).join('');
function showStats() {
  const t = dash.tab, sc = S.scen ? SCENARIOS.find(s => s.id === S.scen.id) : null, aps = NODES.filter(i => S.ap[i]);
  let h = `<div class="hd"><div class="ttl">📊 Stats · week ${S.week}</div>${btn('close', '', '✕', 'x')}</div><div class="tabs">${['overview', 'airports', 'routes', 'places', 'fleet', 'records'].map(k => btn('dtab', k, k[0].toUpperCase() + k.slice(1), t === k ? 'on' : '')).join('')}</div>`;
  if (t === 'overview') h += `${sc ? `<div class="livebox">🎯 <b>${esc(sc.name)}</b>: ${esc(sc.goal()[1])} · ${Math.max(0, sc.weeks - S.week)} weeks left</div>` : ''}
    ${S.mode === 'unlockall' && !S.picking ? `<div class="livebox">⏰ Unlock a country within <b>${Math.max(0, S.deadline - S.week)}</b> weeks</div>` : ''}
    <div class="grid"><div><b>${fmt$(S.lastWkInc)}</b><span>last week</span></div><div><b>${fmtN(S.stats.pax)}</b><span>delivered</span></div><div><b>${nPlanes()}</b><span>planes</span></div>
    <div><b>${S.routes.length}</b><span>routes</span></div><div><b>${NODES.length}</b><span>airports</span></div><div><b>${S.allOpen ? 'all' : S.unlocked.size}</b><span>countries</span></div></div>
    ${graph(S.hist, 1, 'Weekly income', fmt$)}${graph(S.hist, 2, 'Weekly passengers', fmtN)}${graph(S.hist, 3, 'Cash', fmt$)}
    ${S.effects.length ? `<h3>Active events</h3><div class="sm">${S.effects.map(e => `${esc(e.label)} (until wk ${e.until})`).join(' · ')}</div>` : ''}`;
  else if (t === 'airports') { const f = SORTS.airports[dash.aSort][1], rows = aps.sort((x, y) => f(S.ap[y], y) - f(S.ap[x], x));
    h += `<div class="row">${hdr('airports', 0, dash.aSort)}</div>${rowTbl(rows.map(i => { const a = S.ap[i]; return `<tr data-a="gocity" data-v="${i}"><td>${esc(C[i].n)}${S.hubs.has(i) ? ' ⭐' : ''}</td><td>${fmt$(a.last.inc)}</td><td class="${a.full ? 'red' : ''}">${fmtN(a.wait)}/${fmtN(cap(i))}</td><td>${fmtN(a.last.xf)} xf</td></tr>`; }))}`; }
  else if (t === 'routes') { const f = SORTS.routes[dash.rSort][1], rows = [...S.routes].sort((x, y) => f(y) - f(x));
    h += `<div class="row">${hdr('routes', 0, dash.rSort)}</div>${rowTbl(rows.map(r => `<tr data-a="goroute" data-v="${r.id}"><td>${esc(C[r.a].n)}–${esc(C[r.b].n)}</td><td>${fmt$(r.last.inc)}</td><td class="${lf(r.last) > 95 ? 'red' : ''}">${lf(r.last)}%</td><td>${r.planes.length} ✈</td></tr>`))}`; }
  else if (t === 'places') { const by = key => { const m = new Map(); for (const i of aps) { const k = key(C[i]), a = S.ap[i], o = m.get(k) || { inc: 0, pax: 0, n: 0 }; o.inc += a.last.inc; o.pax += traffic(a); o.n++; m.set(k, o); } return [...m].sort((x, y) => y[1].inc - x[1].inc); };
    const tbl = rows => rowTbl(rows.map(([k, o]) => `<tr><td>${esc(k)}</td><td>${fmt$(o.inc)}</td><td>${fmtN(o.pax)} pax</td><td>${o.n} ap</td></tr>`));
    h += `<h3>By region</h3>${tbl(by(c => REGNAME[c.reg]))}<h3>By country</h3>${tbl(by(c => c.c))}`; }
  else if (t === 'fleet') { const n = [0, 0, 0, 0, 0, 0, 0], v = [0, 0, 0, 0, 0, 0, 0]; let cu = 0, cv = 0; for (const r of S.routes) for (const p of r.planes) { if (p.custom) { cu++; cv += p.paid; } else { n[p.lvl]++; v[p.lvl] += p.paid; } }
    h += `<div class="grid"><div><b>${nPlanes()}</b><span>planes</span></div><div><b>${fmt$(v.reduce((s, x) => s + x, cv))}</b><span>fleet value (paid)</span></div><div><b>${fmt$(S.routes.reduce((s, r) => s + r.cost, 0))}</b><span>routes paid</span></div></div>
    ${rowTbl(n.map((k, L) => k ? `<tr><td><span class="dot" style="background:${LVCOL[L]}"></span> ${L === 6 ? 'Super Jet' : 'L' + (L + 1)} · ${CFG.planes[L].seats} seats</td><td>${k}</td><td>${fmt$(v[L])}</td></tr>` : '').concat(cu ? [`<tr><td>Custom</td><td>${cu}</td><td>${fmt$(cv)}</td></tr>`] : []))}`; }
  else { const best = (arr, f) => arr.length ? arr.reduce((b, x) => f(x) > f(b) ? x : b) : null, lr = best(S.routes, r => r.km), bw = best(S.hist, w => w[1]), bh = best(aps, i => S.ap[i].xfer);
    const remote = best(aps, i => Math.min(...aps.filter(j => j !== i).map(j => dist(i, j))) || 0), small = aps.length ? aps.reduce((b, i) => C[i].pop < C[b].pop ? i : b) : null;
    const li = [...S.routes].sort((x, y) => y.inc - x.inc).slice(0, 10), la = [...aps].sort((x, y) => S.ap[y].inc - S.ap[x].inc).slice(0, 10);
    h += `<h3>Records</h3>${rowTbl([lr ? `<tr data-a="goroute" data-v="${lr.id}"><td>Longest route</td><td>${esc(C[lr.a].n)}–${esc(C[lr.b].n)} · ${Math.round(lr.km).toLocaleString()} km</td></tr>` : '',
      bw ? `<tr><td>Busiest week</td><td>wk ${bw[0]} · ${fmt$(bw[1])}</td></tr>` : '', bh != null ? `<tr data-a="gocity" data-v="${bh}"><td>Biggest transfer hub</td><td>${esc(C[bh].n)} · ${fmtN(S.ap[bh].xfer)} transfers</td></tr>` : '',
      remote != null && aps.length > 1 ? `<tr data-a="gocity" data-v="${remote}"><td>Most remote served</td><td>${esc(C[remote].n)} · ${Math.round(Math.min(...aps.filter(j => j !== remote).map(j => dist(remote, j)))).toLocaleString()} km to nearest</td></tr>` : '',
      small != null ? `<tr data-a="gocity" data-v="${small}"><td>Smallest city served</td><td>${esc(C[small].n)} · ${fmtPop(C[small].pop)}</td></tr>` : '',
      `<tr><td>Lifetime income</td><td>${fmt$(S.stats.inc)}</td></tr><tr><td>Lifetime passengers</td><td>${fmtN(S.stats.pax)}</td></tr>`])}
      <h3>All-time best routes</h3>${rowTbl(li.map(r => `<tr data-a="goroute" data-v="${r.id}"><td>${esc(C[r.a].n)}–${esc(C[r.b].n)}</td><td>${fmt$(r.inc)}</td></tr>`))}
      <h3>All-time best airports</h3>${rowTbl(la.map(i => `<tr data-a="gocity" data-v="${i}"><td>${esc(C[i].n)}</td><td>${fmt$(S.ap[i].inc)}</td></tr>`))}`; }
  openSheet(h, null, true);
}
function showMiles() {
  const all = [...MILES.map(m => [m[0], m[1], m[2]]), ...SCENARIOS.map(s => ['scen_' + s.id, s.name, 'Scenario: ' + s.desc])];
  openSheet(`<div class="hd"><div class="ttl">Milestones · ${Object.keys(ACH).length}/${all.length}</div>${btn('close', '', '✕', 'x')}</div>
    <div class="miles">${all.map(([id, n, d]) => { const a = ACH[id]; return `<div class="mile ${a ? 'got' : ''}"><b>${a ? '🏆' : '🔒'} ${esc(n)} ${a && a.cheat ? '🧪' : ''}</b><span>${esc(d)}</span></div>`; }).join('')}</div>`);
}
function slotInfo(k, pre = 'fc2_') { const o = ls.get(pre + k, null); return o ? `${o.mode} · wk ${o.week} · ${new Date(o.saved).toLocaleDateString()}` : 'empty'; }
const SLOTS = ['auto', 's1', 's2', 's3', 's4', 's5'], slotName = k => k === 'auto' ? 'Autosave' : 'Slot ' + k.slice(1);
const importBtn = k => ls.get('fc_' + k, null) ? btn('import', k, `⬇ v1 (${slotInfo(k, 'fc_')})`, 'ghost') : '';
function showSaves() {
  openSheet(`<div class="hd"><div class="ttl">Save / Load</div>${btn('close', '', '✕', 'x')}</div>
    ${SLOTS.map(k => `<div class="slot"><span>${slotName(k)} · ${slotInfo(k)}</span>${k === 'auto' ? '' : btn('save', k, 'Save')}${btn('load', k, 'Load', 'ghost')}${importBtn(k)}</div>`).join('')}
    ${SLOTS.some(k => ls.get('fc_' + k, null)) ? '<div class="hint">⬇ v1: re-import that v1 save into this slot (v1 data is never modified).</div>' : ''}`);
}
function showSettings() {
  const tg = (a, on, label) => `<label class="tg"><input type="checkbox" data-a="${a}" ${on ? 'checked' : ''}> ${label}</label>`;
  let h = `<div class="hd"><div class="ttl">Settings</div>${btn('close', '', '✕', 'x')}</div><div class="col">${tg('mute', SET.mute, 'Mute sounds')}${tg('cheats', SET.cheats, '🧪 Cheat mode')}</div>
    <h3>Theme</h3><div class="row">${['auto', 'light', 'dark'].map(t => btn('theme', t, { auto: '🌓 Auto', light: '☀️ Light', dark: '🌙 Dark' }[t], SET.theme === t ? 'pri' : '')).join('')}</div>
    <h3>Map filter</h3><div class="row">${FILTERS.map((f, k) => btn('filter', k, f, SET.filter === k ? 'pri' : '')).join('')}</div>`;
  if (SET.cheats && S) h += `<div class="cheat"><div class="clab">🧪 Money & unlocks</div><div class="row">${btn('cash', 1e6, '+$1M')}${btn('cash', 1e8, '+$100M')}${btn('cash', 1e9, '+$1B')}${btn('infinite', '', S.infinite ? 'Infinite $: ON' : 'Infinite $: off')}${btn('unlockall', '', 'Unlock all countries')}</div>
    <div class="clab">🧪 Physics</div><div class="col">${tg('ch_free', S.ch.free, 'Free purchases')}${tg('ch_range', S.ch.range, 'Infinite range (any route at L1)')}${tg('ch_instant', S.ch.instant, 'Instant turnaround')}</div>
    <div class="clab">🧪 Events</div><div class="row"><select id="evsel">${EVENTS.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>${btn('force', '', 'Fire')}${btn('clearfx', '', 'Clear events')}</div>
    <div class="col">${tg('ch_noEvents', S.ch.noEvents, 'Disable random events')}</div>
    <div class="sm">Super speeds (10×/100×/1000×) appear in the top bar. City and route cards get cheat buttons. Milestones still unlock but carry a 🧪 badge.</div></div>`;
  openSheet(h);
}
sheetBody.addEventListener('change', e => {
  const a = e.target.dataset.a; if (!a || !(a === 'mute' || a === 'cheats' || a.startsWith('ch_'))) return; const v = e.target.checked;
  if (a === 'mute') SET.mute = v;
  else if (a === 'cheats') { SET.cheats = v; if (!v && speed > 4) speed = 4; buildSpeed(); }
  else if (a.startsWith('ch_')) { S.ch[a.slice(3)] = v; markCheat(); }
  saveSet(); showSettings();
});
function showHelp() {
  openSheet(`<div class="hd"><div class="ttl">How to play</div>${btn('close', '', '✕', 'x')}</div><div class="help">
  <p><b>Build:</b> drag from one city to another (the nearest city snaps under your finger), or tap a city → "Build route from here" → tap the destination. A plane comes with it; its level depends on distance (range).</p>
  <p><b>Bulk:</b> route cards and the menu's Bulk section upgrade or add many planes at once, with a preview and a spending cap. ⚠️ in the top bar counts full airports, overloaded and planeless routes: tap it to visit each.</p>
  <p><b>Manage:</b> tap a route to add, upgrade or sell planes (full refund). Tap a city for its card, airport upgrades and hubs.</p>
  <p><b>Passengers</b> appear wanting to reach any city in your network and transfer along the fewest hops. Each leg pays a fare: longer and richer = more. Remote/polar/island cities pay 2×.</p>
  <p><b>Airport ring</b> shows how full it is. Red = full: −30% income on its flights and new travellers turned away. Upgrade it or add planes.</p>
  <p><b>Hubs</b> double capacity and earn a bonus per transfer. Airport L3 adds a lounge (+10% fares), L5 adds duty-free (bonus per transfer).</p>
  <p><b>Map:</b> pinch to zoom, drag to pan. It wraps around: fly the Pacific. ◆ diamonds are interesting cities.</p>
  <p>1 week ≈ 3 minutes at 1×. Events hit weekly. You can't lose; debt just accrues 1%/week.</p></div>`);
}
function showStart() {
  S && save('auto'); const hasAuto = !!ls.get('fc2_auto', null);
  openModal(`<h1>✈️ Fly Corp Sandbox</h1><div class="col">
    ${hasAuto ? btn('cont', '', `▶ Continue (${slotInfo('auto')})`, 'pri') : ''}
    ${btn('mode', 'free', '🌍 Free Play: pick a home country and grow')}
    ${btn('mode', 'unlockall', `⏰ Unlock All: a new country every ${CFG.unlockAllWeeks} weeks`)}
    ${btn('mode', 'sandbox', '🧱 Sandbox: everything open, infinite money')}
    ${btn('scens', '', '🎯 Scenarios')}${btn('loadmenu', '', '💾 Load a slot')}</div>`);
}
function showScens() { openModal(`<h2>🎯 Scenarios</h2><div class="col">${SCENARIOS.map(s => `<button class="btn" data-a="scen" data-v="${s.id}"><b>${ACH['scen_' + s.id] ? '🏆 ' : ''}${esc(s.name)}</b><br><span class="sm">${esc(s.desc)}</span></button>`).join('')}${btn('back', '', '← Back', 'ghost')}</div>`); }
function startMode(m) {
  S = newState(m); rebuild(); closeModal(); closeSheet(); centerOn(null); speed = 1; linkFrom = null;
  if (S.picking) toast('Tap any city to choose your home hub', 'event');
}
function startScenario(id) {
  const sc = SCENARIOS.find(s => s.id === id); S = newState('scenario'); S.cash = sc.cash; S.scen = { id, done: false }; sc.setup(); rebuild(); closeModal(); closeSheet();
  centerOn(S.home >= 0 ? S.home : null, 6); speed = 1; toast(`🎯 ${sc.name}: ${sc.desc}`, 'event');
}
const findRoute = id => S.routes.find(r => r.id === +id);
const rp = v => { const [rid, k] = v.split(':'); const r = findRoute(rid); return [r, r && r.planes[+k]]; };
const ACT = {
  close: () => closeSheet(),
  unlock: n => { unlockCountry(n); sel && showCity(sel.id); },
  apup: i => { upgradeAirport(+i); showCity(+i); },
  hub: i => { makeHub(+i); showCity(+i); },
  padd: id => { const r = findRoute(id); addPlane(r, minLevel(r.km)); showRoute(r); },
  pup: v => { const [r, p] = rp(v); upgradePlane(r, p); showRoute(r); },
  psell: v => { const [r, p] = rp(v); sellPlane(r, p); showRoute(r); },
  rdel: id => { deleteRoute(findRoute(id)); closeSheet(); },
  startat: i => { i = +i; S.picking = false; S.unlocked.add(C[i].c); S.home = i; S.hubs.add(i); S.deadline = CFG.unlockAllWeeks; bgDirty = true; closeSheet(); centerOn(i, 10); sfx('unlock');
    toast(`🏠 Home: ${C[i].n}. Drag between cities to build routes`, 'event'); },
  stats: showStats, miles: showMiles, saves: showSaves, settings: showSettings, help: showHelp, newgame: showStart, bulkmenu: showBulk, country: showCountry,
  save: k => { if (save(k)) toast('Saved'); showSaves(); },
  load: k => { if (!load(k)) toast('Empty slot'); },
  import: k => { const re = () => { importV1(k); if (modal.hidden) showSaves(); else ACT.loadmenu(); };
    if (ls.get('fc2_' + k, null)) showChoice({ title: `Overwrite ${slotName(k)}?`, text: `v2 ${slotName(k)} (${slotInfo(k)}) will be replaced by the v1 save (${slotInfo(k, 'fc_')}). The v1 save itself is untouched.`, opts: [['Import & overwrite', re], ['Cancel', () => {}]] }); else re(); },
  goroute: id => { const r = findRoute(id); sel = { type: 'route', id: r.id }; centerOn(r.a, cam.z); showRoute(r); reveal(SY(C[r.a].y)); },
  gocity: i => { sel = { type: 'city', id: +i }; centerOn(+i, Math.max(cam.z, 10)); showCity(+i); reveal(SY(C[+i].y)); },
  ctab: t => { cityTab = t; showCity(sel.id); },
  dtab: t => { dash.tab = t; showStats(); }, dsort: v => { const [k, s] = v.split(':'); dash[k === 'airports' ? 'aSort' : 'rSort'] = s; showStats(); },
  theme: t => { SET.theme = t; saveSet(); applyTheme(); showSettings(); },
  filter: k => { SET.filter = +k; saveSet(); showSettings(); },
  linkfrom: i => { linkFrom = linkFrom === +i ? null : +i; if (linkFrom != null) toast('Now tap the destination city', 'event'); showCity(+i); },
  linkok: v => { const [a, b] = v.split(':').map(Number); linkFrom = null; tryRoute(a, b); closeSheet(); },
  linkcancel: () => { linkFrom = null; closeSheet(); },
  bulk: runBulk, bulksel: id => runBulk(id + ':' + (id === 'lvl' ? $('#blvl').value : $('#bload').value)),
  bulkcap: p => { bulkCap = +p; bulk(bulkCur.title, bulkCur.items, bulkCur.opts); }, bulkok: bulkApply, bulkno: () => { closeModal(); bulkCur = null; },
  spokes: i => showSpokes(+i), spsort: s => { spk.sort = s; showSpokes(spk.from); },
  sptick: (v, el) => { el.checked ? spk.sel.add(+v) : spk.sel.delete(+v); spokeCount(); },
  spgo: i => { const items = spokeItems(+i, [...spk.sel]); if (!items.length) return toast('Pick some destinations first'); bulk(`Spokes from ${C[+i].n}`, items, { rebuild: true, after: () => { spk = null; closeSheet(); } }); },
  cngo: how => { const n = $('#cnsel').value; if (!n) return; const items = countryItems(n, how); if (!items.length) return toast('Already fully connected'); bulk(`Connect ${n} (${how})`, items, { rebuild: true, after: closeSheet }); },
  alert: () => { const p = problems(); if (!p.length) return toast('No problems right now'); alertK = (alertK + 1) % p.length; const [t, id] = p[alertK];
    toast(`⚠️ ${alertK + 1}/${p.length}: ${t === 'full' ? 'full airport' : t === 'load' ? 'route >95% load' : 'route with no planes'}`); t === 'full' ? ACT.gocity(id) : ACT.goroute(id); },
  choice: k => { const o = choiceOpts[+k]; closeModal(); o && o[1](); buildDemand(); },
  cont: () => { load('auto'); },
  mode: m => startMode(m), scens: showScens, scen: id => startScenario(id), back: showStart,
  loadmenu: () => openModal(`<h2>💾 Load</h2><div class="col">${SLOTS.map(k => `<div class="row">${btn('load', k, `${slotName(k)} · ${slotInfo(k)}`)}${importBtn(k)}</div>`).join('')}${btn('back', '', '← Back', 'ghost')}</div>`),
  // cheats
  cash: v => { markCheat(); earn(+v); toast(`🧪 +${fmt$(+v)}`); },
  infinite: () => { markCheat(); S.infinite = !S.infinite; showSettings(); },
  unlockall: () => { markCheat(); S.allOpen = true; bgDirty = true; toast('🧪 All countries open'); },
  force: () => { markCheat(); const id = $('#evsel').value; closeSheet(); fireEvent(id); },
  clearfx: () => { markCheat(); S.effects = []; buildDemand(); toast('🧪 Events cleared'); },
  pop: v => { markCheat(); const [i, m] = v.split(':'); S.pm[i] = +m === 1 ? 1 : (S.pm[i] || 1) * +m; buildDemand(); toast(`🧪 ${C[i].n} demand ×${S.pm[i]}`); },
  clearap: i => { markCheat(); const a = ap(+i); a.q = new Map(); a.wait = 0; a.full = false; showCity(+i); },
  maxap: i => { markCheat(); ap(+i).lvl = 6; showCity(+i); },
  freehub: i => { markCheat(); S.hubs.add(+i); showCity(+i); },
  superjet: id => { markCheat(); const r = findRoute(id); r.planes.push(mkPlane(r, 6, 0)); showRoute(r); },
  custom: id => { markCheat(); const r = findRoute(id), s = Math.max(1, +$('#cs').value || 1000), k = Math.max(50, +$('#ck').value || 3000);
    r.planes.push(mkPlane(r, 6, 0, { seats: s, kmh: k })); showRoute(r); },
};

// ================= HUD =================
const SPEEDS = [0, 0.5, 1, 2, 4], CHEAT_SPEEDS = [10, 100, 1000];
function buildSpeed() {
  $('#speed').innerHTML = [...SPEEDS, ...(SET.cheats ? CHEAT_SPEEDS : [])].map(s => `<button data-s="${s}" class="${s === speed ? 'on' : ''}">${s ? (s === 0.5 ? '½' : s) + '×' : '⏸'}</button>`).join('');
  $('#top').classList.toggle('cheat', SET.cheats); $('#toasts').style.top = $('#top').offsetHeight + 8 + 'px'; // bar is 2 rows with cheat speeds
}
$('#speed').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; speed = +b.dataset.s; buildSpeed(); });
$('#menuBtn').addEventListener('click', () => S && showMenu());
$('#homeBtn').addEventListener('click', () => S && centerOn(S.home >= 0 ? S.home : null, S.home >= 0 ? 8 : 0));
$('#alertBtn').addEventListener('click', () => S && ACT.alert());
$('#filterBtn').addEventListener('click', () => { SET.filter = (SET.filter + 1) % FILTERS.length; saveSet(); hud(); toast(`Map: ${FILTERS[SET.filter]}`); });
let alertK = -1;
function problems() { // [kind, id]: full airports, routes >95% load, routes with no planes
  const p = [];
  for (const i of NODES) if (S.ap[i] && S.ap[i].full) p.push(['full', i]);
  for (const r of S.routes) if (!r.planes.length) p.push(['empty', r.id]); else if (lf(r.last) > 95) p.push(['load', r.id]);
  return p;
}
function hud() {
  if (!S) return;
  $('#cash').textContent = S.infinite ? '∞' : fmt$(S.cash);
  $('#cash').className = S.cash < 0 ? 'red' : '';
  const d = Math.floor(S.hour / 24);
  $('#clock').textContent = `W${S.week} ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Math.min(6, d)]}${S.cheated ? ' 🧪' : ''}`;
  const n = problems().length, ab = $('#alertBtn'); ab.textContent = n ? `⚠️ ${n}` : '✓'; ab.classList.toggle('warn', n > 0);
  $('#filterBtn').textContent = ['🌐', '🏙', '◆', '✈️'][SET.filter] + ' ' + FILTERS[SET.filter];
  if ([...$('#speed').children].some(b => (+b.dataset.s === speed) !== b.classList.contains('on'))) buildSpeed();
}
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; $('#toasts').prepend(el);
  while ($('#toasts').children.length > 4) $('#toasts').lastChild.remove();
  setTimeout(() => el.classList.add('fade'), kind === 'event' ? 6000 : 3500); setTimeout(() => el.remove(), kind === 'event' ? 6600 : 4100);
}

// ================= LOOP =================
let last = performance.now(), hudT = 0, liveT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S && speed > 0 && !S.picking && modal.hidden) {
    let h = dt * speed * 168 / CFG.weekSec; const st = Math.max(0.5, h / 40);
    while (h > 0 && modal.hidden) { const s = Math.min(h, st); step(s); h -= s; }
  }
  if (bgDirty) drawBg();
  drawFg();
  if (now - hudT > 200) { hudT = now; hud(); }
  if (now - liveT > 1000) { liveT = now; refreshLive(); }
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { resize(); buildSpeed(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save('auto'); });
addEventListener('pagehide', () => save('auto')); // iOS Safari often skips visibilitychange when the PWA is swiped away
resize(); buildSpeed(); centerOn(null); firstRunImport(); showStart(); requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
