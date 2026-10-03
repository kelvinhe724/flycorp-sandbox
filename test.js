// node test.js — headless self-check of the sim. Loads world/cities/legacy-ids/game with a DOM stub and asserts core logic.
// If ~/.cache/flycorp-fc/save-snap/save-dump.json (a real v1 localStorage dump, never copied into the repo) exists, also tests the v1 → v2 import on it.
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert'), os = require('os');
// ---- minimal DOM stub: one proxy element answers everything, canvas ctx swallows every call
const el = new Proxy({}, { get: (o, k) => k in o ? o[k] : k === 'children' ? [] : k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains: () => false }
  : k === 'dataset' || k === 'style' ? (o[k] = {}) : k === 'getContext' ? () => ctx : typeof k === 'symbol' ? undefined : () => el, set: (o, k, v) => (o[k] = v, true) });
const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : () => ({ width: 10 }), set: (o, k, v) => (o[k] = v, true) });
const mem = {};
const FIX = os.homedir() + '/.cache/flycorp-fc/save-snap/save-dump.json', fix = fs.existsSync(FIX) ? JSON.parse(fs.readFileSync(FIX, 'utf8')) : null;
if (fix) for (const k of Object.keys(fix)) if (k.startsWith('fc_')) mem[k] = fix[k]; // seed v1 keys so the first-run import fires at startup
Object.assign(globalThis, { window: globalThis, assert, mem, fix, document: { querySelector: () => el, addEventListener() {}, createElement: () => el, hidden: false, documentElement: el },
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener() {}, requestAnimationFrame: () => 0, location: { protocol: 'file:' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } },
  Path2D: class { moveTo() {} lineTo() {} closePath() {} } });
const src = ['world.js', 'cities.js', 'legacy-ids.js', 'game.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n');
const t0 = performance.now();

function tests() { // runs inside the game's scope: S, C, tryRoute, ... are in reach
  const out = [], T = (label, f) => { const t = performance.now(); const r = f(); out.push(`${label}: ${(performance.now() - t).toFixed(0)} ms${r ? ' ' + r : ''}`); };
  if (fix) { assert.deepEqual(ACH, JSON.parse(fix.fc_ach), 'achievements seeded from v1'); assert.equal(SET.mute, JSON.parse(fix.fc_set).mute); }
  const id = n => { const i = byName(n); assert(i >= 0, 'city missing: ' + n); return i; };
  const NY = id('New York'), CHI = id('Chicago'), LON = id('London'), LA = id('Los Angeles'), TYO = id('Tokyo'), DEN = id('Denver'), MIA = id('Miami'), SYD = id('Sydney'), MEL = id('Melbourne');
  S = newState('sandbox'); S.infinite = false; S.cash = 1e12; rebuild();
  // routes + Pacific arc
  tryRoute(NY, CHI); tryRoute(CHI, DEN); tryRoute(NY, MIA); tryRoute(MIA, DEN); tryRoute(NY, LON); tryRoute(LA, TYO); tryRoute(SYD, MEL);
  assert.equal(S.routes.length, 7);
  const pac = S.routes.find(r => r.a === LA); assert(pac.bx0 < 0 && pac.bx1 < 100, 'LA→Tokyo must cross the Pacific (unwrapped x goes negative)');
  // passengers spawn only toward reachable cities
  for (let k = 0; k < 50; k++) spawn(1);
  for (const i of NODES) { const comp = new Set(COMP.get(i)); for (const m of ap(i).q.values()) for (const d of m.keys()) assert(comp.has(d) && d !== i, `${C[i].n} spawned pax for unreachable ${C[d].n}`); }
  assert(ap(NY).wait > 0 && ap(SYD).wait > 0, 'nothing spawned');
  assert(![...ap(NY).q.values()].some(m => m.has(SYD)), 'NY must not spawn pax for the disconnected SYD-MEL pair');
  // fewest hops, ties by km: DEN→NY is 2 hops either way; via CHI is shorter than via MIA. NY→LON direct beats any transfer.
  assert.equal(NH.get(DEN)[NY], CHI, 'DEN→NY should go via Chicago (shorter of two 2-hop paths)');
  assert.equal(NH.get(CHI)[LON], NY, 'CHI→LON: 2 hops via NY');
  assert.equal(NH.get(NY)[LON], LON, 'NY→LON direct');
  // landing pays income; full airport pays 30% less; direct vs connecting mix is tracked
  const r = S.routes.find(x => x.a === NY && x.b === LON), p = r.planes[0];
  const pay = full => { p.from = NY; p.at = -1; p.load = new Map([[LON, 10]]); p.n = 10; ap(NY).full = full; ap(LON).full = false; const c0 = S.stats.inc; land(r, p); return S.stats.inc - c0; };
  const inc = pay(false), incFull = pay(true);
  assert(Math.abs(inc - 10 * r.fare) < 1e-6, 'landing should pay seats × fare, got ' + inc);
  assert(Math.abs(incFull - inc * CFG.fullPenalty) < 1e-6, 'full airport should pay ' + CFG.fullPenalty + '×');
  assert.equal(r.wk.dir, 20); assert.equal(ap(LON).wk.arr, 20); assert(r.inc > 0 && ap(LON).inc > 0, 'lifetime income tracked');
  p.from = LON; p.at = -1; p.load = new Map([[CHI, 5]]); p.n = 5; land(r, p); assert.equal(r.wk.xf, 5); assert.equal(ap(NY).wk.flows.get(LON + '>' + CHI), 5, 'transfer flow LON→CHI via NY tracked');
  // unmet demand: a full airport counts turned-away passengers
  ap(SYD).lvl = 0; ap(SYD).wait = cap(SYD); ap(SYD).acc = 5; const D = DEM.get(SYD); D.t = D.t || 1; spawn(1); assert(ap(SYD).wk.unmet > 0, 'turned-away pax counted');
  // selling refunds 100% (incl. upgrades)
  let c0 = S.cash; addPlane(r, 0); const np = r.planes[r.planes.length - 1]; upgradePlane(r, np); const spent = c0 - S.cash; assert(spent > 0);
  sellPlane(r, np); assert.equal(S.cash, c0, 'sell must refund exactly what was paid');
  c0 = S.cash; const rr = S.routes[0], v = rr.cost + rr.planes.reduce((s, q) => s + q.paid, 0); deleteRoute(rr); assert.equal(S.cash, c0 + v, 'route delete refunds route + planes');
  // bulk: preview trims to the budget cap, confirm applies and spends exactly the preview total
  S.cash = 1e12; const items = BULK.radd(r, 5); bulkCap = 100; bulk('t', items); assert.equal(bulkCur.go.length, 5); c0 = S.cash; const tot = bulkCur.tot; bulkApply(); assert.equal(r.planes.length, 6); assert.equal(S.cash, c0 - tot);
  S.cash = items[0].c * 2.5; bulk('t', BULK.radd(r, 5)); assert.equal(bulkCur.go.length, 2, 'budget cap trims to what fits'); bulkCur = null; closeModal(); S.cash = 1e12;
  const ci = countryItems('United States of America', 'chain'), cs = countryItems('United States of America', 'star'); assert(ci.length > 5 && cs.length > 5 && ci.length <= cs.length + 1, 'country chain/star build items');
  assert.equal(cs.length, COUNTRY.get('United States of America').cities.length - 1 - routesAt(byName('New York')).filter(x => C[x.a].c === C[x.b].c).length, 'star skips existing routes');
  // save → load round trip (v2: keys, not indices)
  S.week = 7; upgradeAirport(NY); const snap = serialize(); assert.equal(snap.v, 2); assert(snap.keys[snap.routes[0].a].includes('|'), 'routes reference the key table'); assert.equal(snap.home, null);
  const sig = s => JSON.stringify([s.routes.map(x => [x.a, x.b, x.cost, x.planes.map(q => [q.lvl, q.seats, q.paid])]), s.cash, s.week, Object.entries(s.ap).map(([k, a]) => [k, a.lvl, a.xfer, a.q.sort()])]);
  deserialize(JSON.parse(JSON.stringify(snap)));
  assert.equal(sig(serialize()), sig(snap), 'serialize(deserialize(x)) must equal x');
  assert.equal(S.ap[NY].lvl, 1); assert.equal(Object.values(S.ap).reduce((s, a) => s + a.wait, 0), Object.values(snap.ap).reduce((s, a) => s + a.q.reduce((t, [, n]) => t + n, 0), 0), 'waiting pax survive a reload');
  // unknown city keys are dropped, not fatal
  const bad = JSON.parse(JSON.stringify(snap)), X = bad.keys.push('Atlantis|Nowhere') - 1; bad.routes.push({ id: 999, a: X, b: snap.routes[0].a, cost: 1, planes: [] }); bad.ap[X] = { lvl: 2, xfer: 0, q: [[snap.routes[0].a, 7]] }; bad.hubs.push(X);
  deserialize(bad); assert.equal(DROP.routes, 1); assert.equal(DROP.airports, 1); assert.equal(DROP.pax, 7); assert.equal(S.routes.length, snap.routes.length);
  // step() runs a week without blowing up; history recorded
  for (let h = 0; h < 168; h += 7) step(7);
  assert(S.stats.pax > 0 && isFinite(S.cash), 'a simulated week should deliver passengers'); assert.equal(S.hist.length, 1); assert.equal(S.ap[NY].h.length, 1); assert.equal(S.routes[0].h.length, 1);
  S.hist = Array.from({ length: CFG.histMax + 1 }, (_, k) => [k, 1, 1, 1]); S.hour = 168; step(0); assert(S.hist.length < CFG.histMax, 'old history gets downsampled');
  // v1 keys must never be written
  for (const k of Object.keys(mem)) if (k.startsWith('fc_')) assert.equal(mem[k], fix ? fix[k] : undefined, 'v1 key modified: ' + k);
  assert(!Object.keys(mem).some(k => /^fc_/.test(k) && !(fix && k in fix)), 'v2 wrote a v1 key');
  out.push(`ok: ${S.routes.length} routes, ${nPlanes()} planes, ${S.stats.pax} pax delivered, cash ${fmt$(S.cash)}`);
  // ---- perf: 600-airport synthetic network rebuild
  S = newState('sandbox'); rebuild(); const big = RANK.slice(0, 600); S.ch.range = true;
  for (let k = 1; k < 600; k++) { const q = routeQuote(big[k], big[k % 7 === 0 ? 0 : (k * 7) % k]); rawRoute(big[k], big[(k * 7) % k], q); }
  for (let k = 0; k < 200; k++) { const a = big[(k * 13) % 600], b = big[(k * 29 + 7) % 600]; if (a !== b && !hasRoute(a, b)) rawRoute(a, b, routeQuote(a, b)); }
  T(`rebuild() ${NODES.length || 'n/a'}→600 airports, ${S.routes.length} routes`, () => { rebuild(); return `(${NODES.length} nodes, NH ${(NODES.length * NC * 2 / 1e6).toFixed(1)} MB)`; });
  T('serialize 600-airport net', () => `${(JSON.stringify(serialize()).length / 1024).toFixed(0)} KB`);
  // ---- real fixture import
  if (!fix) { out.push('fixture absent: import test skipped'); return out.join('\n'); }
  const chk = (o, label) => { // exact equality between a v1 object and the live state (cities matched by name|country via LEGACY_IDS)
    const K = i => LEGACY_IDS[i], live = new Map(S.routes.map(r => [r.id, r]));
    assert.equal(S.routes.length, o.routes.length, label + ' route count');
    for (const r0 of o.routes) { const r = live.get(r0.id); assert(r, label + ' route ' + r0.id); assert.equal(C[r.a].k, K(r0.a)); assert.equal(C[r.b].k, K(r0.b)); assert.equal(r.cost, r0.cost);
      assert.deepEqual(r.planes.map(p => [p.lvl, p.paid, p.seats, p.kmh, p.custom]), r0.planes.map(p => [p.lvl, p.paid, p.seats, p.kmh, p.custom]), label + ' planes on route ' + r0.id); }
    assert.equal(Object.keys(S.ap).length, Object.keys(o.ap).length, label + ' airport count');
    for (const [i, a0] of Object.entries(o.ap)) { const a = S.ap[KEY.get(K(+i))]; assert(a, label + ' airport ' + K(+i)); assert.equal(a.lvl, a0.lvl); assert.equal(a.xfer, a0.xfer); }
    assert.equal(Object.values(S.ap).reduce((s, a) => s + a.wait, 0), Object.values(o.ap).reduce((s, a) => s + a.q.reduce((t, [, n]) => t + n, 0), 0), label + ' queued pax');
    assert.equal(S.cash, o.cash); assert.equal(S.week, o.week); assert.equal(S.hour, o.hour); assert.deepEqual([...S.unlocked].sort(), [...o.unlocked].sort()); assert.equal(C[S.home].k, K(o.home));
    assert.deepEqual([...S.hubs].map(i => C[i].k).sort(), o.hubs.map(K).sort()); assert.deepEqual(S.stats, o.stats); assert.deepEqual(S.ch, o.ch); assert.equal(S.cheated, o.cheated); assert.equal(S.mode, o.mode);
    assert.equal(S.rid, o.rid); assert.equal(S.lastWkInc, o.lastWkInc); assert.equal(S.deadline, o.deadline); assert.equal(S.allOpen, o.allOpen); assert.equal(S.infinite, o.infinite); assert.deepEqual(S.scen, o.scen);
    assert.deepEqual(S.effects.map(e => ({ ...e, city: e.city != null ? C[e.city].k : undefined })), o.effects.map(e => ({ ...e, city: e.city != null ? K(e.city) : undefined })), label + ' effects');
    assert.deepEqual(Object.entries(S.pm).map(([i, v]) => [C[+i].k, v]).sort(), Object.entries(o.pm).map(([i, v]) => [K(+i), v]).sort());
    return `${S.routes.length} routes, ${nPlanes()} planes, ${Object.keys(S.ap).length} airports, ${fmtN(Object.values(S.ap).reduce((s, a) => s + a.wait, 0))} queued, wk ${S.week}, ${fmt$(S.cash)}`;
  };
  assert(mem.fc2_auto && mem.fc2_s1, 'first-run import should have created fc2_auto and fc2_s1 at startup');
  for (const slot of ['auto', 's1']) {
    const o = JSON.parse(fix['fc_' + slot]);
    T(`importV1(${slot})`, () => { assert(importV1(slot, true)); assert.equal(DROP.routes + DROP.airports + DROP.pax + DROP.cities, 0, 'nothing dropped'); return ''; });
    T(`load(${slot})`, () => { assert(load(slot)); return chk(o, slot); });
    assert.equal(S.hist.length, 0);
    T(`round-trip ${slot}`, () => { const v2 = JSON.stringify(serialize()); deserialize(JSON.parse(v2)); return chk(o, slot + ' round-trip') + ` · v2 save ${(v2.length / 1024).toFixed(0)} KB`; });
    T(`rebuild() ${NODES.length} airports`, rebuild);
    T(`20 frames of drawFg @1000× (${nPlanes()} planes)`, () => { for (let k = 0; k < 20; k++) drawFg(); });
    T(`sim 1 week @1000× (${nPlanes()} planes)`, () => { for (let h = 0; h < 168; h += 4.2) step(4.2); });
    T('cityStats(home) + showStats(records)', () => { cityStats(S.home); dash.tab = 'records'; showStats(); dash.tab = 'overview'; });
  }
  for (const k of Object.keys(fix)) if (k.startsWith('fc_')) assert.equal(mem[k], fix[k], 'v1 key modified: ' + k);
  return out.join('\n');
}
console.log(`startup (world+cities+game eval): ${(performance.now() - t0).toFixed(0)} ms (measured below)`);
const t1 = performance.now(); vm.runInThisContext(src, { filename: 'game.js' }); console.log(`startup eval: ${(performance.now() - t1).toFixed(0)} ms, ${NC} cities`);
console.log(vm.runInThisContext('(' + tests.toString() + ')()', { filename: 'test.js' }));
