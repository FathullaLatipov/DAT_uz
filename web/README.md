# Karvon — freight intelligence for Uzbekistan

Karvon ranks freight loads for a specific truck. For each load it scores fit, estimates deadhead and profit, finds return loads, and shows market rates per lane. The target market is Uzbekistan and its international corridors (KZ, KG, TJ, TM, RU, CN, TR, AZ, GE, BY, AM).

> **All freight, brokers, reviews, trips and market figures in this repository are generated DEMO DATA.** The UI labels them as demo everywhere they appear.

## Quick start

Requirements: Node.js 20+ (the project was built with Node 22).

```bash
cd web
npm install
cp .env.example .env          # then set AUTH_SECRET to 32+ random characters
npx prisma migrate dev        # creates SQLite dev.db and runs the seed
npm run dev                   # http://localhost:3000
```

Demo accounts (created by the seed):

| Email | Password | Role |
|---|---|---|
| demo@karvon.uz | demo1234 | Company admin (fleet of 7 trucks) |
| dispatcher@karvon.uz | demo1234 | Dispatcher (read + assign only) |
| admin@karvon.uz | admin1234 | Platform admin (adds /app/admin) |

Other scripts: `npm run build`, `npm start`, `npm test` (unit tests for the deterministic core), `npm run lint`, `npm run typecheck`, `npm run db:seed` (reset the demo market).

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for SQLite. For Postgres, set `provider = "postgresql"` in `prisma/schema.prisma` and run `prisma migrate dev`. |
| `AUTH_SECRET` | HS256 session signing key. Required in production. |
| `ANTHROPIC_API_KEY` | Optional. Enables the LLM query parser and summaries. Without it, a rule-based parser is used (EN/RU/UZ). |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `NEXT_PUBLIC_MAP_TILES` | Raster tile URL. Defaults to OSM standard tiles, which are fine for development only; use a commercial or self-hosted provider in production. |
| `TELEGRAM_BOT_TOKEN`, `SMTP_URL` | Turn on the Telegram and email alert channels once they are implemented (see below). |
| `DEMO_SOURCES=off` | Disables the demo adapters in scheduled syncs. |

## Architecture

```
Next.js (App Router, RSC)  ─  UI + route handlers (/api/*)
        │
src/server
├─ auth/          JWT session (httpOnly cookie), DB-checked membership, role permissions
├─ http.ts        API wrapper: auth, permission, rate limit, friendly errors
├─ domain/        enums, geography (cities/aliases/distances), currency
├─ ingestion/     source adapters → normalize → quality → dedupe → DB
│   ├─ adapters/  demo (A: EN feed, B: RU feed), manual CSV, external stubs (ATI, Lardi, DELLA, DIIP, YUK.UZ, E-Logistika)
│   ├─ normalize.ts  cities/countries/bodies/cargo/units/currency/broker identity + data-quality flags
│   ├─ dedupe.ts     fingerprint + fuzzy similarity (lane, date ±1d, weight, body, rate, broker)
│   └─ pipeline.ts   IngestionRun records: fetched/created/updated/duplicates/rejected/errors/duration
├─ services/
│   ├─ matching.ts        9-component weighted score + hard blockers + reasons/warnings
│   ├─ profitability.ts   deterministic cost model (fuel, driver, maintenance, tolls, other, deadhead)
│   ├─ market.ts          lane/city/market stats from stored freight (min 5 samples, otherwise "insufficient")
│   ├─ broker.ts          reliability from platform reviews (min 3 reviews), formula shown in UI
│   ├─ backhaul.ts        return loads near arrival city + 2-leg route chaining by profit/day
│   ├─ freight.ts         search/rank/recommend, per-org truck context
│   ├─ alerts.ts          saved-search checks; notifier interface (web live; Telegram/email designed)
│   └─ fleet.ts           utilization, empty km, profit/km, weekly series
└─ ai/
    ├─ provider.ts   LLM abstraction (Anthropic or rules); LLM only parses and phrases text
    ├─ nlsearch.ts   rule-based NL → filters (EN/RU/UZ, inflections, Uzbek -dan/-ga suffixes)
    └─ dispatcher.ts intent → truck → capabilities → search → deadhead → profit → rank → explain
```

**Money is never computed by an LLM.** Scores, distances, costs and profit all come from deterministic code that the unit tests cover.

### Data model

Prisma schema: `prisma/schema.prisma`. The main entities are Organization, User, Membership, Truck, Driver, Trip, TruckLocation, FreightOffer, FreightListing, FreightSource, IngestionRun, Broker, BrokerReview, City, Country, ExchangeRate, Favorite, SavedSearch, Notification, Recommendation, AIConversation, AIMessage and AuditLog.

- **FreightOffer** is one deduplicated opportunity.
- **FreightListing** is one sighting of that offer on one source. It keeps the raw payload, the original currency, and when the source last saw it.

Enums are stored as strings and validated with zod, which keeps the schema portable between SQLite and Postgres.

### Public marketplace

| Path | What it shows |
|---|---|
| `/` | Catalog home: search bar, directions as categories (domestic, export by country, import by country), popular routes, newest loads |
| `/catalog` | All active loads with facets (body, cargo, destination country, origin city) and sorting |
| `/routes/[origin]--[dest]` | One route: map, lane rates (or "insufficient data"), all loads, link to the return direction |
| `/load/[id]` | Public load page. Contacts, match score and profit require sign-in |
| `/app/post` | Shippers and brokers post loads. Posted loads go through the same normalize → quality → dedupe pipeline under the first-party source `karvon` |
| `/about` | Product landing page |

When real data is flowing, set `PUBLIC_HIDE_DEMO=1` to keep demo listings off the public pages.

### Data sources: policy

We integrate only through an official API, a licensed feed, a partner agreement, or a CSV that an operator uploads and has the right to use. The code does no scraping and does not bypass logins, CAPTCHAs or paywalls.

Terms checked on 2026-10-08:
- **ATI.SU**, [user agreement](https://ati.su/policies/agreement/), §3.2.1.8: forbids automated scripts that collect information from the site. A site-wide notice also forbids "automated extraction by any services without official permission". The official route is the ATI API ([developers](https://ati.su/developers/auth/), [API rules](https://ati.su/policies/api-agreement/)).
- **Lardi-Trans**, [user agreement](https://help.lardi-trans.com/uk/user_agreement.html), §7.2: gives users no right to automated or programmatic reading or collection of data. §6.5 treats the offer database as Lardi's property.

Scraping either site is therefore off the table.

**Live source: DIIP.UZ** (`src/server/ingestion/adapters/diip.ts`). It reads the public JSON endpoint that diip.uz uses for its own public pages (`api.diip.uz/api/public-seo/loads`). `robots.txt` allows crawling, and DIIP's operators gave the project owner permission (keep that confirmation in writing). The adapter sends a `User-Agent` with a contact address, makes 1 request per second, is capped at `DIIP_MAX_PAGES` (default 5, i.e. 500 newest loads), and gets no contact details because the endpoint exposes none. DIIP locates loads by region, so `REGION_TO_CITY` maps regions to hub cities; unmapped regions are rejected and listed in the admin panel rather than guessed. Enable with `DIIP_SYNC=on`. A sync starts in the background when someone opens the home page and the last sync is older than 15 minutes, or from the admin panel.

**Cargoinfo.uz** is Cargo.lt-based. Its `robots.txt` disallows `/api/` and the list pages, so it is registered as not configured until the operators provide an official export or feed. **Yuk.uz** could not be reached from this machine (DNS timeout) and is not configured either.

Data-quality rules for real feeds: listings from the same source are never merged with each other, real and demo data never merge, and rates flagged `SUSPICIOUS_RATE` (implausible $/km) are hidden from public pages and excluded from recommendations and market statistics.

Every external board is registered as an adapter in the "Integration not configured" state, with access notes; see `src/server/ingestion/adapters/external.ts`. To enable one, implement its `fetch()` against the provider's documented API after confirming its licence terms, then set its credentials env var.

## What's verified

- `npm run build` passes. TypeScript and ESLint are clean, and all 11 unit tests pass.
- The production build was checked at 11 widths (320–1920 px) on 14 pages: no horizontal overflow and no console errors.
- Lighthouse (mobile) ranges from 91 to 100 in every category on the landing page, login, dashboard, load board, market, fleet, assistant and settings.
- Smoke tests covered the API flows: login, signup, onboarding, NL search, dispatcher, favorites, saved searches, settings, truck CRUD, assign load → backhaul notification, admin sync, CSV import, role denial for dispatchers, and org isolation (another org's truck returns 404).

## Known limitations / next steps

- **Distances are estimates** (great-circle × road factor). Plug in OSRM or Valhalla for road routing.
- **FX rates are manual reference values** in the `ExchangeRate` table. Connect the CBU.uz daily rates.
- **No job scheduler yet.** Source sync runs from the admin panel or the seed, and saved-search alerts are checked when the dashboard loads. Add a cron or queue worker (e.g. BullMQ on Redis).
- **The rate limiter is in-memory**, which only works on a single instance. Move it to Redis for horizontal scaling.
- **Telegram and email delivery** are interfaces only. The account-linking flow (`/start <code>`) still needs implementing.
- **Ranking is computed in memory** over active offers, which is fine for thousands of rows. Move it to SQL pre-filtering plus materialized lane stats (`RouteAnalytics`) as volume grows.
- **Billing plans are modelled but not enforced** (see `PLAN_FEATURES`).
- **The "Save & alert" button names searches with a native prompt.** Replace it with an inline dialog.
