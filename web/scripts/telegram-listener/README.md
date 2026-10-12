# Karvon Telegram listener

Turns freight ads posted in Telegram groups into loads in Karvon — automatically, continuously,
without ever sending a message or joining a group. See the docstring at the top of
`listener.py` for the full picture; this file is the quick version.

## Before you run this

- **Only groups where the admin actually agreed to this get read.** That's what `enabled=1` in
  `../../data/telegram_groups.csv` means. Don't flip a row to `1` without that conversation
  having happened — if an admin's answer was unclear or you're not sure, leave it `0`.
- **Use a dedicated account**, not your daily driver.
- **This reads messages, it never sends any, and it never joins.** A group with a public
  `@username` can have its message history read without being a member — the same mechanism
  that makes `t.me/<username>` show a preview in a browser with no login. That's what this
  script uses. No `JoinChannelRequest` anywhere in the code.
- **Phone numbers in ads are only shown to signed-in Karvon users**, same as every other source
  — this matches how the app already handles contact info, and it's consistent with why people
  post a phone number in a cargo ad in the first place (to be contacted about that cargo).

## Setup

```bash
cd scripts/telegram-listener
python -m venv .venv
.venv\Scripts\activate          # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
copy .env.example .env          # Windows; `cp` elsewhere
```

Fill in `.env`:

1. `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` — from <https://my.telegram.org> → **API development
   tools**, logged in with the account you're dedicating to this.
2. `KARVON_INGEST_SECRET` — copy the `TELEGRAM_INGEST_SECRET` value from `web/.env`. It must
   match exactly, or the server rejects every request with 401.
3. `KARVON_URL` — `http://localhost:3000` for local dev, or your deployed URL.

Then:

```bash
python listener.py
```

The first run asks for your phone number and the login code Telegram texts you — interactive,
once. After that it reuses the saved session file automatically.

## What happens when it runs

1. **Polls every enabled group on a cycle** (`POLL_INTERVAL_MIN`, default 5 minutes): for each
   one it asks Telegram "what's new since the last message I saw?" (`min_id`-based), with a
   short pause between groups (`PER_GROUP_DELAY_S`, default 2 s) so it isn't hammering Telegram
   with 290 requests back to back. A full pass over ~290 groups takes on the order of 10 minutes,
   not days — reading history is a much lower-risk action than joining, so it doesn't need the
   same heavy pacing joining would.
2. **The very first time it polls a group**, there's no "last message" to compare against, so it
   pulls the most recent `BACKFILL_MESSAGES` (default 30) instead of starting from nothing —
   real data shows up immediately rather than only once someone posts something new.
3. Each message that looks like an ad (long enough, has a digit) gets posted to
   `POST /api/ingest/telegram` on your Karvon server. Karvon parses it (route, weight, body
   type, date, rate, phone), checks quality, deduplicates against every other source, and — if
   it parsed — the load shows up in the catalog with its own source card (`Telegram: <group
   name>`) linking back to the original message.
4. Progress (`cursor`, per-group last message id) is saved to `state.json` after every group, so
   stopping and restarting picks up where it left off instead of re-reading everything.

Ads the parser can't understand (no recognizable origin/destination, mostly) are silently
skipped — nothing is guessed. Check `listener.log` for a running account of what was sent,
matched, or failed, and the **Admin → Freight sources** panel in Karvon for per-group health
(each group becomes its own source, prefixed `tg-`).

## A group that can't be read

Despite having a public `@username`, a small number of groups restrict reading to members only.
When that happens the listener logs it once, records it in `state.json` under `"unreadable"`,
and excludes that group going forward — it does **not** auto-join it. If you want that
particular group badly enough to join it by hand with your Telegram app, do that, then remove
its entry from `"unreadable"` in `state.json` so the listener picks it up again.

## Running more than one account at once

Each account needs its own `.env.N` file (copy `.env.2.example` / `.env.3.example`, or make a
new one the same way for a 4th+), its own Telethon session, and its own state/log files. Each
instance's `.env.N` needs, besides its own credentials: a `TELEGRAM_SESSION_NAME` and
`STATE_FILE`/`LOG_FILE` that no other instance uses, and a `SHARD` of the form `i/N` (instance
0, 1, 2, ... of N total) so the group list is split between them instead of every instance
reading every group. **All running instances must share the same `N`** — if one is still set to
`0/2` while another is `2/3`, the split doesn't line up and some groups get read twice. If you
add or remove an instance, update `SHARD` in every `.env*` file at once, including ones that are
mid-run (just restart them — their progress is saved in their own `STATE_FILE`, nothing is
lost), or the next pass can double-read a few groups (harmless — dedup still applies — but
pointless extra load).

There are two ways to actually run the instances day to day: a supervised background setup
(recommended) and manual per-terminal (fallback/debugging). Both use the same `.env`/`.env.2`/
`.env.3` files and the same `python listener.py` underneath — they're just different ways of
starting it.

### Recommended: supervised, auto-restarting, background

`supervisor.ps1` starts all 3 instances (`.env`, `.env.2`, `.env.3`) as background processes,
watches them, and relaunches any instance that exits unexpectedly after a 30-second backoff (so
a crash doesn't turn into a crash-restart-crash loop hammering Telegram). It writes its own log
(`supervisor.log`) and a safety-net stdout/stderr capture per instance
(`crash-logs\<A|B|C>.std{out,err}.log`) for the rare case of a Python-level crash that happens
before `listener.py`'s own logging is even set up — day-to-day health still lives in
`listener.log` / `listener_2.log` / `listener_3.log` and the Admin → Freight sources panel, same
as always.

**Day-to-day start** (after a reboot, or any time you want it running): double-click
`start-background.bat` in this folder. It launches the supervisor completely hidden — no window
to leave open, closing Explorer doesn't stop it.

**Fully automatic, no double-click at all:** run this once —

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-autostart.ps1
```

— to register a Windows Task Scheduler task that starts the supervisor at every logon from then
on. Remove it later with `.\uninstall-autostart.ps1`. This is opt-in (it touches Task Scheduler)
rather than the default, since `start-background.bat` is enough for most people.

**Stopping:** run `stop-all.ps1` (or double-click `stop-all.bat`). It stops the supervisor first
(so it doesn't try to resurrect an instance you're deliberately stopping) and then each instance,
by PID (recorded in `supervisor.pids.json`) rather than by process name — `python.exe` might be
used by other things on this machine, so this only ever touches the processes it actually
started. It hard-kills (`Stop-Process -Force`) rather than asking nicely, which is fine here:
`listener.py` saves `state.json`/`state_2.json`/`state_3.json` after every single group it
polls, so the worst case is re-polling the one group an instance was mid-poll on — harmless,
dedup still applies.

**Checking health:** `Get-Content supervisor.log -Tail 20` shows recent starts/restarts;
`Get-Content supervisor.pids.json` shows which PIDs are currently tracked; the per-instance
`listener*.log` files are still the real source of truth for what's actually being sent/matched.

### Fallback/debugging: manual, one terminal per account

Useful for watching an instance's output live, or for debugging — and **required** the first
time a brand-new account is added (see below). A terminal per account, each picking its config
file via an environment variable before launching:

```powershell
# Terminal 1 (uses .env — unchanged)
.\.venv\Scripts\python.exe listener.py

# Terminal 2 (uses .env.2 — a different account, session, state file, and SHARD)
$env:ENV_FILE = ".env.2"              # or .env.3, etc.
.\.venv\Scripts\python.exe listener.py
```

Stop with Ctrl+C in each terminal (handled gracefully — it finishes cleaning up the current
request and disconnects before exiting).

### First-time setup of a new account

The supervisor **cannot** handle a brand-new account's first login — Telethon asks interactively
for a phone number and the login code Telegram texts you, which needs a visible terminal to type
into. So, to add a 4th (or replace an existing) account:

1. Create its `.env.N` (copy an existing `.env.N.example`), with a unique `TELEGRAM_SESSION_NAME`,
   `STATE_FILE`, `LOG_FILE`, and the updated `SHARD=i/N` for the new total `N` — and update
   `SHARD` in every other `.env*` file to match the new `N`.
2. Run it manually once, in a visible terminal, the normal fallback way above (`$env:ENV_FILE =
   ".env.4"; .\.venv\Scripts\python.exe listener.py`), answer the phone/code prompts, confirm it
   logs in and starts polling, then Ctrl+C it. This creates its `.session` file.
3. Only now add it to `$Instances` in `supervisor.ps1` (same pattern as the existing 3 entries)
   and restart the supervisor (`stop-all.ps1` then `start-background.bat`) — from here on it
   starts non-interactively like the others, because the session file already exists.

When Telethon asks for a phone number on a new instance's first run, use an account it hasn't
seen before. Typing a number you've already used elsewhere just reconnects to that same
(possibly already-restricted) account under a new label.

## Turning a group off

Set its `enabled` to `0` in `../../data/telegram_groups.csv` (keep the row; it just stops being
polled starting from the listener's next pass — it does not delete loads already ingested from
it).

## Troubleshooting

- **`FloodWaitError` in the log, short one** — the listener waits exactly as long as asked, then
  continues with the next group. Normal, happens occasionally, not a problem.
- **`FloodWaitError` in the log, long one (logged as "pausing the whole pass")** — rare for
  reading (common for *joining*, which this script doesn't do). All polling pauses until the
  time in `state.json`'s `flood_wait_until` passes, then resumes on its own.
