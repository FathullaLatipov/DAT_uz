"""
Karvon Telegram listener (polling, no joining).

Runs under YOUR OWN Telegram account (the "clean" one), on your own machine. For every group
in groups.csv marked enabled=1, it periodically asks Telegram "what's new since last time?" and
forwards anything that looks like a freight ad to Karvon's /api/ingest/telegram endpoint, which
parses, normalizes, checks quality and deduplicates it exactly like every other source.

Why no joining: a group with a public @username (every row in groups.csv) can have its message
history read by any Telegram account without being a member — the same mechanism that makes
t.me/<username> show a preview in a browser with no login at all. Telegram's aggressive
anti-spam limits (the ~22-hour FloodWaitError seen in testing) are specifically about *joining*
lots of chats quickly, which looks like account farming — not about *reading* public content,
which is a normal, low-signal action. Dropping the join step removes that risk entirely and
also means there's no slow multi-day trickle before everything is being watched: a full pass
over ~290 groups takes on the order of minutes, not days.

The trade-off versus the old join-and-listen design is latency, not coverage: new ads show up
within one polling cycle (a few minutes), not instantly. For a freight board that's a non-issue.
A handful of groups may still require actual membership to read (some communities lock reading
to members despite having a public username) — those get flagged once in the log and in
state.json under "unreadable" and are skipped from then on; nothing auto-joins them.

Setup: see README.md. In short — fill in .env (same as before), then:

    python listener.py

First run asks for your phone number and the login code Telegram sends you (interactive, once)
— the session is then saved to karvon_listener.session and reused.

Running two accounts at once (two terminals): each instance needs its own account, its own
Telethon session, and its own state file, or they'll corrupt each other. Set ENV_FILE before
running to point at a second config (see .env.2.example) instead of editing the shared .env:

    # Terminal 1 (uses .env — unchanged)
    python listener.py

    # Terminal 2 (uses .env.2 — a different account, session, state file, and SHARD)
    $env:ENV_FILE = ".env.2"            # PowerShell; `export ENV_FILE=.env.2` elsewhere
    python listener.py

.env.2 should set SHARD=1/2 (and .env's SHARD=0/2, or leave it unset — unset means "0/1", i.e.
"the only instance") so the two split the group list deterministically instead of both reading
every group — see SHARD below.
"""

from __future__ import annotations

import asyncio
import csv
import hashlib
import json
import logging
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import (
    ChannelPrivateError,
    ChatAdminRequiredError,
    FloodWaitError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
)

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import closure_tracking as ct  # noqa: E402 - needs HERE on the path first
# Lets a second (third, ...) instance run from the same folder against a different account:
#   $env:ENV_FILE = ".env.2"; python listener.py
load_dotenv(HERE / os.environ.get("ENV_FILE", ".env"))

INSTANCE = os.environ.get("ENV_FILE", ".env").replace(".env", "").strip(".") or "default"

logging.basicConfig(
    level=logging.INFO,
    format=f"%(asctime)s %(levelname)-7s [{INSTANCE}] %(message)s",
    handlers=[logging.FileHandler(HERE / os.environ.get("LOG_FILE", "listener.log"), encoding="utf-8"), logging.StreamHandler()],
)
log = logging.getLogger("karvon")

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = str(HERE / os.environ.get("TELEGRAM_SESSION_NAME", "karvon_listener"))

KARVON_URL = os.environ.get("KARVON_URL", "http://localhost:3000").rstrip("/")
KARVON_SECRET = os.environ["KARVON_INGEST_SECRET"]
INGEST_ENDPOINT = f"{KARVON_URL}/api/ingest/telegram"

DEFAULT_GROUPS_CSV = HERE.parent.parent / "data" / "telegram_groups.csv"  # single source of truth
GROUPS_CSV = Path(os.environ.get("GROUPS_CSV", DEFAULT_GROUPS_CSV))
STATE_FILE = HERE / os.environ.get("STATE_FILE", "state.json")

# "i/n" (e.g. "1/2") splits the group list deterministically across n instances by a stable hash
# of each group's username, so running two accounts in parallel doesn't have them both poll the
# same 291 groups. Leave unset (equivalent to "0/1") for a single instance that handles all of
# them. The split is stable across restarts — it doesn't depend on dict/set ordering or a
# per-process random seed.
_shard_raw = os.environ.get("SHARD", "0/1")
SHARD_INDEX, SHARD_COUNT = (int(x) for x in _shard_raw.split("/"))


def in_shard(username: str) -> bool:
    if SHARD_COUNT <= 1:
        return True
    digest = hashlib.md5(username.lower().encode()).hexdigest()
    return int(digest, 16) % SHARD_COUNT == SHARD_INDEX

# Pacing. Reading public channel history is far less sensitive than joining, so this can be much
# faster than the old join-trickle — but it's still many requests to Telegram in a row, so a
# small per-group pause is good manners and keeps a FloodWaitError, if one ever happens, short.
PER_GROUP_DELAY_S = float(os.environ.get("PER_GROUP_DELAY_S", "2.0"))
POLL_INTERVAL_MIN = float(os.environ.get("POLL_INTERVAL_MIN", "5"))
# On a group's very first poll ever, pull its last N messages instead of starting from nothing —
# gives real data immediately instead of waiting for the next ad to be posted.
BACKFILL_MESSAGES = int(os.environ.get("BACKFILL_MESSAGES", "30"))
MAX_MESSAGES_PER_POLL = int(os.environ.get("MAX_MESSAGES_PER_POLL", "200"))
# A FloodWaitError shorter than this is just Telegram asking for a breather on one call — honor
# it inline. Longer than this signals a broader restriction — pause the whole pass instead of
# blocking on it (mirrors how joining handled it, just with a much lower bar in practice).
LONG_FLOOD_WAIT_S = 600

# Noticing that an ad is gone (off by default; set TRACK_CLOSURES=1 in .env to turn it on). For every ad Karvon accepted,
# the listener remembers its message id for TRACK_HOURS and, at most every RECHECK_MIN minutes per group, asks Telegram
# whether it was deleted or edited; replies like "взяли" under a tracked ad are noticed on the normal poll. Karvon decides
# from the text whether it really means "taken" and takes the load off the board.
TRACK_CLOSURES = os.environ.get("TRACK_CLOSURES", "0") == "1"
TRACK_HOURS = float(os.environ.get("TRACK_HOURS", "48"))
RECHECK_MIN = float(os.environ.get("RECHECK_MIN", "20"))

MIN_LEN = 8
MAX_LEN = 4000


@dataclass
class GroupRow:
    username: str
    name: str
    members: int | None
    enabled: bool


def load_groups() -> dict[str, GroupRow]:
    rows: dict[str, GroupRow] = {}
    with GROUPS_CSV.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            u = (r.get("username") or "").strip().lstrip("@")
            if not u:
                continue
            members = int(r["members"]) if (r.get("members") or "").strip().isdigit() else None
            enabled = (r.get("enabled") or "").strip() == "1" and in_shard(u)
            rows[u.lower()] = GroupRow(username=u, name=(r.get("name") or u).strip(), members=members, enabled=enabled)
    return rows


def load_state() -> dict:
    if STATE_FILE.exists():
        s = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        s.setdefault("cursor", {})
        s.setdefault("unreadable", {})
        s.setdefault("tracked", {})
        s.setdefault("checked", {})
        return s
    return {"cursor": {}, "unreadable": {}, "tracked": {}, "checked": {}}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def looks_like_ad(text: str) -> bool:
    """Cheap pre-filter: a freight ad almost always has a digit (weight/date/price)."""
    t = text.strip()
    return MIN_LEN <= len(t) <= MAX_LEN and any(ch.isdigit() for ch in t)


class Forwarder:
    """Owns the HTTP session and posts ads to Karvon without blocking the event loop."""

    def __init__(self) -> None:
        self.session: aiohttp.ClientSession | None = None
        self.sent = 0
        self.matched = 0
        self.failed = 0

    async def start(self) -> None:
        self.session = aiohttp.ClientSession(headers={"x-ingest-secret": KARVON_SECRET, "Content-Type": "application/json"}, timeout=aiohttp.ClientTimeout(total=15))

    async def stop(self) -> None:
        if self.session:
            await self.session.close()

    async def send(self, group: GroupRow, message_id: int, text: str, posted_at_iso: str) -> bool:
        """True when Karvon accepted the message as a freight ad (it then has a listing that can later be closed)."""
        payload = {"groupUsername": group.username, "groupName": group.name, "groupMembers": group.members, "messageId": message_id, "text": text, "postedAt": posted_at_iso}
        try:
            assert self.session
            async with self.session.post(INGEST_ENDPOINT, json=payload) as resp:
                self.sent += 1
                if resp.status != 200:
                    self.failed += 1
                    body = await resp.text()
                    log.warning("ingest %s -> HTTP %s: %s", group.username, resp.status, body[:200])
                    return False
                data = await resp.json()
                if data.get("matched"):
                    self.matched += 1
                    log.info("+ %s #%s -> offer %s (%s)", group.username, message_id, data.get("offerId"), data.get("outcome"))
                    return True
        except Exception as e:  # noqa: BLE001 - never let a network hiccup kill the poller
            self.failed += 1
            log.warning("ingest %s failed: %s", group.username, e)
        return False

    async def close(self, group: GroupRow, message_id: int, how: str, text: str | None = None) -> bool:
        """Tells Karvon an ad is gone (how = deleted | edited | reply). True when it took a load off the board."""
        payload = {"groupUsername": group.username, "messageId": message_id, "closure": how}
        if text:
            payload["text"] = text[:4000]
        try:
            assert self.session
            async with self.session.post(INGEST_ENDPOINT, json=payload) as resp:
                if resp.status != 200:
                    log.warning("closure %s #%s -> HTTP %s", group.username, message_id, resp.status)
                    return False
                data = await resp.json()
                if data.get("closed"):
                    log.info("- %s #%s closed (%s) -> offer %s%s", group.username, message_id, how, data.get("offerId"), " expired" if data.get("offerExpired") else " (still listed elsewhere)")
                return bool(data.get("closed"))
        except Exception as e:  # noqa: BLE001 - never let a network hiccup kill the poller
            log.warning("closure %s #%s failed: %s", group.username, message_id, e)
            return False


async def poll_group(client: TelegramClient, fwd: Forwarder, g: GroupRow, state: dict) -> bool | None:
    """Returns True if this group needs a longer, whole-pass pause (a big flood wait hit)."""
    key = g.username.lower()

    async def handle_flood(e: FloodWaitError, where: str) -> bool:
        """True = caller should abort the whole pass; False = caller may retry this group now."""
        if e.seconds > LONG_FLOOD_WAIT_S:
            state["flood_wait_until"] = time.time() + e.seconds
            log.warning("long flood wait on @%s (%s): %ss (%.1fh) — pausing the whole pass", g.username, where, e.seconds, e.seconds / 3600)
            return True
        log.info("short flood wait on @%s (%s): %ss — honoring it and continuing", g.username, where, e.seconds)
        await asyncio.sleep(e.seconds + 1)
        return False

    try:
        entity = await client.get_entity(g.username)
    except FloodWaitError as e:
        return await handle_flood(e, "resolve") or None
    except (UsernameInvalidError, UsernameNotOccupiedError, ValueError) as e:
        state["unreadable"][key] = {"reason": type(e).__name__, "at": time.time()}
        log.warning("@%s is not a resolvable public group — excluding it from now on", g.username)
        return None

    cursor = state["cursor"].get(key)
    messages = []
    try:
        if cursor is None:
            async for m in client.iter_messages(entity, limit=BACKFILL_MESSAGES):
                if m.message:
                    messages.append(m)
            messages.reverse()  # oldest first, for a sane/consistent send order
        else:
            async for m in client.iter_messages(entity, min_id=cursor["last_id"], reverse=True, limit=MAX_MESSAGES_PER_POLL):
                if m.message:
                    messages.append(m)
    except FloodWaitError as e:
        return await handle_flood(e, "read") or None
    except (ChannelPrivateError, ChatAdminRequiredError) as e:
        state["unreadable"][key] = {"reason": type(e).__name__, "at": time.time()}
        log.info("@%s requires membership to read — excluding it (not auto-joining)", g.username)
        return None
    except Exception as e:  # noqa: BLE001 - one bad group must not stop the whole pass
        log.warning("couldn't read @%s: %s: %s", g.username, type(e).__name__, e)
        return None

    if messages:
        state["cursor"][key] = {"last_id": max(m.id for m in messages), "name": g.name}
    elif cursor is None:
        state["cursor"][key] = {"last_id": 0, "name": g.name}

    for m in messages:
        text = m.message or ""
        # Someone answering a tracked ad ("взяли", "занято") — checked before the ad filter: such a reply has no digits.
        reply_to = getattr(m, "reply_to_msg_id", None)
        if TRACK_CLOSURES and reply_to and ct.is_tracked(state["tracked"], key, reply_to) and 3 <= len(text) <= 400:
            if await fwd.close(g, reply_to, "reply", text):
                ct.untrack(state["tracked"], key, reply_to)
            continue
        if not looks_like_ad(text):
            continue
        matched = await fwd.send(g, m.id, text, m.date.isoformat())
        if TRACK_CLOSURES and matched:
            edit = getattr(m, "edit_date", None)
            ct.track(state["tracked"], key, m.id, m.date.timestamp(), edit.timestamp() if edit else 0.0, keep_hours=TRACK_HOURS)
        # A backfill can contain dozens of ad-like messages for one group — a tiny gap keeps
        # this from bursting the Karvon server with 20-30 requests in the same instant.
        await asyncio.sleep(0.15)
    if TRACK_CLOSURES:
        await recheck_tracked(client, fwd, g, entity, state, key)
    return None


async def recheck_tracked(client: TelegramClient, fwd: Forwarder, g: GroupRow, entity, state: dict, key: str) -> None:
    """Asks Telegram whether the ads we forwarded from this group are still there and unedited."""
    ct.prune(state["tracked"], key, keep_hours=TRACK_HOURS)
    ids = [int(i) for i in state["tracked"].get(key, {})]
    if not ids or not ct.recheck_due(state["checked"], key, every_min=RECHECK_MIN):
        return
    state["checked"][key] = time.time()
    try:
        found = await client.get_messages(entity, ids=ids)
    except FloodWaitError as e:
        log.info("flood wait while re-checking @%s: %ss — will try again next pass", g.username, e.seconds)
        return
    except Exception as e:  # noqa: BLE001 - a failed re-check must never stop the poller
        log.warning("couldn't re-check @%s: %s: %s", g.username, type(e).__name__, e)
        return
    for mid, msg in zip(ids, found):
        entry = state["tracked"][key].get(str(mid))
        if not entry:
            continue
        verdict, text = ct.classify(mid, msg, entry.get("e", 0.0))
        if verdict == "deleted":
            await fwd.close(g, mid, "deleted")
            ct.untrack(state["tracked"], key, mid)
        elif verdict == "edited":
            entry["e"] = msg.edit_date.timestamp()
            if await fwd.close(g, mid, "edited", text):
                ct.untrack(state["tracked"], key, mid)
        await asyncio.sleep(0.15)


async def poll_loop(client: TelegramClient, groups: dict[str, GroupRow], state: dict, fwd: Forwarder) -> None:
    while True:
        wait_until = state.get("flood_wait_until", 0)
        if wait_until > time.time():
            log.info("flood wait in effect — skipping this pass for ~%.1fh", (wait_until - time.time()) / 3600)
            await asyncio.sleep(POLL_INTERVAL_MIN * 60)
            continue
        if "flood_wait_until" in state:
            del state["flood_wait_until"]

        pending = [g for u, g in groups.items() if g.enabled and u not in state["unreadable"]]
        random.shuffle(pending)
        log.info("polling %d group(s)", len(pending))
        for g in pending:
            paused = await poll_group(client, fwd, g, state)
            save_state(state)
            if paused:
                break
            await asyncio.sleep(PER_GROUP_DELAY_S)

        unreadable_n = len(state["unreadable"])
        log.info("pass done — sent=%d matched=%d failed=%d (%d group(s) excluded as unreadable)", fwd.sent, fwd.matched, fwd.failed, unreadable_n)
        await asyncio.sleep(POLL_INTERVAL_MIN * 60)


async def main() -> None:
    groups = load_groups()
    enabled = [g for g in groups.values() if g.enabled]
    log.info("loaded %d groups from %s (%d enabled)", len(groups), GROUPS_CSV, len(enabled))
    if not enabled:
        log.error("no groups are enabled=1 in %s — nothing to do", GROUPS_CSV)
        return

    state = load_state()
    fwd = Forwarder()
    await fwd.start()

    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()  # interactive phone/code prompt on first run only
    me = await client.get_me()
    log.info("logged in as %s (id=%s)", getattr(me, "username", None) or me.first_name, me.id)

    try:
        await poll_loop(client, groups, state, fwd)
    finally:
        await fwd.stop()
        await client.disconnect()
        log.info("stopped — sent=%d matched=%d failed=%d", fwd.sent, fwd.matched, fwd.failed)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
