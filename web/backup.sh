#!/bin/bash
# Daily pg_dump of karvon-db, gzip'd, with 14-day local rotation.
set -euo pipefail
cd "$(dirname "$0")"

BACKUP_DIR="$(pwd)/backups"
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/karvon_${TS}.sql.gz"

docker exec karvon-db pg_dump -U karvon karvon | gzip > "$FILE"
echo "$(date -Iseconds) backed up to $FILE ($(du -h "$FILE" | cut -f1))"

find "$BACKUP_DIR" -name "karvon_*.sql.gz" -mtime +14 -delete
