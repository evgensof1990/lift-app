#!/usr/bin/env bash
# Автовыкладка «Лифта»: таймер lift-app-deploy.timer раз в 2 минуты; вручную: bash scripts/deploy.sh
# Новый коммит в ветке → сборка → перезапуск; не собралось или не отвечает → откат на прошлую версию.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

LOG="$BACKUP_ROOT/deploy.log"
FAILED="$BACKUP_ROOT/deploy.failed"
mkdir -p "$BACKUP_ROOT"
log() { printf '%s %s\n' "$(date -Iseconds)" "$*" >>"$LOG"; }

exec 9>"$BACKUP_ROOT/deploy.lock"
flock -n 9 || exit 0

cd "$BASE"
branch="$(git rev-parse --abbrev-ref HEAD)"
git fetch -q origin "$branch"
prev="$(git rev-parse HEAD)"
remote="$(git rev-parse "origin/$branch")"
[ "$prev" = "$remote" ] && exit 0
[ "$(cat "$FAILED" 2>/dev/null)" = "$remote" ] && exit 0

use_node
lock_before="$(sha256sum package-lock.json | awk '{print $1}')"
log "PULL $branch ${prev:0:7} → ${remote:0:7}"
git pull -q --ff-only origin "$branch"
[ "$lock_before" != "$(sha256sum package-lock.json | awk '{print $1}')" ] && npm ci --no-audit --no-fund >>"$LOG" 2>&1

rollback() {
  log "ERROR $1 — откат на ${prev:0:7}"
  echo "$remote" >"$FAILED"
  git reset -q --hard "$prev"
  npm ci --no-audit --no-fund >>"$LOG" 2>&1 || true
  npm run build >>"$LOG" 2>&1 || true
  sudo systemctl restart "$UNIT"
  wait_health && log "ROLLBACK ok" || log "CRITICAL после отката не отвечает"
  exit 1
}

npm run build >>"$LOG" 2>&1 || rollback "сборка не прошла"
sudo systemctl restart "$UNIT"
wait_health || rollback "не отвечает после перезапуска"
log "SUCCESS $(git rev-parse --short HEAD)"
