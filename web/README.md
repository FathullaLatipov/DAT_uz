# Karvon — freight intelligence for Uzbekistan

Karvon ranks freight loads for a specific truck. For each load it scores fit, estimates deadhead and profit, finds return loads, and shows market rates per lane. The target market is Uzbekistan and its international corridors (KZ, KG, TJ, TM, RU, CN, TR, AZ, GE, BY, AM).

> **All freight, brokers, reviews, trips and market figures in this repository are generated DEMO DATA.** The UI labels them as demo everywhere they appear.

## Quick start

Requirements: Node.js 20+ (the project was built with Node 22) and a PostgreSQL database — a free [Neon](https://neon.tech) project works well and is what production (Vercel) uses too.

```bash
cd web
npm install
cp .env.example .env          # set DATABASE_URL to your Postgres connection string, AUTH_SECRET to 32+ random characters
npx prisma migrate dev        # creates the schema and runs the seed
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
| `DATABASE_URL` | PostgreSQL connection string (e.g. a Neon project). Required — SQLite is not supported (Vercel's serverless functions have a read-only filesystem). |
| `AUTH_SECRET` | HS256 session signing key. Required in production. |
| `COOKIE_SECURE` | Set to `1` in production (Vercel) so the session cookie is marked Secure. Leave unset for local HTTP. |
| `ANTHROPIC_API_KEY` | Optional. Enables the LLM query parser and summaries. Without it, a rule-based parser is used (EN/RU/UZ). |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `NEXT_PUBLIC_MAP_TILES` | Raster tile URL. Defaults to OSM standard tiles, which are fine for development only; use a commercial or self-hosted provider in production. |
| `TELEGRAM_BOT_TOKEN`, `SMTP_URL` | Turn on the Telegram and email alert channels once they are implemented (see below). |
| `DEMO_SOURCES=off` | Disables the demo adapters in scheduled syncs. |
| `JOBS_ENABLED`, `JOBS_SECRET` | `JOBS_ENABLED=1` starts the background scheduler; `JOBS_SECRET` authenticates `POST /api/jobs/run` (required when enabled). |
| `ALERT_TELEGRAM_CHAT_ID` | Optional. With `TELEGRAM_BOT_TOKEN`, sends operator alerts (source down, listener silent…) to this chat. |
| `CBU_RATES_URL`, `OSRM_URL` | Optional overrides for the FX feed and the OSRM server used by the distance-table script. |

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

When real data is flowing, set `HIDE_DEMO=1` to keep demo listings off the public pages.

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

## Deploying to Vercel

1. **Database**: create a Postgres project (e.g. [Neon](https://neon.tech), free tier) and copy its connection string.
2. **Push to GitHub**, then import the repo in Vercel, with `web/` as the project root.
3. **Environment variables** (Vercel project settings → Environment Variables):
   - `DATABASE_URL` — the Postgres connection string.
   - `AUTH_SECRET` — 32+ random chars (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   - `COOKIE_SECURE=1` — Vercel serves over HTTPS, so the session cookie must be marked Secure.
   - `HIDE_DEMO=1` — once real data is flowing, hides the generated demo freight.
   - Any of the optional ones from the table above you want (`ANTHROPIC_API_KEY`, `TELEGRAM_INGEST_SECRET`, …).
4. **Deploy.** The build runs `prisma migrate deploy` automatically (see `package.json`'s `build` script) before `next build`, so the schema is created/updated on every deploy — no manual migration step.
5. **Seed data (optional, once)**: run `npx prisma db seed` (or `npm run db:seed`) locally with `DATABASE_URL` pointed at the same Postgres project, to get the demo accounts and demo market data on the live site too.

The local Telegram listener (`scripts/telegram-listener/`) keeps running on your machine and posts to whatever `KARVON_URL` its `.env*` files point at — change that to your `https://<project>.vercel.app` URL (and `KARVON_INGEST_SECRET` to match the deployed `TELEGRAM_INGEST_SECRET`) if you want it to feed the live site directly instead of (or in addition to) local dev.

## What's verified

- `npm run build` passes. TypeScript and ESLint are clean, and all 11 unit tests pass.
- The production build was checked at 11 widths (320–1920 px) on 14 pages: no horizontal overflow and no console errors.
- Lighthouse (mobile) ranges from 91 to 100 in every category on the landing page, login, dashboard, load board, market, fleet, assistant and settings.
- Smoke tests covered the API flows: login, signup, onboarding, NL search, dispatcher, favorites, saved searches, settings, truck CRUD, assign load → backhaul notification, admin sync, CSV import, role denial for dispatchers, and org isolation (another org's truck returns 404).

## Known limitations / next steps

- **Distances come from a pre-computed OSRM table** (`src/server/domain/road-distances.generated.ts`, 39 cities). Rebuild it with `npx tsx scripts/build-road-distances.ts` after adding a city; a pair missing from the table falls back to a great-circle estimate. The public OSRM demo server has wrong data around the Azerbaijan–Georgia border (Baku–Tbilisi is overridden by hand in `geo.ts`; other Baku→west pairs are inflated). Point `OSRM_URL` at a self-hosted OSRM with fresh data for a precise table. Distances between arbitrary points (not city centres) are still not routed.
- **Background jobs** run inside the server when `JOBS_ENABLED=1` (set in `docker-compose.yml`; needs `JOBS_SECRET` in `.env`): source sync every 15 min, offer expiry and saved-search alerts every 10 min, CBU.uz exchange rates every 6 h, and a health check every 10 min that alerts admins (in-app, plus Telegram if `TELEGRAM_BOT_TOKEN` and `ALERT_TELEGRAM_CHAT_ID` are set) when a source fails or goes stale, the Telegram listener goes silent, no new loads arrive, FX rates are old, or a job keeps failing. Alerts fire on change only. Runs are recorded in `JobRun` and shown in Admin → Background jobs. Point an uptime monitor at `GET /api/health` (503 when the scheduler stops) — it is the only thing that can notice the scheduler itself dying. Without `JOBS_ENABLED` (Vercel) call `POST /api/jobs/run` from an external cron: `curl -X POST $URL/api/jobs/run -H "x-ingest-secret: $JOBS_SECRET" -H "content-type: application/json" -d '{"job":"sync-sources"}'`. One server instance is assumed; the run lock lives in the database, but a second instance would double the timers.
- **FX rates** are fetched from CBU.uz into the `ExchangeRate` table and loaded into memory before every ingestion. A rate that jumps more than 25% in one refresh is rejected as a bad feed. Offers already stored keep the USD value computed when they arrived.
- **The rate limiter is in-memory**, which only works on a single instance. Move it to Redis for horizontal scaling.
- **Telegram and email delivery** are interfaces only. The account-linking flow (`/start <code>`) still needs implementing.
- **Ranking is computed in memory** over active offers, which is fine for thousands of rows. Move it to SQL pre-filtering plus materialized lane stats (`RouteAnalytics`) as volume grows.
- **Billing plans are modelled but not enforced** (see `PLAN_FEATURES`).
- **The "Save & alert" button names searches with a native prompt.** Replace it with an inline dialog.
