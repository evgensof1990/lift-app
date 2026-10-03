# shellcheck shell=bash disable=SC2034
# Общие настройки серверных скриптов «Лифта». Подключается: source "$(dirname "$0")/lib.sh"
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$BASE/.tools/node/bin"
UNIT="lift-app"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/lift-app}"

# Соседи на том же сервере — не трогаем
CEH_DIR="/home/mac-user/my-projects/wood-shop-max"
SHOPC_DIR="/home/mac-user/my-projects/Shop_constructor"
FOREIGN_DOMAINS="workshop4.ru www.workshop4.ru rbd-concierge.ru www.rbd-concierge.ru myrenthub.ru www.myrenthub.ru"

die() {
  echo "ОШИБКА: $*" >&2
  exit 1
}

case "$BASE" in
  "$CEH_DIR"* | "$SHOPC_DIR"*) die "скрипт «Лифта» запущен из чужой папки ($BASE)" ;;
esac

env_value() {
  sed -n "s/^$1=//p" "$BASE/.env" 2>/dev/null | tail -n 1
}

use_node() {
  export PATH="$NODE_BIN:$PATH"
}

health_ok() {
  curl -sf --max-time 5 "http://127.0.0.1:$(env_value PORT)/health" >/dev/null 2>&1
}

wait_health() {
  for _ in $(seq 1 20); do
    health_ok && return 0
    sleep 1
  done
  return 1
}
