# Fly Corp clone — spec (grilled 2026-10-02)

Offline iPhone PWA on GitHub Pages. No build step.

## Map & cities
- 2D world map that wraps horizontally (HOI4 style). Routes are great-circle arcs along the shortest path (US→Japan crosses the Pacific).
- 500+ curated cities, culled by zoom level: major economic hubs + remote/extreme (Longyearbyen, Ushuaia, Easter Island, McMurdo, Tristan, Pitcairn, St Helena, Utqiagvik, Nuuk...) + geopolitically weird (Pyongyang, Kaliningrad, Diego Garcia, Svalbard, Taiwan, N. Cyprus, Transnistria).
- Geopolitics is flavor only: no access rules.
- Interesting cities have traits (e.g. remote = high fare, low volume). No custom cities.
- Lore card on tap: real fact, IATA/pop/GDP tier, live stats (waiting, top wanted destinations, weekly income), trait badge.

## Modes
Free Play, Unlock All (timed country unlocks), Scenarios, Sandbox. Sandbox/economy toggle.

## Economy
- Demand = gravity (pop × economic weight / distance) + hand-tuned real ties (LHR–JFK, Gulf–India, Paris–Maghreb, US–Mexico...).
- Fares by distance, scaled realistically by country wealth; rich markets pay much more. TUNE LATER.
- Route purchase cost scales with length. Each plane level has a max range.
- Country unlock cost escalates but stays "reasonable". TUNE LATER.
- Never lose: debt → auto loan, overflow → -30% income only.

## Planes
- Per-route, shuttle back and forth. Fly Corp L1–L6 (20/50/100/... seats), upgraded in place; L7 Super Jet from events/cheats.
- Selling refunds 100% of what was paid.

## Airports
- Unlimited routes per airport.
- Capacity levels with green/yellow/orange/red colors; red = -30% income.
- Perks at higher levels: lounge, duty-free (income per transfer passenger).
- Hubs: a free home hub chosen at start + extra hubs bought later; transfer bonus + capacity boost.

## Passengers
Spawn with a destination; pathing = fewest hops, ties broken by distance; they transfer freely.

## Time
1 game week ≈ 1 real minute. Pause / 1x / 2x / 4x.

## Events
Real-world flavored (Olympics, Eyjafjallajökull ash, typhoon, Hajj, CNY), Fly Corp classic (strike, Super Jet, trade-in, block, fare boost), choice cards. No pandemic.

## Cheats (settings toggle)
Money/unlocks, world editing (pop, clear airport, force/cancel events), physics breakers (infinite range, 1000x speed, instant transfers), god planes (custom stats). Achievements still unlock but carry a cheat badge.

## Milestones
Scale, exploration, design feats.

## Feel / UI
- Drag city→city to build routes. Fly Corp flat look.
- Soft SFX + mute. Haptics only work on Android (iOS Safari can't vibrate).
- Saves: autosave + 5 slots in localStorage.
- Stats panel: load factor, route profit, busiest airports.
