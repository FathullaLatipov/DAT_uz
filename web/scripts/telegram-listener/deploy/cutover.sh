#!/usr/bin/env bash
# Moves the Telegram listener from this Windows machine to the Ubuntu server, step by step.
# Run from Git Bash in scripts/telegram-listener:
#
#     ./deploy/cutover.sh <ssh-user>@<host> [path/to/ssh/key]
#
# What it does (see deploy/README.md for the reasoning behind each step):
#   1. asks you to confirm the Windows listeners are stopped (two processes must never share a session)
#   2. creates an unprivileged `karvon-listener` user and /opt/karvon-listener on the server
#   3. uploads the code, groups list, .env files, the 3 Telethon sessions and the progress files
#   4. builds a venv, installs the systemd unit
#   5. starts instance 1, then 2, then 3, and stops at the first one that does not log in as its
#      usual account (a login prompt would mean the session did not transfer — it must not continue)
#
# The ssh user needs root or passwordless sudo. Nothing secret is printed.
set -euo pipefail

TARGET="${1:?usage: $0 <ssh-user>@<host> [ssh-key]}"
KEY="${2:-}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
[ -n "$KEY" ] && SSH_OPTS+=(-i "$KEY" -o IdentitiesOnly=yes)
remote() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

need=(listener.py requirements.txt deploy/karvon-listener@.service ../../data/telegram_groups.csv .env .env.2 .env.3
      karvon_listener_main.session karvon_listener_2.session karvon_listener_3.session)
for f in "${need[@]}"; do [ -f "$f" ] || { echo "missing $f — run this from scripts/telegram-listener with all three accounts set up"; exit 1; }; done

echo "Server: $TARGET"
remote 'echo "connected as $(whoami) on $(hostname)"; id -u'
read -r -p "Type STOPPED to confirm the listeners on this Windows machine are stopped (run stop-all.bat first): " a
[ "$a" = "STOPPED" ] || { echo "aborted"; exit 1; }
read -r -p "This copies 3 live Telegram sessions to the server. Type COPY to continue: " a
[ "$a" = "COPY" ] || { echo "aborted"; exit 1; }

echo "[1/5] preparing the server"
remote 'set -e
  SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo -n"
  command -v python3 >/dev/null || { echo "python3 is missing"; exit 1; }
  python3 -c "import venv, ensurepip" 2>/dev/null || $SUDO apt-get install -y python3-venv >/dev/null
  id karvon-listener >/dev/null 2>&1 || $SUDO useradd --system --home-dir /opt/karvon-listener --shell /usr/sbin/nologin karvon-listener
  $SUDO mkdir -p /opt/karvon-listener /opt/karvon-listener-stage
  $SUDO chmod 700 /opt/karvon-listener-stage'

echo "[2/5] uploading"
tar czf - listener.py requirements.txt deploy/karvon-listener@.service .env .env.2 .env.3 \
  karvon_listener_main.session karvon_listener_2.session karvon_listener_3.session \
  $( [ -f state.json ] && echo state.json ) $( [ -f state_2.json ] && echo state_2.json ) $( [ -f state_3.json ] && echo state_3.json ) \
  -C ../../data telegram_groups.csv 2>/dev/null \
  | remote 'SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo -n"; $SUDO tar xzf - -C /opt/karvon-listener-stage'

echo "[3/5] installing"
remote 'set -e
  SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo -n"
  S=/opt/karvon-listener-stage; D=/opt/karvon-listener
  $SUDO install -d -o karvon-listener -g karvon-listener -m 750 $D
  $SUDO install -o karvon-listener -g karvon-listener -m 640 $S/listener.py $S/requirements.txt $D/
  $SUDO install -o karvon-listener -g karvon-listener -m 640 $S/telegram_groups.csv $D/
  # instance numbers match the unit file: .env -> .env.1, the others keep their number
  $SUDO install -o karvon-listener -g karvon-listener -m 600 $S/.env   $D/.env.1
  $SUDO install -o karvon-listener -g karvon-listener -m 600 $S/.env.2 $D/.env.2
  $SUDO install -o karvon-listener -g karvon-listener -m 600 $S/.env.3 $D/.env.3
  for n in 1 2 3; do
    $SUDO sh -c "grep -q ^GROUPS_CSV= $D/.env.$n || echo GROUPS_CSV=$D/telegram_groups.csv >> $D/.env.$n"
  done
  for f in $S/*.session; do $SUDO install -o karvon-listener -g karvon-listener -m 600 $f $D/; done
  for f in $S/state*.json; do [ -f "$f" ] && $SUDO install -o karvon-listener -g karvon-listener -m 640 $f $D/ || true; done
  $SUDO install -m 644 $S/deploy/karvon-listener@.service /etc/systemd/system/
  # the staged copies of the sessions and secrets are not needed any more
  $SUDO find $S -type f -exec shred -u {} + 2>/dev/null || true
  $SUDO rm -rf $S'

echo "[4/5] python environment"
remote 'set -e
  SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo -n"
  cd /opt/karvon-listener
  [ -d .venv ] || $SUDO -u karvon-listener python3 -m venv .venv
  $SUDO -u karvon-listener .venv/bin/pip install -q -r requirements.txt
  $SUDO systemctl daemon-reload'

echo "[5/5] starting the instances one at a time"
for n in 1 2 3; do
  remote "SUDO=''; [ \"\$(id -u)\" = 0 ] || SUDO='sudo -n'; \$SUDO systemctl enable --now karvon-listener@$n >/dev/null 2>&1"
  echo "  instance $n started, waiting for login..."
  ok=""
  for _ in $(seq 1 12); do
    sleep 5
    logs="$(remote "journalctl -u karvon-listener@$n --since '-2 minutes' --no-pager 2>/dev/null || sudo -n journalctl -u karvon-listener@$n --since '-2 minutes' --no-pager")"
    if echo "$logs" | grep -q "logged in as"; then ok=1; break; fi
    if echo "$logs" | grep -qiE "phone number|EOFError|Please enter"; then break; fi
  done
  if [ -z "$ok" ]; then
    echo "  instance $n did NOT log in with its transferred session. Stopping here — do not continue."
    remote "SUDO=''; [ \"\$(id -u)\" = 0 ] || SUDO='sudo -n'; \$SUDO systemctl disable --now karvon-listener@$n >/dev/null 2>&1; true"
    echo "$logs" | tail -15
    exit 1
  fi
  echo "  instance $n: $(echo "$logs" | grep 'logged in as' | tail -1 | sed -E 's/^.*(logged in as [^ ]*).*/\1/')"
done
echo "Done. Watch it with: ssh $TARGET \"journalctl -u 'karvon-listener@*' -f\""
