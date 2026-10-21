"""Pure helpers for noticing that a forwarded ad is gone (deleted, edited to "taken", or answered with "взяли").

Kept free of Telegram/network imports so it can be tested on its own: `python -m unittest test_closure_tracking`.
State shape (inside the listener's state.json): tracked[group_key][str(message_id)] = {"t": posted_at_ts, "e": last_seen_edit_ts}
"""

from __future__ import annotations

import time


def track(tracked: dict, group_key: str, message_id: int, posted_ts: float, edit_ts: float = 0.0, *, keep_hours: float = 48, cap: int = 120, now: float | None = None) -> None:
    """Remember a forwarded ad (so it can be re-checked later) and forget the old ones."""
    now = time.time() if now is None else now
    g = tracked.setdefault(group_key, {})
    g[str(message_id)] = {"t": posted_ts, "e": edit_ts}
    prune(tracked, group_key, keep_hours=keep_hours, cap=cap, now=now)


def prune(tracked: dict, group_key: str, *, keep_hours: float = 48, cap: int = 120, now: float | None = None) -> None:
    now = time.time() if now is None else now
    g = tracked.get(group_key)
    if not g:
        return
    cutoff = now - keep_hours * 3600
    for mid in [m for m, v in g.items() if v.get("t", 0) < cutoff]:
        del g[mid]
    if len(g) > cap:  # keep the newest `cap`
        for mid in sorted(g, key=lambda m: g[m].get("t", 0))[: len(g) - cap]:
            del g[mid]
    if not g:
        del tracked[group_key]


def is_tracked(tracked: dict, group_key: str, message_id: int) -> bool:
    return str(message_id) in tracked.get(group_key, {})


def untrack(tracked: dict, group_key: str, message_id: int) -> None:
    g = tracked.get(group_key)
    if g:
        g.pop(str(message_id), None)
        if not g:
            del tracked[group_key]


def recheck_due(state_checked: dict, group_key: str, *, every_min: float = 20, now: float | None = None) -> bool:
    """True when this group's tracked ads have not been re-checked for `every_min` minutes."""
    now = time.time() if now is None else now
    return now - state_checked.get(group_key, 0) >= every_min * 60


def classify(message_id: int, message, known_edit_ts: float) -> tuple[str, str | None]:
    """What a re-fetched message tells us. Returns (verdict, text): verdict is "deleted", "edited" or "same".

    `message` is what Telethon returns for the id: None or an empty message when it was deleted.
    """
    if message is None or message.__class__.__name__ in ("MessageEmpty",) or not getattr(message, "date", None):
        return "deleted", None
    edit = getattr(message, "edit_date", None)
    edit_ts = edit.timestamp() if edit else 0.0
    if edit_ts and edit_ts > known_edit_ts:
        return "edited", getattr(message, "message", "") or ""
    return "same", None
