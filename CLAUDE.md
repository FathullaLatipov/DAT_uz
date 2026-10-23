# Karvon — guide for Claude sessions

Read this first; it saves you from re-deriving the project. Last updated 2026-10-21. Detailed product docs: `web/README.md` (architecture, data model, features), `web/docs/ROADMAP.md` (stage plan and status), `web/docs/DATA_SOURCES.md` (freight sources and what is allowed).

## What it is
**Karvon** — freight platform for Uzbekistan and its corridors (KZ, KG, TJ, TM, RU, CN, TR, AZ, GE, BY, AM). Carriers find loads ranked for their truck (fit, deadhead, profit, route); shippers/brokers post loads; both sides run the trip end to end (take → start → track → deliver → pay → review). Production: https://karvonai.uz (old name karvon.latipovfathulla.uz still served; server 187.124.130.233).

Code lives in `web/` (the git root is one level up). Next.js 15 App Router + TypeScript + Tailwind v4 + Prisma 6 + PostgreSQL. UI languages EN/RU/UZ (Latin). The owner talks in short Russian messages; **reply in Russian**, keep answers short and concrete, say what you did and what you did not verify.

## Working rules (from the owner — follow them)
- **Never push to `master`.** Branch → commit → `git push -u origin <branch>` → `gh pr create --base master`. The owner merges; merge to `master` auto-deploys. Never merge for them.
- `git add` **explicit paths** only. Never commit `.claude/settings.local.json`, `.env*`, or anything named `id_*` / `*.pem` in the repo root (SSH keys sit there, untracked on purpose; do not read, print or use them).
- Commit/PR trailers: `Co-Authored-By: …` on commits, the "Generated with Claude Code" line on PRs (as the harness reminder says).
- **Secrets never go through chat or the repo.** Keys (SMTP, ORS, Telegram) go in `web/.env` (gitignored) locally and in `/var/www/karvon/.env` on the server — the owner edits the server file. If the owner pastes a secret, put it only in the local `.env`, never echo it, and suggest rotating it.
- Do not SSH to the server unless the owner says so; when they do, read-only checks only. Production changes happen through PR → merge → deploy.
- Other Claude tabs may work in the same repo at once: run `git status` before editing, do not touch uncommitted work you did not make, branch from fresh `origin/master`.
- Before claiming something works: unit tests, `tsc`, `eslint`, and for user-visible flows the e2e scenario (below). Report failures with the output; do not hide them.
- No scraping of gated sources (ATI, Lardi…). Real sources: DIIP.UZ public feed, Telegram groups the admins consented to, user posts, CSV. Seed/demo data is labelled DEMO everywhere.

## Commands (run in `web/`)
```
npm run typecheck | npm run lint | npm test        # CI runs exactly these three
npx prisma migrate deploy && npx prisma generate   # after pulling/adding migrations
npm run dev                                         # http://localhost:3000
```
Windows/Git Bash quirks: Node is not on PATH in Git Bash → `export PATH="/c/Program Files/nodejs:$PATH"`. Use `MSYS_NO_PATHCONV=1` for node scripts with `/`-leading args. Never run `next dev` and `next build/start` on the same `.next`. Scripts that import `server-only` modules under tsx need `npx tsx --conditions=react-server --env-file=.env file.ts`. Write Python/TS edit scripts to a file (or use the Edit tool): a Bash heredoc turns `\n` escapes inside strings into real newlines and breaks the script.

## Where things live (`web/src`)
| Area | Path | Notes |
|---|---|---|
| Pages | `app/` (public: `page.tsx`, `catalog`, `routes`, `load/[id]`, `about`; cabinet: `app/app/*` — `loads`, `post`, `my-loads`, `fleet`, `calculator`, `analytics`, `brokers`, `saved`, `notifications`, `assistant`, `settings`, `admin`) | server components; client parts in `components/` |
| API | `app/api/**/route.ts` | always via `api()` / `serviceApi()` from `server/http.ts` (session, permission, rate limit, error mapping) |
| Domain (pure, unit-tested) | `server/domain/` | `geo.ts` cities/distances, `fit.ts` truck↔cargo fit + size parsing, `borders.ts` corridors/border time, `hos.ts` driver hours, `route-profile.ts` routing helpers, `enums.ts`, `currency.ts` |
| Services | `server/services/` | `matching.ts` (9-component score, blockers), `freight.ts` (search/rank/detail), `filters.ts` (board filters, URL⇄object), `profitability.ts`, `routing.ts` (OpenRouteService + `RouteCache`), `payments.ts`/`payment-rules.ts`, `tracking*.ts`, `verification.ts`, `notify-user.ts` (in-app + Telegram + e-mail), `email.ts`, `telegram.ts`, `contacts.ts`, `grade.ts`, `backhaul.ts` |
| Ingestion | `server/ingestion/` | adapters → `normalize.ts` → quality → `dedupe.ts` → `pipeline.ts` (reposts merged, stale offers expire); free-text ad parser `textparse.ts` |
| Jobs | `server/jobs/` | scheduler started by `instrumentation.ts` when `JOBS_ENABLED=1`; ticks call `POST /api/jobs/run` (needs `JOBS_SECRET`). Jobs: sync-sources, expire-offers, saved-search-alerts, refresh-fx, health-check, merge-reposts, purge-old-offers, payment-reminders |
| Auth | `server/auth/` | JWT cookie session; `can(session, action)` in `permissions.ts` (`truck:write`, `trip:assign`, `settings:write`, `platform:admin`, …) |
| i18n | `i18n/` | see rules below |
| Telegram listener | `web/scripts/telegram-listener/` | Python Telethon listener; runs on the server (instances 1 & 2 live; instance 3 needs the owner's interactive login) |

## Trip and load lifecycle (don't break it)
Offer `ACTIVE → BOOKED` (claimed atomically in `assign`: two carriers can't both take it) → trip `PLANNED → IN_TRANSIT → COMPLETED / CANCELLED`. Payment: `UNPAID → SHIPPER_PAID → CONFIRMED / DISPUTED`; "paid on time" feeds broker reliability. Shipper side: `my-loads`; admin moderation (company verification queue, companies, posted loads) under `app/app/admin`.

## Conventions and rules that bite
- **i18n:** `src/i18n/messages/en.ts` is the source; `ru.ts` and `uz.ts` must have the same keys (compile error otherwise). New namespaces go before `  enums: {`. Server: `const { t } = await getI18n()`; client: `useI18n()`. **Every message an API can throw (`new HttpError(status, "English text")`) needs a template in the `errors` namespace in all 3 languages** — `tests/i18n.test.ts` scans for it. zod `.refine` messages are not translated.
- **Prisma:** additive migrations only, folder `prisma/migrations/<timestamp>_name/migration.sql`; deploy takes a DB backup then runs `migrate deploy` with the new image before switching. Enums are strings validated with zod. A running dev server keeps a stale Prisma client.
- Money (scores, distances, costs, profit) is **never** computed by an LLM — deterministic code only.
- A `"use client"` file's exports can't be *called* from a server component (it renders a crash page that still returns HTTP 200). Shared helpers go in plain modules (e.g. `lib/truck-passport.ts`).
- Edge bundle: don't import Node-only modules (`node:crypto`, nodemailer) from code reachable by middleware/instrumentation; scheduler import sits inside `if (process.env.NEXT_RUNTIME === "nodejs")`. Use Web Crypto.
- Heavy matching runs over thousands of offers × trucks: keep per-pair work cheap, no I/O in `scoreMatch`. Routing is only fetched for single-load views (`legsFor`, `waitMs: 3000`), never per list row.
- **Speed rules (measured, 2026-10-22):** `scoreMatch` with real text costs ~140 µs a pair, `lite` ~4 µs. Rank/count thousands of pairs with `ctx.lite = true` (numbers only, same scores), then re-score only the rows shown without it. Shared, slowly-changing reads go through `server/cache.ts` (`memoize`/`ttlMemo`/`boundedMemo`, a few seconds, state on `globalThis`); **every write path must call `invalidateMarketCache()`**, which clears them. Never pass the board's explanation arrays or the map's `all` list to client components unless needed.
- **Stale and taken loads:** a load not confirmed by any source for 6 h (`STALE_AFTER_MS`) is left out of the board, catalog, dashboard and matching (`freshOfferFilter` in `domain/freshness.ts`; loads posted on Karvon and demo data are exempt; `stale=1` shows them). Telegram "this load is gone" signals (deleted ad, edited to "closed", a "взяли" reply) arrive at `/api/ingest/telegram` as `closure` payloads and remove the listing (`ingestion/closure.ts`); the listener only sends them when `TRACK_CLOSURES=1` is set in its `.env`.
- `unstable_cache` fails outside a request; jobs run inside `/api/jobs/run` for that reason.
- Rate limits: signup 5/min/IP, posting a load 10/min/user — they matter when re-running scripts.
- Passwords: seed accounts `demo@karvon.uz`, `dispatcher@karvon.uz` (demo1234), `admin@karvon.uz` (admin1234 — **still the default on prod; change it**).

## Env variables (see `web/.env.example`, README table)
`DATABASE_URL`, `AUTH_SECRET`, `JOBS_ENABLED`/`JOBS_SECRET`, `SMTP_URL` (+`EMAIL_FROM`, `APP_URL`; `file:` outbox for dev), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_INGEST_SECRET`, `ORS_API_KEY` (+`ORS_URL`, `ORS_DAILY_CAP`) for truck routing, `ANTHROPIC_API_KEY` optional, `HIDE_DEMO`, `DIIP_*`. Without `ORS_API_KEY` routing is simply off; without SMTP nothing is e-mailed.

## Testing — what "done" means
1. `npm run typecheck`, `npm run lint`, `npm test` (~145 unit tests in `tests/*.test.ts`, run with `tsx --test`).
2. **End-to-end scenario** `web/scripts/e2e/flow.py` (HTTP, ~170 checks: shipper posts, carrier takes, roles, trip, payments, reviews, e-mail draft, passport, routing, borders, driver hours, scope). It needs a **prod build** against the dev DB:
   - copy `web/` to `%TEMP%\karvon-e2e13` (robocopy excluding `node_modules`, `.next`, `.git`), junction `node_modules` (`cmd /c mklink /J`; remove with `cmd /c rmdir`, not Remove-Item), `npx next build`;
   - start `python web/scripts/e2e/mock_ors.py` (fake routing service on :3199) and the app with `ORS_API_KEY=test-key ORS_URL=http://127.0.0.1:3199/v2/directions/driving-hgv/geojson PORT=3101 npx next start -p 3101` (use `run_in_background`; a plain `&` dies with the tool call);
   - run `E2E_ORS_MOCK=http://127.0.0.1:3199 python flow.py` (copy it to `%TEMP%` first; wait ≥60 s between runs because of the signup rate limit; sleeps over ~45 s must be a background command);
   - afterwards stop :3101 and :3199 (check the port owner — stopping a task doesn't always kill the node child) and **clear mock rows from the dev `RouteCache`** (they collide with real routes of the same profile).
   - e2e checks must look at rendered markup (`>Title<`), not plain text: the page embeds the whole i18n dictionary, so any phrase "is in the page".
3. For UI claims, look at the real page; tests alone don't prove layout.

## Deploy
Merge to `master` → GitHub Actions `deploy-karvon.yml`: `check` (CI) then `deploy` over SSH to the server: `/var/www/karvon-src` (git) → rsync to `/var/www/karvon` (excludes `.env`, `data/`) → `docker compose build karvon-web` → DB backup → `prisma migrate deploy` → `docker compose up -d karvon-web`. Stack: Docker (`karvon-web`, `karvon-db`) behind a shared Caddy. `/api/health` shows scheduler state. A failed deploy step before the SSH command touches nothing; re-run the failed job (`gh run rerun <id> --failed`).

## Status (2026-10-22)
Done: study/DAT-style matching, scheduler/FX/CI/CD, landing, EN/RU/UZ, quality grade A–D, near-me + truck GPS, Telegram alerts + server-side listener, repost dedupe + stale cleanup, modal dialogs, contact e-mail → Gmail/Outlook compose with per-load enquiry and signature, full shipper↔carrier flow (take/cancel/start/complete/track/pay/review), admin moderation, My loads, e-mail notifications, payments, truck passport + cargo size + ADR fit checks (1A), truck routing via OpenRouteService with cache and route card (1B), profit on routed km (1C), border crossings (2.1), driver hours + crew (2.2), within-Uzbekistan/international choice (when posting; scope switch on the board). Diesel price by country (2.3, `FuelPrice` + Admin card). Page-change progress bar (`components/shell/route-progress.tsx`, click capture on in-app links, finishes when the URL changes). Chat about a load (`ChatThread`/`ChatMessage`, `server/services/chat.ts`, `/app/chats`, polling every 4 s; only for loads posted on Karvon — `postingOrgIds`; pinned load header opens `LoadDetailPanel`; unread badge in the top bar); load panel layout uses container queries (`@container`), so it adapts inside the split view. Board polish (`/app/loads`): 50 rows per page, numbered `Pagination`, results stream in `<Suspense key>` with a skeleton, toolbar navigations use `useTransition`, one list (table or cards) chosen by User-Agent, quick-take icon uses opacity (no hover shift). Performance pass (lite scoring, in-process caches, FK indexes): dashboard 451 → ~40 ms, board 391 → ~145 ms on the dev DB.
Open PRs at the time of writing may include the CI keyscan retry; check `gh pr list`.

Next (see `web/docs/ROADMAP.md`): stage 3 trust (company check by tax ID, shipper rates carrier, cancellation rate, trip documents), stage 4 reach (Telegram live location, PWA/push, change/forgot password, restore ~3,100 hidden loads by re-parse, in-platform payments, empty-return chains), stage 5 platform (public API, plans/billing, trend analytics). Border hour ranges and fees in `domain/borders.ts` are the assistant's planning estimates awaiting the owner's corrections.

Owner-side blockers (not code): SMTP + `APP_URL` in the server `.env` then "Send a test e-mail to me" in Admin → Overview; third Telegram account login on the server; rotate admin/root passwords; ORS key rotation (it was pasted in chat once).

## Updating this file
When you finish a feature, add one line to Status and any new gotcha to the rules above. Keep it short: this file is read at the start of every session, so every line costs tokens everywhere.
