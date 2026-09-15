#!/usr/bin/env bash
# =============================================================================
#  Первичная инициализация контура: секреты, TLS, htpasswd.
#  Идемпотентен — уже созданные артефакты не перезаписывает.
#
#  Использование:
#      ./scripts/bootstrap.sh                 # PUBLIC_HOST определится сам
#      PUBLIC_HOST=autello.ru ./scripts/bootstrap.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ТРЕБОВАНИЕ проекта: плагин `docker compose` v2+, а не legacy `docker-compose`.
. "$ROOT/scripts/preflight.sh"

CERT_DIR="nginx/certs"
NGINX_AUTH="nginx/auth"
REG_AUTH="registry/auth"

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

rand() { openssl rand -base64 "${1:-24}" | tr -d '\n=+/' | cut -c1-"${2:-24}"; }

# Apache htpasswd через официальный образ httpd — локально его ставить не нужно.
#   $1 = флаги (-Bbn bcrypt для registry, -mbn apr1-MD5 для nginx)
# Без конвейера: htpasswd печатает лишнюю пустую строку, и `| head -1` уронил бы
# скрипт по SIGPIPE при включённом pipefail.
htpasswd_gen() {
    local out
    out="$(docker run --rm httpd:2.4-alpine htpasswd "$1" "$2" "$3" 2>/dev/null)"
    printf '%s\n' "${out%%$'\n'*}"
}

# --- 1. Определяем публичный адрес -------------------------------------------
PUBLIC_HOST="${PUBLIC_HOST:-$(hostname -f 2>/dev/null || hostname)}"
PUBLIC_IP="${PUBLIC_IP:-$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')}"
log "Публичный хост: $PUBLIC_HOST   IP: $PUBLIC_IP"

# --- 2. .env со случайными секретами ------------------------------------------
if [[ -f .env ]]; then
    warn ".env уже существует — оставляю как есть"
else
    log "Генерирую .env со случайными паролями"
    PG_PASS="$(rand 32 32)"
    PGA_PASS="$(rand 20 20)"
    PGA_BASIC_PASS="$(rand 20 20)"
    # Отдельный пароль реестру не генерируется: он ссылается на пароль БД.
    REG_SECRET="$(rand 32 32)"

    cat > .env <<EOF
# Сгенерировано scripts/bootstrap.sh $(date -Is)
TZ=Europe/Moscow

PUBLIC_HOST=${PUBLIC_HOST}
REGISTRY_HOST=${PUBLIC_HOST}:5000
ACME_EMAIL=admin@${PUBLIC_HOST}

POSTGRES_DB=autello
POSTGRES_USER=autello
POSTGRES_PASSWORD=${PG_PASS}
# Адрес БД внутри контура (DNS-имя сервиса в сети autello_db).
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

PGADMIN_EMAIL=admin@${PUBLIC_HOST}
PGADMIN_PASSWORD=${PGA_PASS}

PGADMIN_BASIC_USER=ops
PGADMIN_BASIC_PASSWORD=${PGA_BASIC_PASS}

# Учётка для \`docker login\`. Пароль переиспользован от PostgreSQL — ссылкой,
# чтобы секрет лежал в одном месте. Развести их можно так:
#   cd registry && ./create-user.sh admin <новый-пароль>
REGISTRY_USER=admin
REGISTRY_PASSWORD=\${POSTGRES_PASSWORD}
REGISTRY_HTTP_SECRET=${REG_SECRET}

WATCHTOWER_INTERVAL=300
# Кавычки обязательны: значение с пробелами ломает \`source .env\` без них.
WATCHTOWER_ARGS="--cleanup --label-enable --rolling-restart"

HTTP_PORT=80
HTTPS_PORT=443
REGISTRY_PORT=5000
EOF
    chmod 600 .env
fi

set -a; . ./.env; set +a

# --- 3. Self-signed CA + серверный сертификат ---------------------------------
mkdir -p "$CERT_DIR"
if [[ -f "$CERT_DIR/autello.crt" ]]; then
    warn "Сертификат уже существует — пропускаю генерацию"
else
    log "Создаю собственный CA"
    openssl genrsa -out "$CERT_DIR/ca.key" 4096 2>/dev/null
    openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" -sha256 -days 3650 \
        -subj "/C=RU/O=Autello/OU=Infrastructure/CN=Autello Internal CA" \
        -out "$CERT_DIR/ca.crt" 2>/dev/null

    log "Создаю серверный сертификат для $PUBLIC_HOST / $PUBLIC_IP"
    cat > "$CERT_DIR/openssl.cnf" <<EOF
[req]
distinguished_name = dn
req_extensions     = ext
prompt             = no

[dn]
C  = RU
O  = Autello
CN = ${PUBLIC_HOST}

[ext]
basicConstraints       = CA:FALSE
keyUsage               = digitalSignature, keyEncipherment
extendedKeyUsage       = serverAuth
subjectAltName         = @san

[san]
DNS.1 = ${PUBLIC_HOST}
DNS.2 = localhost
IP.1  = ${PUBLIC_IP}
IP.2  = 127.0.0.1
EOF

    openssl genrsa -out "$CERT_DIR/autello.key" 2048 2>/dev/null
    openssl req -new -key "$CERT_DIR/autello.key" \
        -out "$CERT_DIR/autello.csr" -config "$CERT_DIR/openssl.cnf" 2>/dev/null
    openssl x509 -req -in "$CERT_DIR/autello.csr" \
        -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
        -out "$CERT_DIR/autello.crt" -days 825 -sha256 \
        -extensions ext -extfile "$CERT_DIR/openssl.cnf" 2>/dev/null
    rm -f "$CERT_DIR/autello.csr"

    chmod 600 "$CERT_DIR"/*.key
    chmod 644 "$CERT_DIR"/*.crt
fi

# --- 4. htpasswd для Docker Registry (bcrypt — требование registry:2) ---------
mkdir -p "$REG_AUTH"
if [[ -s "$REG_AUTH/htpasswd" ]]; then
    warn "registry/auth/htpasswd уже существует — пропускаю"
else
    log "Создаю пользователя реестра: $REGISTRY_USER"
    htpasswd_gen -Bbn "$REGISTRY_USER" "$REGISTRY_PASSWORD" > "$REG_AUTH/htpasswd"
    chmod 644 "$REG_AUTH/htpasswd"
fi

# --- 5. htpasswd для Nginx перед pgAdmin (apr1-MD5 — понимает musl/nginx) -----
mkdir -p "$NGINX_AUTH"
if [[ -s "$NGINX_AUTH/pgadmin.htpasswd" ]]; then
    warn "nginx/auth/pgadmin.htpasswd уже существует — пропускаю"
else
    log "Создаю Basic-Auth пользователя для pgAdmin: $PGADMIN_BASIC_USER"
    htpasswd_gen -mbn "$PGADMIN_BASIC_USER" "$PGADMIN_BASIC_PASSWORD" > "$NGINX_AUTH/pgadmin.htpasswd"
    chmod 644 "$NGINX_AUTH/pgadmin.htpasswd"
fi

# --- 6. Системное доверие к нашему CA (нужно для сайта на 443) ---------------
if [[ -d /usr/local/share/ca-certificates ]]; then
    log "Устанавливаю CA в системное хранилище"
    cp "$CERT_DIR/ca.crt" /usr/local/share/ca-certificates/autello-ca.crt
    update-ca-certificates >/dev/null 2>&1 || true
fi

# --- 7. insecure-registries: реестр опубликован по plain HTTP ----------------
# Без этого `docker login/push` на http://host:5000 получит
# "http: server gave HTTP response to HTTPS client".
REG_PORT="${REGISTRY_PORT:-5000}"
log "Прописываю insecure-registries в /etc/docker/daemon.json"

python3 - "$PUBLIC_HOST" "$PUBLIC_IP" "$REG_PORT" <<'PY'
import json, os, shutil, sys, datetime

host, ip, port = sys.argv[1], sys.argv[2], sys.argv[3]
path = "/etc/docker/daemon.json"

cfg = {}
if os.path.exists(path):
    with open(path) as fh:
        text = fh.read().strip()
    if text:
        cfg = json.loads(text)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    shutil.copy2(path, f"{path}.bak.{stamp}")

wanted = [f"{host}:{port}", f"{ip}:{port}", f"127.0.0.1:{port}"]
current = cfg.get("insecure-registries", [])
added = [w for w in wanted if w not in current]

if added:
    cfg["insecure-registries"] = current + added
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(cfg, fh, indent=2)
        fh.write("\n")
    print("  добавлено: " + ", ".join(added))
else:
    print("  уже прописано, изменений нет")
PY

# Применяем без рестарта демона, чтобы не трогать запущенные контейнеры.
if systemctl is-active --quiet docker 2>/dev/null; then
    systemctl reload docker 2>/dev/null || warn "Перечитайте конфиг демона: systemctl reload docker"
fi

log "Готово."
echo
echo "  Реестр:   http://${PUBLIC_HOST}:${REG_PORT}  (plain HTTP!)"
echo "  Логин:    ${REGISTRY_USER} / ${REGISTRY_PASSWORD}"
echo "  pgAdmin:  https://${PUBLIC_HOST}/pgadmin/"
echo "  Basic:    ${PGADMIN_BASIC_USER} / ${PGADMIN_BASIC_PASSWORD}"
echo "  pgAdmin вход: ${PGADMIN_EMAIL} / ${PGADMIN_PASSWORD}"
echo
echo "  На машине, откуда пушим образы, добавьте в /etc/docker/daemon.json:"
echo "      { \"insecure-registries\": [\"${PUBLIC_HOST}:${REG_PORT}\"] }"
echo "  и перезапустите Docker. CA для сайта: $ROOT/$CERT_DIR/ca.crt"
