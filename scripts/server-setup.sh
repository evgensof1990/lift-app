#!/usr/bin/env bash
# Установка «Лифта» на сервер (один раз). Запуск из папки проекта:
#   bash scripts/server-setup.sh lift.example.ru
# Что делает: свой Node.js 22 в .tools/node, .env с паролем команды, сборка,
# служба lift-app, автовыкладка из GitHub (каждые 2 минуты), ночной бэкап 03:50, nginx + HTTPS.
# Повторный запуск безопасен: .env и nginx не меняются, службы и сертификаты MAX обновляются.
# Соседей («Цех №4», конструктор магазинов) не трогает: свои службы, свой файл nginx, свой порт.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

domain="${1:-}"
[[ "$domain" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "укажите домен: bash scripts/server-setup.sh lift.example.ru"
for d in $FOREIGN_DOMAINS; do
  [ "$domain" = "$d" ] && die "домен $domain занят другим сайтом на этом сервере"
done
cd "$BASE"
echo "Лифт: $BASE, домен $domain"

# 1. Node.js
if [ ! -x "$NODE_BIN/node" ]; then
  echo "→ Скачиваю Node.js 22…"
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) die "неизвестная архитектура $(uname -m)" ;;
  esac
  sums="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt)"
  tarball="$(printf '%s\n' "$sums" | awk '{print $2}' | grep "linux-${arch}.tar.xz$" | head -n 1)"
  [ -n "$tarball" ] || die "не нашёл архив Node.js 22"
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$tarball" -o "$tmp/$tarball"
  (cd "$tmp" && printf '%s\n' "$sums" | grep " $tarball\$" | sha256sum -c -)
  mkdir -p "$BASE/.tools/node"
  tar -xJf "$tmp/$tarball" -C "$BASE/.tools/node" --strip-components=1
  rm -rf "$tmp"
fi
use_node
echo "✓ Node $(node -v)"

# 2. Настройки (.env создаётся один раз; повторный запуск его не меняет)
if [ ! -f "$BASE/.env" ]; then
  port=3100
  while curl -s --max-time 1 "http://127.0.0.1:$port" >/dev/null 2>&1; do port=$((port + 1)); done
  team_password="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  cat > "$BASE/.env" <<ENV
PORT=$port
PUBLIC_URL=https://$domain
TEAM_PASSWORD=$team_password
# Для страницы /privacy (оператор персональных данных пилотов)
OPERATOR_NAME=
OPERATOR_EMAIL=
ENV
  chmod 600 "$BASE/.env"
  echo "✓ .env создан (порт $port)"
else
  team_password="(не менялся — смотрите TEAM_PASSWORD в $BASE/.env)"
fi
port="$(env_value PORT)"

# 3. Сборка
npm ci --no-audit --no-fund
npm run build
echo "✓ Сборка готова"

# 3б. Сертификаты Минцифры для MAX API (автопостинг в каналы MAX). Копия у соседей — их файлы не меняются.
mkdir -p "$BASE/deploy/certs"
if [ ! -f "$BASE/deploy/certs/max-ca.pem" ]; then
  for src in "$SHOPC_DIR/deploy/certs/max-ca.pem" "$CEH_DIR/deploy/certs/max-ca.pem"; do
    if [ -f "$src" ]; then
      cp "$src" "$BASE/deploy/certs/max-ca.pem"
      echo "✓ Сертификаты MAX скопированы ($src не тронут)"
      break
    fi
  done
fi
[ -f "$BASE/deploy/certs/max-ca.pem" ] || echo "⚠ Нет deploy/certs/max-ca.pem — публикация в MAX работать не будет"

# 4. Службы
tmp_unit="$(mktemp)"
cat > "$tmp_unit" <<UNIT
# Создано scripts/server-setup.sh
[Unit]
Description=Лифт — приложение для пилотов
After=network.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$BASE
Environment=NODE_ENV=production
Environment=NODE_EXTRA_CA_CERTS=$BASE/deploy/certs/max-ca.pem
ExecStart=$NODE_BIN/node $BASE/apps/api/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo install -m 644 "$tmp_unit" "/etc/systemd/system/${UNIT}.service"

cat > "$tmp_unit" <<UNIT
# Создано scripts/server-setup.sh: выкладка «Лифта» из GitHub
[Unit]
Description=Deploy lift-app from GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$(id -un)
WorkingDirectory=$BASE
ExecStart=$BASE/scripts/deploy.sh
UNIT
sudo install -m 644 "$tmp_unit" "/etc/systemd/system/${UNIT}-deploy.service"

cat > "$tmp_unit" <<UNIT
# Создано scripts/server-setup.sh
[Unit]
Description=Poll GitHub and deploy lift-app every 2 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=2min
AccuracySec=30s
Persistent=true

[Install]
WantedBy=timers.target
UNIT
sudo install -m 644 "$tmp_unit" "/etc/systemd/system/${UNIT}-deploy.timer"
rm -f "$tmp_unit"
sudo systemctl daemon-reload
sudo systemctl enable --now "${UNIT}.service" "${UNIT}-deploy.timer"
sudo systemctl restart "${UNIT}.service"
wait_health || die "приложение не ответило. Журнал: sudo journalctl -u ${UNIT} -n 50"
echo "✓ Служба ${UNIT} работает на порту $port"

# 5. Бэкап каждую ночь в 03:50 (строки соседей в crontab сохраняются как есть)
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
mark="# lift-app backup"
line="50 3 * * * bash $BASE/scripts/backup.sh >> $BACKUP_ROOT/backup.log 2>&1 $mark"
current="$(crontab -l 2>/dev/null || true)"
{
  [ -n "$current" ] && printf '%s\n' "$current" | grep -vF "$mark"
  echo "$line"
} | crontab -
crontab -l | grep -qF "$mark" || die "не удалось добавить бэкап в crontab"
echo "✓ Бэкап каждую ночь в 03:50 → $BACKUP_ROOT"

# 6. nginx + HTTPS (свой файл; чужие конфиги не трогаем)
conf="/etc/nginx/sites-available/${UNIT}.conf"
tmp="$(mktemp)"
cat > "$tmp" <<NGINX
# «Лифт» — создан scripts/server-setup.sh
server {
    listen 80;
    listen [::]:80;
    server_name $domain;

    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
if [ ! -f "$conf" ]; then
  sudo install -m 644 "$tmp" "$conf"
  sudo ln -sf "$conf" "/etc/nginx/sites-enabled/${UNIT}.conf"
  if ! sudo nginx -t; then
    sudo rm -f "/etc/nginx/sites-enabled/${UNIT}.conf" "$conf"
    die "nginx не принял настройки — файл «Лифта» убран, остальные сайты работают как раньше"
  fi
  sudo systemctl reload nginx
  echo "✓ nginx: $domain → порт $port"
  if sudo certbot --nginx --redirect --non-interactive --agree-tos --register-unsafely-without-email -d "$domain"; then
    echo "✓ HTTPS-сертификат выпущен"
  else
    echo "⚠ Сертификат не выпущен — проверьте, что DNS $domain указывает на сервер, и запустите:"
    echo "  sudo certbot --nginx --redirect -d $domain"
  fi
else
  echo "✓ nginx уже настроен ($conf) — не меняю"
fi
rm -f "$tmp"

cat <<DONE

Готово.
  Приложение:      https://$domain
  Панель команды:  https://$domain/team
  Пароль команды:  $team_password
DONE
