// node test.js — headless self-check of the sim. Loads world/cities/game with a DOM stub and asserts core logic.
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
// ---- minimal DOM stub: one proxy element answers everything, canvas ctx swallows every call
const el = new Proxy({}, { get: (o, k) => k in o ? o[k] : k === 'children' ? [] : k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains: () => false }
  : k === 'dataset' || k === 'style' ? (o[k] = {}) : k === 'getContext' ? () => ctx : typeof k === 'symbol' ? undefined : () => el, set: (o, k, v) => (o[k] = v, true) });
const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : () => ({ width: 10 }), set: (o, k, v) => (o[k] = v, true) });
const mem = {};
Object.assign(globalThis, { window: globalThis, assert, document: { querySelector: () => el, addEventListener() {}, createElement: () => el, hidden: false },
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener() {}, requestAnimationFrame: () => 0, location: { protocol: 'file:' },
  localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } },
  Path2D: class { moveTo() {} lineTo() {} closePath() {} } });
const src = ['world.js', 'cities.js', 'game.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n');

function tests() { // runs inside the game's scope: S, C, tryRoute, ... are in reach
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
  // landing pays income; full airport pays 30% less
  const r = S.routes.find(x => x.a === NY && x.b === LON), p = r.planes[0];
  const pay = full => { p.from = NY; p.at = -1; p.load = new Map([[LON, 10]]); p.n = 10; ap(NY).full = full; ap(LON).full = false; const c0 = S.stats.inc; land(r, p); return S.stats.inc - c0; };
  const inc = pay(false), incFull = pay(true);
  assert(Math.abs(inc - 10 * r.fare) < 1e-6, 'landing should pay seats × fare, got ' + inc);
  assert(Math.abs(incFull - inc * CFG.fullPenalty) < 1e-6, 'full airport should pay ' + CFG.fullPenalty + '×');
  // selling refunds 100% (incl. upgrades)
  let c0 = S.cash; addPlane(r, 0); const np = r.planes[r.planes.length - 1]; upgradePlane(r, np); const spent = c0 - S.cash; assert(spent > 0);
  sellPlane(r, np); assert.equal(S.cash, c0, 'sell must refund exactly what was paid');
  c0 = S.cash; const rr = S.routes[0], v = rr.cost + rr.planes.reduce((s, q) => s + q.paid, 0); deleteRoute(rr); assert.equal(S.cash, c0 + v, 'route delete refunds route + planes');
  // save → load round trip
  S.week = 7; upgradeAirport(NY); const snap = serialize(); const sig = s => JSON.stringify([s.routes.map(x => [x.a, x.b, x.cost, x.planes.map(q => [q.lvl, q.seats, q.paid])]), s.cash, s.week, s.ap]);
  deserialize(JSON.parse(JSON.stringify(snap)));
  assert.equal(sig(serialize()), sig(snap), 'serialize(deserialize(x)) must equal x');
  assert.equal(S.ap[NY].lvl, 1); assert.equal(Object.values(S.ap).reduce((s, a) => s + a.wait, 0), Object.values(snap.ap).reduce((s, a) => s + a.q.reduce((t, [, n]) => t + n, 0), 0), 'waiting pax survive a reload');
  // step() runs a week without blowing up
  for (let h = 0; h < 168; h += 7) step(7);
  assert(S.stats.pax > 0 && isFinite(S.cash), 'a simulated week should deliver passengers');
  return `ok: ${S.routes.length} routes, ${nPlanes()} planes, ${S.stats.pax} pax delivered, cash ${fmt$(S.cash)}`;
}
console.log(vm.runInThisContext(src + '\n;(' + tests.toString() + ')()', { filename: 'game.js' }));
