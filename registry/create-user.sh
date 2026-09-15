#!/usr/bin/env bash
# =============================================================================
#  Создание (или смена пароля) пользователя локального Docker Registry.
#  Именно этими учётными данными выполняется `docker login <host>:5000`.
#
#  Использование:
#      cd /root/Autéllo_Barskiy/registry
#      ./create-user.sh admin <пароль>          # задать пароль явно
#      ./create-user.sh admin                   # сгенерировать случайный
#      ./create-user.sh admin --use-db-password # взять пароль от PostgreSQL
#      ./create-user.sh admin --save-to-env     # + прописать в ../.env
#
#  Флаг --save-to-env нужен, чтобы Watchtower (он читает REGISTRY_PASSWORD
#  из .env) продолжил ходить в реестр после смены пароля.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

# ТРЕБОВАНИЕ проекта: плагин `docker compose` v2+, а не legacy `docker-compose`.
. "$ROOT/scripts/preflight.sh"

HTPASSWD_FILE="$HERE/auth/htpasswd"
mkdir -p "$HERE/auth"
touch "$HTPASSWD_FILE"

# --- разбор аргументов --------------------------------------------------------
USER_NAME=""
PASS_MODE="random"
PASS_EXPLICIT=""
SAVE_ENV=0

for arg in "$@"; do
    case "$arg" in
        --use-db-password) PASS_MODE="db" ;;
        --save-to-env)     SAVE_ENV=1 ;;
        --*)
            echo "Неизвестный флаг: $arg" >&2
            echo "Использование: ./create-user.sh <логин> [пароль|--use-db-password] [--save-to-env]" >&2
            exit 1 ;;
        *)
            if [[ -z "$USER_NAME" ]]; then
                USER_NAME="$arg"
            else
                PASS_EXPLICIT="$arg"
                PASS_MODE="explicit"
            fi ;;
    esac
done

if [[ -z "$USER_NAME" ]]; then
    echo "Использование: ./create-user.sh <логин> [пароль|--use-db-password] [--save-to-env]" >&2
    exit 1
fi

# --- определяем пароль --------------------------------------------------------
case "$PASS_MODE" in
    db)
        [[ -f "$ROOT/.env" ]] || { echo "Нет файла $ROOT/.env" >&2; exit 1; }
        PASS="$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
        [[ -n "$PASS" ]] || { echo "POSTGRES_PASSWORD не найден в .env" >&2; exit 1; }
        SOURCE_NOTE="взят из POSTGRES_PASSWORD (.env)"
        ;;
    explicit)
        PASS="$PASS_EXPLICIT"
        SOURCE_NOTE="задан аргументом"
        ;;
    *)
        PASS="$(openssl rand -base64 24 | tr -d '\n=+/' | cut -c1-24)"
        SOURCE_NOTE="сгенерирован случайно"
        ;;
esac

# --- пишем htpasswd -----------------------------------------------------------
# Registry принимает только bcrypt (-B). htpasswd берём из образа httpd,
# чтобы не тянуть apache2-utils на хост.
# Без конвейера с `head`: SIGPIPE уронил бы скрипт при set -o pipefail.
HASH_OUT="$(docker run --rm httpd:2.4-alpine htpasswd -Bbn "$USER_NAME" "$PASS")"
HASH_LINE="${HASH_OUT%%$'\n'*}"

[[ "$HASH_LINE" == "$USER_NAME:"* ]] \
    || { echo "Не удалось сформировать хеш пароля" >&2; exit 1; }

# Перезаписываем запись этого логина, остальные сохраняем.
TMP="$(mktemp)"
grep -v "^${USER_NAME}:" "$HTPASSWD_FILE" > "$TMP" || true
printf '%s\n' "$HASH_LINE" >> "$TMP"
mv "$TMP" "$HTPASSWD_FILE"
chmod 644 "$HTPASSWD_FILE"

# --- при необходимости обновляем .env -----------------------------------------
if (( SAVE_ENV )); then
    [[ -f "$ROOT/.env" ]] || { echo "Нет файла $ROOT/.env" >&2; exit 1; }
    cp -p "$ROOT/.env" "$ROOT/.env.bak.$(date +%Y-%m-%d_%H%M%S)"

    USER_NAME="$USER_NAME" PASS="$PASS" python3 - "$ROOT/.env" <<'PY'
import os, re, sys

path = sys.argv[1]
user = os.environ["USER_NAME"]
pwd  = os.environ["PASS"]

with open(path) as fh:
    lines = fh.readlines()

seen_user = seen_pass = False
out = []
for line in lines:
    if re.match(r'^REGISTRY_USER=', line):
        out.append(f"REGISTRY_USER={user}\n"); seen_user = True
    elif re.match(r'^REGISTRY_PASSWORD=', line):
        out.append(f"REGISTRY_PASSWORD={pwd}\n"); seen_pass = True
    else:
        out.append(line)

if not seen_user:
    out.append(f"REGISTRY_USER={user}\n")
if not seen_pass:
    out.append(f"REGISTRY_PASSWORD={pwd}\n")

with open(path, "w") as fh:
    fh.writelines(out)
PY
    printf '\033[1;32m[ok]\033[0m REGISTRY_USER/REGISTRY_PASSWORD обновлены в .env\n'

    # Watchtower читает пароль из окружения — его нужно пересоздать.
    ( cd "$ROOT" && docker compose up -d watchtower >/dev/null 2>&1 ) || true
    printf '\033[1;32m[ok]\033[0m Watchtower пересоздан с новым паролем\n'
fi

# Реестр читает файл на каждый запрос, но перезапуск гарантирует подхват.
if docker ps --format '{{.Names}}' | grep -q '^autello_registry$'; then
    ( cd "$ROOT" && docker compose restart registry >/dev/null 2>&1 ) || true
    printf '\033[1;32m[ok]\033[0m Контейнер autello_registry перезапущен\n'
fi

echo
echo "Пользователь реестра сохранён:"
echo "  логин:  $USER_NAME"
echo "  пароль: $PASS   ($SOURCE_NOTE)"
echo
REG_HOST="$(grep -E '^REGISTRY_HOST=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
echo "Проверка входа:"
echo "  docker login ${REG_HOST:-<host>:5000} -u $USER_NAME"
