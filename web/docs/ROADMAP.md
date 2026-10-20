# Karvon roadmap

Stage 1 is specified task by task: where it lives in the UI (page → block), what it touches in the data and the code, how it is checked. The later stages are a backlog, ordered, to be specified when they start.

## Stage 1 — Truck-aware planning

Goal: a carrier sees only what their truck can legally and physically carry, and the route, distance, time and profit are calculated for *that truck*, not for a passenger car.

Delivered in three PRs: **A** (1.1–1.3, data and fit), **B** (1.4–1.5, routing engine and map), **C** (1.6–1.7, money and trust).

### 1.1 Truck passport — dimensions, weights, permits
- **Where:** Fleet → *new truck* and Fleet → *truck* → card "Profile" (`TruckForm`). New block **"Dimensions & permits"** between *Vehicle* and *Status & location*.
- **Fields (all optional; empty = unknown, never blocks):** cargo space length / width / height (m); vehicle overall height / width / length (m); gross weight (kg); number of axles; max axle load (kg); ADR-certified (yes/no).
- **Defaults:** one click "Fill typical values" for the chosen truck type (semi-trailer 13.6 × 2.45 × 2.7, overall height 4.0 …).
- **Fleet list:** a muted "Add dimensions" hint on trucks without them, so the data fills in over time.
- **Data:** `Truck` gets the nullable columns above plus `adr Boolean @default(false)`. Additive migration.
- **API:** `truckSchema` in `src/app/api/trucks/schema.ts` (ranges, vehicle ≥ cargo space).
- **Check:** unit tests for the schema; e2e: save, reload, values kept.

### 1.2 Cargo size and hazard class on loads
- **Where:** *Post a load* → block "Cargo" gets a row "Size (L × W × H, m)", "Oversize", "ADR class". Load detail → block "Cargo" shows them. Telegram/paste parsers read "13.6x2.45x2.7", "негабарит", "ADR 3" from the text.
- **Data:** `FreightOffer` gets nullable `cargoLengthM/WidthM/HeightM`, `oversize Boolean`, `adrClass String?` (1–9). Existing `requirements` containing "ADR" counts as hazardous.
- **Code:** `textparse.ts` (size/oversize/ADR extraction, pure and tested), `normalize.ts`, `pipeline.ts` (store), `api/loads` (post), `api/loads/[id]` (read).

### 1.3 Does it fit? — checks in matching and filters
- **Where:** Loads board → the existing *Min match score* filter and the sort already drop and rank down loads the truck cannot carry (size and ADR are now part of eligibility); load detail → *Match* block shows the reasons (blockers with both numbers).
- **Rules (`matching.ts`):** hard blockers — cargo taller/longer/wider than the cargo space, ADR load for a truck without ADR; warnings — oversize load, missing truck dimensions ("add dimensions to check"), weight near the gross limit. Unknown values never block.
- **Check:** unit tests for each rule, plus one scenario in `scripts/e2e/flow.py`.

### 1.4 Truck routing engine
- **What:** self-hosted **Valhalla** (truck costing: height, width, length, weight, axle load, hazmat) in the server's docker-compose, fed with an OpenStreetMap extract for Uzbekistan and its corridors (KZ, KG, TJ, TM, RU, CN, TR, AZ, GE). Fallback to the current city-pair table when it is down.
- **Code:** `src/server/services/routing.ts` (client, request built from the truck passport, timeouts), `RouteCache` table (origin, destination, truck-profile hash → polyline, km, minutes, restrictions), nightly warm-up for popular lanes.
- **Honesty rule:** OSM restrictions in Central Asia are incomplete; every routed result says so in the UI ("based on map data, verify low bridges and bans on the road"). A commercial engine (HERE/TomTom) is a drop-in replacement behind the same `routing.ts` interface.
- **Check:** contract tests against recorded responses; health-check job reports the engine as a source.

### 1.5 The route on the map
- **Where:** Load detail → the map block now draws the real road (not a straight line): truck → pickup (empty) and pickup → delivery (loaded), with distance and driving time per leg. New block **"Route for T-1024"** right after the *Profit calculator*: km, hours, restrictions found on the way (height, weight, ban zones), alternative without restrictions.
- **Also:** trip page (tracking) uses the same polyline and a routed ETA.
- **Code:** `route-map.tsx` takes polylines from `routing.ts`; `LazyMap` already supports routes.

### 1.6 Profit on the real route

**Status: done for the single-load views** (page, row panel, load API): the calculator takes the routed loaded and empty km from the truck's route (falls back to the city table when the service is slow or has no route) and says which basis it shows. Not yet: the score in the load list (thousands of pairs; stays on the table), the trip created by *take this load*, and toll cost (still a per-km estimate on the routed km).
- **Where:** *Profit calculator* and the match score use routed km and hours; toll estimate from the route; diesel from the truck's own consumption.
- **Code:** `profitability.ts` (km source), `matching.ts` (deadhead from routed km when cached).

### 1.7 Trust and cleanup
- Admin → Overview shows the routing engine status and cache hit rate.
- README and `docs/` describe how to rebuild the map extract and what each restriction means.

## Stage 2 — Money and trip

### 2.1 Border crossings (done)
`domain/borders.ts`: land border graph between the covered countries, the quickest usual corridor between two countries (Dijkstra), typical time per crossing as a low–high range, fees and papers (CMR / TIR / transit declaration; no fee and CMR only inside the customs union). Used for: the **Border crossings** card on the load page (after the route card), the transit time (driving days + typical border time), the fee part of the profit estimate, and the ETA of a taken or started trip. The hour ranges and the fee are planning figures, not live queues, and are meant to be corrected by someone who knows the corridors.

### 2.2 Driver hours and rest (done)
`domain/hos.ts`: one driver drives up to 9 h a day with a 45 min break per 4.5 h and a night's rest (planned as a 24 h day); a team of two drives around the clock (18 h of driving per 24 h, plus handover). The truck has a *Drivers on board* setting (1 or 2) in the passport block. Trip time = driving (from the cached road route's duration when there is one, else distance / 61 km/h) + rest + typical border time. Shown on the load page as *Of which: driving · rest and breaks · at borders*; used for the ETA when a load is taken or a trip is started. Not modelled: the two longer driving days a week, loading/unloading hours, national holidays.
### 2.3 Diesel price by country (next)

## Later stages (backlog, in order)

**2. Money and trip** — toll roads, border and customs time (TIR, CMR, permits), driver hours/rest in ETA, live diesel prices.
**3. Trust** — company check by tax ID, shipper rates carrier, cancellation rate, trip documents (waybill, CMR, photos), driver/truck reliability.
**4. Reach** — Telegram live location for drivers, PWA + push, change/forgot password, restore the 3,100 hidden loads by re-parse, in-platform payments, empty-return chains.
**5. Platform** — public API and webhooks, plans and billing, market trend analytics.
