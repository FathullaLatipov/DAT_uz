# Moving the listener to Ubuntu

**Scripted:** `./deploy/cutover.sh <user>@<host> [ssh-key]` (Git Bash, from `scripts/telegram-listener`) does the steps below end to end and stops at the first instance that does not log in with its transferred session. The manual procedure follows for reference.

(Original status: prepared plan, not yet executed.)

Today the listener runs as 3 processes on a Windows machine (`supervisor.ps1`), which means
ingestion stops whenever that machine is off or asleep. This makes it a systemd-managed service
on the same Ubuntu box that already runs `karvon-web`/`karvon-db`, isolated from both.

**Nothing in this file has been run.** It's the prepared procedure, for review before the actual
cutover is authorized.

## Why not a container

Every other service on this box is Dockerized, but Telethon's `.session` file is tied to a real,
already-authenticated Telegram login — recreating that inside a fresh container means either (a)
copying a live credential into an image layer (bad) or (b) a bind-mounted volume anyway, which
gets you none of Docker's isolation benefit over a plain systemd unit with its own hardening
(`ProtectSystem=strict`, `NoNewPrivileges`, a dedicated unprivileged user). A native service is
simpler and just as isolated here.

## One-time setup (run once, by a human, not scripted end-to-end on purpose —
## the session-file transfer step below needs a judgment call each time)

```bash
# 1. Dedicated, unprivileged service account — this process never needs root or any other
#    project's files.
sudo useradd --system --home-dir /opt/karvon-listener --shell /usr/sbin/nologin karvon-listener

# 2. Code + venv (same Python script already running on Windows, unmodified — it's already
#    cross-platform; it only shells out to python/pip, nothing OS-specific).
sudo mkdir -p /opt/karvon-listener
sudo rsync -a --exclude='.venv' --exclude='*.session*' --exclude='state*.json' --exclude='*.log' \
  ./scripts/telegram-listener/ /opt/karvon-listener/
cd /opt/karvon-listener
sudo -u karvon-listener python3 -m venv .venv
sudo -u karvon-listener .venv/bin/pip install -r requirements.txt

# 3. .env.1 / .env.2 / .env.3 (same values as the Windows .env/.env.2/.env.3, renamed to match
#    this unit's %i instance numbering) — copy by hand, these hold the ingest secret.
sudo cp /path/to/.env   /opt/karvon-listener/.env.1
sudo cp /path/to/.env.2 /opt/karvon-listener/.env.2
sudo cp /path/to/.env.3 /opt/karvon-listener/.env.3
sudo chown karvon-listener:karvon-listener /opt/karvon-listener/.env.*
sudo chmod 600 /opt/karvon-listener/.env.*
```

## The session-file transfer (the part that needs care)

**Telegram sessions aren't OS-locked — a `.session` file authenticated on Windows works
unchanged on Linux.** This avoids re-doing the interactive phone/code login for 3 already-trusted
accounts (re-logging in fresh risks tripping Telegram's new-device scrutiny on accounts that have
been fine so far).

```bash
# From the Windows machine, over the same SSH connection already used for this project:
scp karvon_listener_main.session karvon_listener_2.session karvon_listener_3.session \
    root@<server>:/opt/karvon-listener/
ssh root@<server> 'chown karvon-listener:karvon-listener /opt/karvon-listener/*.session && chmod 600 /opt/karvon-listener/*.session'
```

**Do this only during the cutover window below — not before.** A `.session` file is a live
credential: whoever holds it can act as that Telegram account. Delete it from anywhere it was
staged in transit once confirmed working in its final `chmod 600` location.

## Cutover sequence (minimizes missed messages and duplicate processing)

Telethon sessions are not safe to run from two places at once — Telegram can flag or disconnect
a session that suddenly has two live connections. The three existing accounts are each a single
identity; only one process per account may be connected at a time.

1. **Stop all 3 Windows instances first** (`stop-all.bat`) — confirm all 3 processes are gone
   (`Get-Process python` should show none related to the listener).
2. Copy the `.session` files over (above).
3. `sudo systemctl daemon-reload`
4. `sudo systemctl enable --now karvon-listener@1 karvon-listener@2 karvon-listener@3`
5. Watch `journalctl -u 'karvon-listener@*' -f` for "logged in as ..." lines confirming each
   instance reconnected as the same account it was on Windows (same account id/username) — not a
   fresh login prompt (if one appears, STOP: it means that `.session` file didn't transfer
   correctly, and proceeding would create a 4th, untrusted session on an account that already has
   one running elsewhere).
6. Only once all 3 confirm healthy: the Windows machine no longer needs to run anything for
   ingestion — `supervisor.ps1`/`start-background.bat` there become unnecessary going forward.

## Rollback

`sudo systemctl stop karvon-listener@1 karvon-listener@2 karvon-listener@3` (or `disable --now`
to also stop it autostarting), then resume `start-background.bat` on Windows — the `.session`
files still exist on both machines at that point, but per the cutover-sequence warning, only
start one side at a time.

## Health / monitoring (phase 6, prepared, not implemented)

Each instance already writes `listener*.log` with a timestamped line per poll pass
(`pass done — sent=N matched=N failed=N`) and a `state*.json` with per-group cursors — a basic
heartbeat check is `journalctl -u karvon-listener@1 --since "-10 minutes" | grep -q "pass done"`,
alertable via the same cron-based pattern already used for this box's backup jobs, without adding
new monitoring infrastructure. Not wired up yet — proposed, not executed, and no alerting channel
(email/Telegram-to-operator) is defined yet.
