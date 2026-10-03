#!/usr/bin/env bash
# Бэкап «Лифта»: база + файлы анкет + .env. Каждую ночь в 03:50 (cron), вручную: bash scripts/backup.sh
# Архивы: ~/backups/lift-app/lift-<дата>.tar.gz, хранятся последние 14.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
use_node

KEEP="${BACKUP_KEEP:-14}"
data="$(env_value DATA_DIR)"
data="${data:-$BASE/data}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
mkdir -p "$BACKUP_ROOT"

[ -f "$data/lift.db" ] && node "$BASE/scripts/db-snapshot.mjs" "$data/lift.db" "$work/lift.db" >/dev/null
cp "$BASE/.env" "$work/env"
cat > "$work/RESTORE.txt" <<TXT
Восстановление «Лифта» из архива:
1. mkdir /tmp/r && tar xzf lift-<дата>.tar.gz -C /tmp/r
2. sudo systemctl stop $UNIT
3. cp /tmp/r/env $BASE/.env
4. mkdir -p $data && cp /tmp/r/lift.db $data/lift.db && rm -rf $data/uploads && cp -r /tmp/r/uploads $data/uploads
5. sudo systemctl start $UNIT
TXT

archive="$BACKUP_ROOT/lift-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$data/uploads"
tar czf "$archive" -C "$work" . -C "$data" uploads
chmod 600 "$archive"
echo "OK $archive ($(du -h "$archive" | cut -f1))"
ls -1t "$BACKUP_ROOT"/lift-[0-9]*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm --
