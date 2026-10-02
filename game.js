'use strict';
// ================= CONFIG — tune the economy here =================
const CFG = {
  weekSec: 60,              // real seconds per game week at 1x
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
};
const FOCUS = new Set(CFG.focus);

// ================= DATA =================
const R = Math.PI / 180;
const C = CITIES, NC = C.length;
C.forEach((c, i) => {
  c.i = i; c.x = c.lon + 180; c.y = 90 - c.lat;
  c.score = Math.sqrt(c.pop) * c.e + (c.t && c.t !== 'finance' ? 2 : 0);
  c.reg = c.lat < -60 ? 'ant' : c.r;
});
const RANK = [...C].sort((a, b) => b.score - a.score).map(c => c.i);
const RANKOF = new Int16Array(NC); RANK.forEach((ci, k) => RANKOF[ci] = k);
const COUNTRY = new Map();
for (const c of C) {
  let k = COUNTRY.get(c.c);
  if (!k) COUNTRY.set(c.c, k = { n: c.c, cities: [], pop: 0, g: c.g });
  k.cities.push(c.i); k.pop += c.pop;
}
const DIST = new Float32Array(NC * NC);
for (let i = 0; i < NC; i++) for (let j = i + 1; j < NC; j++) {
  const a = C[i], b = C[j];
  const v = Math.sin(a.lat * R) * Math.sin(b.lat * R) + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R);
  DIST[i * NC + j] = DIST[j * NC + i] = 6371 * Math.acos(Math.max(-1, Math.min(1, v)));
}
const dist = (a, b) => DIST[a * NC + b];
const byName = n => { const l = n.toLowerCase(), k = C.findIndex(c => c.n.toLowerCase() === l); return k >= 0 ? k : C.findIndex(c => c.n.toLowerCase().startsWith(l)); };
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
  const i = byName(a), j = byName(b); if (i < 0 || j < 0) return; m = Math.max(m, TIE.get(i * 4096 + j) || 0); TIE.set(i * 4096 + j, m); TIE.set(j * 4096 + i, m); });

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
const SET = Object.assign({ mute: false, cheats: false }, ls.get('fc_set', {}));
const saveSet = () => ls.set('fc_set', SET);
const ACH = ls.get('fc_ach', {});

// ================= GAME STATE =================
let S = null, ADJ = new Map(), NH = new Map(), COMP = new Map(), DEM = new Map(), NODES = [];
let speed = 1, bgDirty = true, sel = null; // sel: {type:'city'|'route', id}

function newState(mode) {
  return { mode, week: 0, hour: 0, cash: CFG.startCash, infinite: mode === 'sandbox', allOpen: mode === 'sandbox',
    unlocked: new Set(), routes: [], ap: {}, home: -1, hubs: new Set(), effects: [], cheated: false, pm: {},
    ch: { free: false, range: false, instant: false, noEvents: false },
    stats: { pax: 0, inc: 0, calm: 0 }, wkInc: 0, lastWkInc: 0, deadline: 0, scen: null, rid: 1, maxHops: 0, picking: mode === 'free' || mode === 'unlockall' };
}
const isOpen = i => S.allOpen || S.unlocked.has(C[i].c);
function ap(i) { return S.ap[i] || (S.ap[i] = { lvl: 0, q: new Map(), wait: 0, xfer: 0, acc: 0, full: false, wk: { inc: 0 }, last: { inc: 0 } }); }
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
    js.forEach((j, k) => { t += CFG.demandK * pi * PV.get(j) * (C[i].e + C[j].e) / 6 * (TIE.get(i * 4096 + j) || 1) / Math.pow(dist(i, j) / 1000 + 1, 0.7); cum[k] = t; });
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
    n = Math.min(n, cap(i) - a.wait);
    if (n <= 0) { a.full = true; continue; }
    const k = Math.min(n, 8), nh = NH.get(i);
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
  let inc = p.n * r.fare * lounge * pen * gMult('fare'), xf = 0; const nh = NH.get(x);
  for (const [d, n] of p.load) { if (d === x) S.stats.pax += n; else if (nh && nh[d] >= 0) { enq(x, nh[d], d, n); xf += n; } }
  if (xf) { A.xfer += xf; inc += xf * ((S.hubs.has(x) ? CFG.hubBonus : 0) + (A.lvl >= CFG.dutyLvl ? CFG.dutyFree : 0)); }
  A.full = A.wait >= cap(x);
  earn(inc); r.wk.inc += inc; A.wk.inc += inc; p.load.clear(); p.n = 0; coin();
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
function mkRoute(a, b, cost, id) {
  const r = { id: id || S.rid++, a, b, km: dist(a, b), fare: fare(a, b), cost, planes: [], wk: { inc: 0, pax: 0, seats: 0 }, last: { inc: 0, pax: 0, seats: 0 } };
  r.pts = arc(C[a], C[b]); r.bx0 = Math.min(...r.pts.filter((_, k) => k % 2 === 0)); r.bx1 = Math.max(...r.pts.filter((_, k) => k % 2 === 0));
  return r;
}

// ================= ACTIONS =================
function tryRoute(a, b) {
  if (a === b) return;
  if (S.routes.some(r => (r.a === a && r.b === b) || (r.a === b && r.b === a))) { toast('Route already exists: tap it to add planes'); return; }
  for (const i of [a, b]) if (!isOpen(i)) { toast(`🔒 Unlock ${C[i].c} first`); sfx('no'); return; }
  const km = dist(a, b), L = minLevel(km), rc = routeCost(km), pc = planeCost(L);
  if (!spend(rc + pc, 'this route')) return;
  const r = mkRoute(a, b, rc); r.planes.push(mkPlane(r, L, pc)); S.routes.push(r); ap(a); ap(b);
  rebuild(); sfx('route');
  toast(`✈️ ${C[a].n} ⇄ ${C[b].n} · ${Math.round(km).toLocaleString()} km · L${L + 1} · ${fmt$(rc + pc)}`);
  checkMiles();
}
function addPlane(r, L) { const c = planeCost(L); if (!spend(c, 'a plane')) return; r.planes.push(mkPlane(r, L, c)); sfx('buy'); }
function upgradePlane(r, p) {
  if (p.custom || p.lvl >= 5) return;
  const c = planeCost(p.lvl + 1) - CFG.planes[p.lvl].cost * gMult('cost'); if (!spend(c, 'upgrade')) return;
  p.lvl++; p.paid += c; p.seats = CFG.planes[p.lvl].seats; p.kmh = CFG.planes[p.lvl].kmh; sfx('buy');
}
function sellPlane(r, p) { r.planes.splice(r.planes.indexOf(p), 1); if (!S.infinite) S.cash += p.paid; sfx('sell'); }
function deleteRoute(r) {
  if (!S.infinite) S.cash += r.cost + r.planes.reduce((s, p) => s + p.paid, 0);
  S.routes.splice(S.routes.indexOf(r), 1); rebuild(); sfx('sell');
}
function unlockCountry(n) { if (!spend(unlockCost(n), n)) return; S.unlocked.add(n); bgDirty = true; sfx('unlock');
  if (S.mode === 'unlockall') S.deadline = S.week + CFG.unlockAllWeeks; toast(`🔓 ${n} unlocked`); checkMiles(); }
function upgradeAirport(i) { const a = ap(i); if (a.lvl >= 6) return; if (!spend(CFG.apCost[a.lvl + 1], 'airport upgrade')) return; a.lvl++; a.full = a.wait >= cap(i); sfx('buy'); }
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
  for (const r of S.routes) { r.last = r.wk; r.wk = { inc: 0, pax: 0, seats: 0 }; }
  for (const k in S.ap) { const a = S.ap[k]; a.last = a.wk; a.wk = { inc: 0 }; }
  S.lastWkInc = S.wkInc; S.wkInc = 0;
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
    ACH[id] = { cheat: S.cheated, when: Date.now() }; ls.set('fc_ach', ACH);
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
  if (ok) { S.scen.done = true; ACH['scen_' + sc.id] = { cheat: S.cheated, when: Date.now() }; ls.set('fc_ach', ACH); sfx('ach');
    showChoice({ title: `🏆 ${sc.name} complete!`, text: `Done in week ${S.week}.`, opts: [['Keep playing', () => {}], ['Menu', () => showStart()]] }); }
  else if (S.week >= sc.weeks) { S.scen.done = true;
    showChoice({ title: `⌛ ${sc.name} failed`, text: sc.goal()[1], opts: [['Keep playing anyway', () => {}], ['Retry', () => startScenario(sc.id)], ['Menu', () => showStart()]] }); }
}

// ================= SAVE / LOAD =================
function serialize() {
  return { v: 1, mode: S.mode, week: S.week, hour: S.hour, cash: S.cash, infinite: S.infinite, allOpen: S.allOpen, unlocked: [...S.unlocked], home: S.home,
    hubs: [...S.hubs], effects: S.effects, cheated: S.cheated, pm: S.pm, ch: S.ch, stats: S.stats, lastWkInc: S.lastWkInc, deadline: S.deadline,
    scen: S.scen, rid: S.rid, picking: S.picking, saved: Date.now(),
    ap: Object.fromEntries(Object.entries(S.ap).map(([k, a]) => [k, { lvl: a.lvl, xfer: a.xfer, q: [...a.q.values()].flatMap(m => [...m]) }])),
    routes: S.routes.map(r => ({ id: r.id, a: r.a, b: r.b, cost: r.cost, planes: r.planes.map(p => ({ lvl: p.lvl, seats: p.seats, kmh: p.kmh, custom: p.custom, paid: p.paid })) })) };
}
function deserialize(o) {
  S = Object.assign(newState(o.mode), o, { unlocked: new Set(o.unlocked), hubs: new Set(o.hubs), ap: {}, routes: [] });
  for (const r0 of o.routes) {
    const r = mkRoute(r0.a, r0.b, r0.cost, r0.id);
    for (const p0 of r0.planes) { const p = mkPlane(r, p0.lvl, p0.paid, p0.custom ? p0 : null); p.seats = p0.seats; p.kmh = p0.kmh; r.planes.push(p); }
    S.routes.push(r);
  }
  for (const [k, a0] of Object.entries(o.ap)) { const a = ap(+k); a.lvl = a0.lvl; a.xfer = a0.xfer; a.q.set(-1, new Map(a0.q)); }
  rebuild();
}
let lastAuto = 0;
function save(slot) { if (!S) return; const ok = ls.set('fc_' + slot, serialize()); if (!ok && slot !== 'auto') toast('Save failed (storage full?)'); return ok; }
function load(slot) { const o = ls.get('fc_' + slot, null); if (!o) return false; deserialize(o); sel = null; closeSheet(); closeModal(); speed = 1; centerOn(S.home >= 0 ? S.home : null); return true; }

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
function reveal(y) { if (y > H * 0.38) { cam.y += (y - H * 0.22) / cam.z; clampCam(); } } // pan the tapped thing above the bottom sheet
const SX = X => W / 2 + wrapD(X - cam.x) * cam.z, SY = Y => H / 2 + (Y - cam.y) * cam.z;
const COL = { sea: '#9fd0ea', void: '#7fb3d0', landOff: '#d5dbe0', landOn: '#fbf6e9', border: 'rgba(255,255,255,.8)', borderOn: 'rgba(160,140,100,.55)' };
const RCOL = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5a5', '#f032e6', '#9a6324', '#808000', '#000075', '#e6a700', '#008080'];
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
    for (const ct of PATHS) { const on = !openNames || openNames.has(ct.n); g.fillStyle = on ? COL.landOn : COL.landOff; g.fill(ct.path); }
    for (const ct of PATHS) { const on = !openNames || openNames.has(ct.n); g.strokeStyle = on ? COL.borderOn : COL.border; g.stroke(ct.path); }
  }
}
let VIS = [], drag = null;
function drawFg() {
  const g = fgx; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  if (!S) return;
  const z = cam.z, x0 = W / 2 - cam.x * z, y0 = H / 2 - cam.y * z, span = 360 * z;
  // routes
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of S.routes) {
    const isSel = sel && sel.type === 'route' && sel.id === r.id;
    g.strokeStyle = RCOL[r.id % RCOL.length]; g.lineWidth = isSel ? 4.5 : 2.4; g.globalAlpha = r.planes.length ? 0.85 : 0.35;
    for (let k = -2; k <= 2; k++) {
      const ox = x0 + k * span; if (ox + r.bx1 * z < -20 || ox + r.bx0 * z > W + 20) continue;
      g.beginPath(); for (let n = 0; n < r.pts.length; n += 2) { const X = ox + r.pts[n] * z, Y = y0 + r.pts[n + 1] * z; n ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
    }
  }
  g.globalAlpha = 1;
  // drag line
  if (drag) { const c = C[drag.from]; g.setLineDash([6, 6]); g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.moveTo(SX(c.x), SY(c.y)); g.lineTo(drag.x, drag.y); g.stroke(); g.setLineDash([]);
    if (drag.to != null && drag.to !== drag.from) { const km = dist(drag.from, drag.to), L = minLevel(km);
      const txt = `${Math.round(km).toLocaleString()} km · L${L + 1} · ${fmt$(routeCost(km) + planeCost(L))}`;
      g.font = '600 13px -apple-system,system-ui,sans-serif'; const w = g.measureText(txt).width + 14; g.fillStyle = 'rgba(20,30,40,.85)'; g.fillRect(drag.x - w / 2, drag.y - 52, w, 22); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(txt, drag.x, drag.y - 36); } }
  // cities
  const nShow = Math.min(NC, Math.floor(25 * Math.pow(z, 1.3))); // ~27 cities at world view, all of them by z≈14
  VIS = [];
  for (const c of C) {
    const net = inNet(c.i), isSel = sel && sel.type === 'city' && sel.id === c.i;
    if (!net && !isSel && RANKOF[c.i] >= nShow) continue;
    const x = SX(c.x), y = SY(c.y); if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
    VIS.push([c.i, x, y]);
    const open = isOpen(c.i), rad = 2.5 + Math.min(4, Math.log10(1 + c.pop * 10) * 1.6) + (net ? 1.5 : 0);
    g.fillStyle = open ? '#fff' : '#b9c2ca'; g.strokeStyle = open ? '#3b4650' : '#8a96a0'; g.lineWidth = 1.3;
    g.beginPath();
    if (c.t && c.t !== 'finance') { g.moveTo(x, y - rad - 1); g.lineTo(x + rad + 1, y); g.lineTo(x, y + rad + 1); g.lineTo(x - rad - 1, y); g.closePath(); }
    else g.arc(x, y, rad, 0, 7);
    g.fill(); g.stroke();
    if (net) {
      const a = S.ap[c.i], f = a ? a.wait / cap(c.i) : 0;
      g.strokeStyle = closed(c.i) ? '#555' : f >= 1 ? '#e03131' : f > 0.75 ? '#f76707' : f > 0.5 ? '#f2c94c' : '#40c057';
      g.lineWidth = 3; g.beginPath(); g.arc(x, y, rad + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.08, Math.min(1, f))); g.stroke();
    }
    if (S.hubs.has(c.i)) { g.fillStyle = '#ffd43b'; g.strokeStyle = '#8a6d00'; g.lineWidth = 1; star(g, x + rad + 3, y - rad - 3, 5); }
    if (isSel) { g.strokeStyle = '#1c7ed6'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rad + 7, 0, 7); g.stroke(); }
  }
  // labels: greedy, most important first
  g.font = '600 11px -apple-system,system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const occ = new Set(), labelN = Math.floor(nShow * 0.45);
  for (const [i, x, y] of VIS.slice().sort((a, b) => RANKOF[a[0]] - RANKOF[b[0]])) {
    if (RANKOF[i] > labelN && !inNet(i) && !(sel && sel.id === i)) continue;
    const cell = Math.floor((x + 8) / 70) + ',' + Math.floor(y / 16); if (occ.has(cell)) continue; occ.add(cell);
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(C[i].n, x + 8, y); g.fillStyle = '#26323c'; g.fillText(C[i].n, x + 8, y);
  }
  // planes
  for (const r of S.routes) for (const p of r.planes) {
    let f; if (p.at >= 0) continue; f = p.from === r.a ? p.t : 1 - p.t;
    const n = r.pts.length / 2 - 1, u = Math.min(n - 0.0001, f * n), k = Math.floor(u), w = u - k;
    const X = r.pts[2 * k] + (r.pts[2 * k + 2] - r.pts[2 * k]) * w, Y = r.pts[2 * k + 1] + (r.pts[2 * k + 3] - r.pts[2 * k + 1]) * w;
    let ang = Math.atan2(r.pts[2 * k + 3] - r.pts[2 * k + 1], r.pts[2 * k + 2] - r.pts[2 * k]); if (p.from !== r.a) ang += Math.PI;
    const x = SX(X), y = SY(Y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    plane(g, x, y, ang, p.custom ? '#ff00aa' : LVCOL[p.lvl], 5 + p.lvl * 0.6);
  }
}
function star(g, x, y, r) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } g.closePath(); g.fill(); g.stroke(); }
function plane(g, x, y, a, col, s) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 1;
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
  else if (gest.type === 'drag') { const to = cityAt(e.clientX, e.clientY, 26); drag = { from: gest.city, x: e.clientX, y: e.clientY, to }; edgePan(e.clientX, e.clientY); }
});
function edgePan(x, y) { const m = 40, v = 6 / cam.z; if (x < m) cam.x -= v; if (x > W - m) cam.x += v; if (y < m + 50) cam.y -= v; if (y > H - m) cam.y += v; clampCam(); }
function endPtr(e) {
  ptrs.delete(e.pointerId); if (!gest) return;
  if (gest.type === 'pinch') { if (ptrs.size === 0) gest = null; return; }
  if (gest.type === 'drag' && gest.moved) { const to = cityAt(e.clientX, e.clientY, 26); if (to != null) tryRoute(gest.city, to); }
  else if (!gest.moved) tap(e.clientX, e.clientY);
  drag = null; gest = null;
}
fg.addEventListener('pointerup', endPtr); fg.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); gest = null; drag = null; });
fg.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.002), wx = cam.x + (e.clientX - W / 2) / cam.z, wy = cam.y + (e.clientY - H / 2) / cam.z;
  cam.z *= f; clampCam(); cam.x = wx - (e.clientX - W / 2) / cam.z; cam.y = wy - (e.clientY - H / 2) / cam.z; clampCam(); }, { passive: false });
function tap(x, y) {
  if (!S) return;
  const c = cityAt(x, y);
  if (c != null) { reveal(y); if (S.picking) return showPick(c); sel = { type: 'city', id: c }; showCity(c); return; }
  const r = routeAt(x, y);
  if (r) { reveal(y); sel = { type: 'route', id: r.id }; showRoute(r); return; }
  sel = null; closeSheet();
}

// ================= UI =================
const sheet = $('#sheet'), sheetBody = $('#sheetBody'), modal = $('#modal'), modalBox = $('#modalBox');
let liveFn = null;
function openSheet(html, live) { sheetBody.innerHTML = html; sheet.classList.add('open'); liveFn = live || null; refreshLive(); }
function closeSheet() { sheet.classList.remove('open'); liveFn = null; sel = null; }
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

function showCity(i) {
  const c = C[i], a = S.ap[i], open = isOpen(i), net = inNet(i);
  let h = `<div class="hd"><div><div class="ttl">${esc(c.n)} <span class="iata">${esc(c.iata)}</span></div><div class="sub">${esc(c.c)} · ${REGNAME[c.reg]}</div></div>${btn('close', '', '✕', 'x')}</div>`;
  if (c.t) h += `<div class="badge">${TRAIT[c.t] || c.t}</div>`;
  h += `<p class="fact">${esc(c.f)}</p>`;
  h += `<div class="grid"><div><b>${fmtPop(c.pop)}</b><span>metro pop</span></div><div><b>$${c.g}K</b><span>GDP/capita</span></div><div><b>${'★'.repeat(c.e)}</b><span>importance</span></div>`;
  if (a) h += `<div><b>L${a.lvl + 1}</b><span>airport · cap ${fmtN(cap(i))}</span></div>`;
  h += `</div><div id="live"></div><div class="row">`;
  if (!open) h += btn('unlock', c.c, `🔓 Unlock ${esc(c.c)} · ${fmt$(unlockCost(c.c))}`, 'pri');
  else if (a) {
    if (a.lvl < 6) h += btn('apup', i, `⬆ Airport L${a.lvl + 2} · ${fmt$(CFG.apCost[a.lvl + 1])}`, 'pri');
    if (!S.hubs.has(i)) h += btn('hub', i, `⭐ Make hub · ${fmt$(CFG.hubCost * S.hubs.size)}`);
  } else h += `<div class="hint">Drag from this city to another to open a route.</div>`;
  h += `</div>`;
  if (cheatsOn()) h += `<div class="cheat"><div class="clab">🧪 Cheats</div><div class="row">${btn('pop', i + ':2', 'Pop ×2')}${btn('pop', i + ':0.5', 'Pop ×½')}${btn('pop', i + ':1', 'Pop reset')}
    ${btn('clearap', i, 'Clear airport')}${btn('maxap', i, 'Max airport')}${btn('freehub', i, 'Free hub')}</div></div>`;
  openSheet(h, () => {
    const a = S.ap[i]; if (!a || !net) return closed(i) ? '<div class="warn">Airport closed</div>' : '';
    const want = new Map(); for (const m of a.q.values()) for (const [d, n] of m) want.set(d, (want.get(d) || 0) + n);
    const top = [...want].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([d, n]) => `${esc(C[d].n)} ${n}`).join(' · ');
    const fx = S.effects.filter(e => fxMatch(e, c)).map(e => e.label).join(', ');
    return `<div class="livebox"><div>Waiting <b class="${a.full ? 'red' : ''}">${fmtN(a.wait)}/${fmtN(cap(i))}</b> · Transfers <b>${fmtN(a.xfer)}</b> · Last wk <b>${fmt$(a.last.inc)}</b></div>
      ${top ? `<div class="sm">Wants: ${top}</div>` : ''}${fx ? `<div class="sm">⚡ ${esc(fx)}</div>` : ''}${closed(i) ? '<div class="warn">Airport closed</div>' : ''}</div>`;
  });
}
function showRoute(r) {
  const L = minLevel(r.km);
  let h = `<div class="hd"><div><div class="ttl">${esc(C[r.a].n)} ⇄ ${esc(C[r.b].n)}</div><div class="sub">${Math.round(r.km).toLocaleString()} km · fare ${fmt$(r.fare)} · needs L${L + 1}+</div></div>${btn('close', '', '✕', 'x')}</div>`;
  h += `<div id="live"></div><div class="planes">`;
  r.planes.forEach((p, k) => {
    const up = !p.custom && p.lvl < 5 ? btn('pup', r.id + ':' + k, `⬆ L${p.lvl + 2} ${fmt$(planeCost(p.lvl + 1) - CFG.planes[p.lvl].cost * gMult('cost'))}`) : '';
    h += `<div class="pl"><span class="dot" style="background:${p.custom ? '#ff00aa' : LVCOL[p.lvl]}"></span><span>${p.custom ? 'Custom' : p.lvl === 6 ? 'Super Jet' : 'L' + (p.lvl + 1)} · ${p.seats} seats · ${p.kmh} km/h</span>${up}${btn('psell', r.id + ':' + k, `Sell +${fmt$(p.paid)}`, 'ghost')}</div>`;
  });
  h += `</div><div class="row">${btn('padd', r.id, `+ Plane L${L + 1} · ${fmt$(planeCost(L))}`, 'pri')}${btn('rdel', r.id, `Delete route (+${fmt$(r.cost + r.planes.reduce((s, p) => s + p.paid, 0))})`, 'ghost')}</div>`;
  if (cheatsOn()) h += `<div class="cheat"><div class="clab">🧪 Cheats</div><div class="row">${btn('superjet', r.id, '🚀 Spawn Super Jet')}</div>
    <div class="row"><input id="cs" type="number" placeholder="seats" value="1000"><input id="ck" type="number" placeholder="km/h" value="3000">${btn('custom', r.id, 'Add custom plane')}</div></div>`;
  openSheet(h, () => { const l = r.last, lf = l.seats ? Math.round(100 * l.pax / l.seats) : 0;
    return `<div class="livebox">Last week: <b>${fmt$(l.inc)}</b> · load <b>${lf}%</b> · <b>${fmtN(l.pax)}</b> pax · ${r.planes.length} plane${r.planes.length === 1 ? '' : 's'}</div>`; });
}
function showPick(i) {
  const c = C[i];
  openSheet(`<div class="hd"><div><div class="ttl">${esc(c.n)}</div><div class="sub">${esc(c.c)}</div></div>${btn('close', '', '✕', 'x')}</div><p class="fact">${esc(c.f)}</p>
    <p>Start here? <b>${esc(c.c)}</b> is unlocked for free and <b>${esc(c.n)}</b> becomes your home hub.</p><div class="row">${btn('startat', i, '🛫 Start here', 'pri')}</div>`);
}
function showMenu() {
  openSheet(`<div class="hd"><div class="ttl">Menu</div>${btn('close', '', '✕', 'x')}</div><div class="col">
    ${btn('stats', '', '📊 Stats')}${btn('miles', '', '🏆 Milestones')}${btn('saves', '', '💾 Save / Load')}${btn('settings', '', '⚙️ Settings & cheats')}${btn('help', '', '❓ How to play')}${btn('newgame', '', '🆕 New game')}</div>`);
}
function showStats() {
  const rs = [...S.routes].sort((a, b) => b.last.inc - a.last.inc).slice(0, 12);
  const aps = Object.entries(S.ap).filter(([k]) => inNet(+k)).sort((a, b) => b[1].wait / cap(+b[0]) - a[1].wait / cap(+a[0])).slice(0, 8);
  const sc = S.scen ? SCENARIOS.find(s => s.id === S.scen.id) : null;
  openSheet(`<div class="hd"><div class="ttl">Stats · week ${S.week}</div>${btn('close', '', '✕', 'x')}</div>
    ${sc ? `<div class="livebox">🎯 <b>${esc(sc.name)}</b>: ${esc(sc.goal()[1])} · ${Math.max(0, sc.weeks - S.week)} weeks left</div>` : ''}
    ${S.mode === 'unlockall' && !S.picking ? `<div class="livebox">⏰ Unlock a country within <b>${Math.max(0, S.deadline - S.week)}</b> weeks</div>` : ''}
    <div class="grid"><div><b>${fmt$(S.lastWkInc)}</b><span>last week</span></div><div><b>${fmtN(S.stats.pax)}</b><span>delivered</span></div><div><b>${nPlanes()}</b><span>planes</span></div>
    <div><b>${S.routes.length}</b><span>routes</span></div><div><b>${NODES.length}</b><span>airports</span></div><div><b>${S.allOpen ? 'all' : S.unlocked.size}</b><span>countries</span></div></div>
    <h3>Top routes</h3><table>${rs.map(r => `<tr data-a="goroute" data-v="${r.id}"><td>${esc(C[r.a].n)}–${esc(C[r.b].n)}</td><td>${fmt$(r.last.inc)}</td><td>${r.last.seats ? Math.round(100 * r.last.pax / r.last.seats) : 0}%</td></tr>`).join('')}</table>
    <h3>Busiest airports</h3><table>${aps.map(([k, a]) => `<tr data-a="gocity" data-v="${k}"><td>${esc(C[k].n)}</td><td>${fmtN(a.wait)}/${fmtN(cap(+k))}</td><td>${fmtN(a.xfer)} xfer</td></tr>`).join('')}</table>
    ${S.effects.length ? `<h3>Active events</h3><div class="sm">${S.effects.map(e => `${esc(e.label)} (until wk ${e.until})`).join(' · ')}</div>` : ''}`);
}
function showMiles() {
  const all = [...MILES.map(m => [m[0], m[1], m[2]]), ...SCENARIOS.map(s => ['scen_' + s.id, s.name, 'Scenario: ' + s.desc])];
  openSheet(`<div class="hd"><div class="ttl">Milestones · ${Object.keys(ACH).length}/${all.length}</div>${btn('close', '', '✕', 'x')}</div>
    <div class="miles">${all.map(([id, n, d]) => { const a = ACH[id]; return `<div class="mile ${a ? 'got' : ''}"><b>${a ? '🏆' : '🔒'} ${esc(n)} ${a && a.cheat ? '🧪' : ''}</b><span>${esc(d)}</span></div>`; }).join('')}</div>`);
}
function slotInfo(k) { const o = ls.get('fc_' + k, null); return o ? `${o.mode} · wk ${o.week} · ${new Date(o.saved).toLocaleDateString()}` : 'empty'; }
function showSaves() {
  openSheet(`<div class="hd"><div class="ttl">Save / Load</div>${btn('close', '', '✕', 'x')}</div>
    <div class="slot"><span>Autosave · ${slotInfo('auto')}</span>${btn('load', 'auto', 'Load', 'ghost')}</div>
    ${[1, 2, 3, 4, 5].map(k => `<div class="slot"><span>Slot ${k} · ${slotInfo('s' + k)}</span>${btn('save', 's' + k, 'Save')}${btn('load', 's' + k, 'Load', 'ghost')}</div>`).join('')}`);
}
function showSettings() {
  const tg = (a, on, label) => `<label class="tg"><input type="checkbox" data-a="${a}" ${on ? 'checked' : ''}> ${label}</label>`;
  let h = `<div class="hd"><div class="ttl">Settings</div>${btn('close', '', '✕', 'x')}</div><div class="col">${tg('mute', SET.mute, 'Mute sounds')}${tg('cheats', SET.cheats, '🧪 Cheat mode')}</div>`;
  if (SET.cheats && S) h += `<div class="cheat"><div class="clab">🧪 Money & unlocks</div><div class="row">${btn('cash', 1e6, '+$1M')}${btn('cash', 1e8, '+$100M')}${btn('cash', 1e9, '+$1B')}${btn('infinite', '', S.infinite ? 'Infinite $: ON' : 'Infinite $: off')}${btn('unlockall', '', 'Unlock all countries')}</div>
    <div class="clab">🧪 Physics</div><div class="col">${tg('ch_free', S.ch.free, 'Free purchases')}${tg('ch_range', S.ch.range, 'Infinite range (any route at L1)')}${tg('ch_instant', S.ch.instant, 'Instant turnaround')}</div>
    <div class="clab">🧪 Events</div><div class="row"><select id="evsel">${EVENTS.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>${btn('force', '', 'Fire')}${btn('clearfx', '', 'Clear events')}</div>
    <div class="col">${tg('ch_noEvents', S.ch.noEvents, 'Disable random events')}</div>
    <div class="sm">Super speeds (10×/100×/1000×) appear in the top bar. City and route cards get cheat buttons. Milestones still unlock but carry a 🧪 badge.</div></div>`;
  openSheet(h);
}
sheetBody.addEventListener('change', e => {
  const a = e.target.dataset.a; if (!a) return; const v = e.target.checked;
  if (a === 'mute') SET.mute = v;
  else if (a === 'cheats') { SET.cheats = v; if (!v && speed > 4) speed = 4; buildSpeed(); }
  else if (a.startsWith('ch_')) { S.ch[a.slice(3)] = v; markCheat(); }
  saveSet(); showSettings();
});
function showHelp() {
  openSheet(`<div class="hd"><div class="ttl">How to play</div>${btn('close', '', '✕', 'x')}</div><div class="help">
  <p><b>Build:</b> drag from one city to another to open a route. A plane comes with it, and the plane's level depends on distance (range).</p>
  <p><b>Manage:</b> tap a route to add, upgrade or sell planes (full refund). Tap a city for its card, airport upgrades and hubs.</p>
  <p><b>Passengers</b> appear wanting to reach any city in your network and transfer along the fewest hops. Each leg pays a fare: longer and richer = more. Remote/polar/island cities pay 2×.</p>
  <p><b>Airport ring</b> shows how full it is. Red = full: −30% income on its flights and new travellers turned away. Upgrade it or add planes.</p>
  <p><b>Hubs</b> double capacity and earn a bonus per transfer. Airport L3 adds a lounge (+10% fares), L5 adds duty-free (bonus per transfer).</p>
  <p><b>Map:</b> pinch to zoom, drag to pan. It wraps around: fly the Pacific. ◆ diamonds are interesting cities.</p>
  <p>1 week ≈ 1 minute. Events hit weekly. You can't lose; debt just accrues 1%/week.</p></div>`);
}
function showStart() {
  S && save('auto'); const hasAuto = !!ls.get('fc_auto', null);
  openModal(`<h1>✈️ Fly Corp Sandbox</h1><div class="col">
    ${hasAuto ? btn('cont', '', `▶ Continue (${slotInfo('auto')})`, 'pri') : ''}
    ${btn('mode', 'free', '🌍 Free Play: pick a home country and grow')}
    ${btn('mode', 'unlockall', `⏰ Unlock All: a new country every ${CFG.unlockAllWeeks} weeks`)}
    ${btn('mode', 'sandbox', '🧱 Sandbox: everything open, infinite money')}
    ${btn('scens', '', '🎯 Scenarios')}${btn('loadmenu', '', '💾 Load a slot')}</div>`);
}
function showScens() { openModal(`<h2>🎯 Scenarios</h2><div class="col">${SCENARIOS.map(s => `<button class="btn" data-a="scen" data-v="${s.id}"><b>${ACH['scen_' + s.id] ? '🏆 ' : ''}${esc(s.name)}</b><br><span class="sm">${esc(s.desc)}</span></button>`).join('')}${btn('back', '', '← Back', 'ghost')}</div>`); }
function startMode(m) {
  S = newState(m); rebuild(); closeModal(); closeSheet(); centerOn(null); speed = 1;
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
  stats: showStats, miles: showMiles, saves: showSaves, settings: showSettings, help: showHelp, newgame: showStart,
  save: k => { if (save(k)) toast('Saved'); showSaves(); },
  load: k => { if (!load(k)) toast('Empty slot'); },
  goroute: id => { const r = findRoute(id); sel = { type: 'route', id: r.id }; centerOn(r.a, cam.z); showRoute(r); },
  gocity: i => { sel = { type: 'city', id: +i }; centerOn(+i, Math.max(cam.z, 10)); showCity(+i); },
  choice: k => { const o = choiceOpts[+k]; closeModal(); o && o[1](); buildDemand(); },
  cont: () => { load('auto'); },
  mode: m => startMode(m), scens: showScens, scen: id => startScenario(id), back: showStart,
  loadmenu: () => openModal(`<h2>💾 Load</h2><div class="col">${['auto', 's1', 's2', 's3', 's4', 's5'].map(k => btn('load', k, `${k === 'auto' ? 'Autosave' : 'Slot ' + k.slice(1)} · ${slotInfo(k)}`)).join('')}${btn('back', '', '← Back', 'ghost')}</div>`),
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
const SPEEDS = [0, 1, 2, 4], CHEAT_SPEEDS = [10, 100, 1000];
function buildSpeed() {
  $('#speed').innerHTML = [...SPEEDS, ...(SET.cheats ? CHEAT_SPEEDS : [])].map(s => `<button data-s="${s}" class="${s === speed ? 'on' : ''}">${s ? s + '×' : '⏸'}</button>`).join('');
  $('#top').classList.toggle('cheat', SET.cheats); $('#toasts').style.top = $('#top').offsetHeight + 8 + 'px'; // bar is 2 rows with cheat speeds
}
$('#speed').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; speed = +b.dataset.s; buildSpeed(); });
$('#menuBtn').addEventListener('click', () => S && showMenu());
$('#homeBtn').addEventListener('click', () => S && centerOn(S.home >= 0 ? S.home : null, S.home >= 0 ? 8 : 0));
function hud() {
  if (!S) return;
  $('#cash').textContent = S.infinite ? '∞' : fmt$(S.cash);
  $('#cash').className = S.cash < 0 ? 'red' : '';
  const d = Math.floor(S.hour / 24);
  $('#clock').textContent = `Wk ${S.week} · ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Math.min(6, d)]}${S.cheated ? ' 🧪' : ''}`;
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
$('.grip').addEventListener('click', closeSheet);
resize(); buildSpeed(); centerOn(null); showStart(); requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
