#!/usr/bin/env bash
# =============================================================================
#  Выпуск доверенного сертификата Let's Encrypt на PUBLIC_HOST.
#  Требует: A-запись домена уже указывает на этот сервер, порт 80 открыт.
#
#      ./scripts/issue-certs.sh
#      ./scripts/issue-certs.sh --with-www
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
. "$ROOT/scripts/preflight.sh"

set -a; . ./.env; set +a

WITH_WWW=0
[[ "${1:-}" == "--with-www" ]] && WITH_WWW=1

OUR_IP="$(curl -fsS --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')"
DOMAIN_IP="$(getent ahostsv4 "$PUBLIC_HOST" 2>/dev/null | awk '{print $1; exit}')"

if [[ -z "$DOMAIN_IP" ]]; then
    echo "Домен $PUBLIC_HOST не резолвится. Пропишите A-запись на $OUR_IP" >&2
    exit 1
fi
if [[ "$DOMAIN_IP" != "$OUR_IP" ]]; then
    echo "DNS ещё не указывает сюда:" >&2
    echo "  $PUBLIC_HOST -> $DOMAIN_IP" >&2
    echo "  этот сервер  -> $OUR_IP" >&2
    echo "В панели Reg.ru: A @ $OUR_IP  (и A www $OUR_IP, если нужен www)" >&2
    exit 1
fi

mkdir -p certbot/www certbot/conf

DOMAINS=(-d "$PUBLIC_HOST")
if (( WITH_WWW )); then
    WWW_IP="$(getent ahostsv4 "www.$PUBLIC_HOST" 2>/dev/null | awk '{print $1; exit}' || true)"
    if [[ "$WWW_IP" == "$OUR_IP" ]]; then
        DOMAINS+=(-d "www.$PUBLIC_HOST")
    else
        echo "www.$PUBLIC_HOST не указывает на этот сервер — выпускаю только $PUBLIC_HOST"
    fi
fi

echo "==> Выпускаю сертификат для ${DOMAINS[*]}"
docker compose --profile certs run --rm --entrypoint certbot certbot certonly \
    --webroot -w /var/www/certbot \
    "${DOMAINS[@]}" \
    --email "$ACME_EMAIL" \
    --agree-tos --non-interactive --keep-until-expiring

LIVE="certbot/conf/live/${PUBLIC_HOST}"
if [[ ! -f "$LIVE/fullchain.pem" || ! -f "$LIVE/privkey.pem" ]]; then
    echo "Certbot отработал, но файлы сертификата не найдены в $LIVE" >&2
    exit 1
fi

# Nginx читает фиксированные пути. Подкладываем LE вместо self-signed.
cp -L "$LIVE/fullchain.pem" nginx/certs/autello.crt
cp -L "$LIVE/privkey.pem"   nginx/certs/autello.key
chmod 644 nginx/certs/autello.crt
chmod 600 nginx/certs/autello.key

docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo
echo "Сертификат Let's Encrypt установлен для $PUBLIC_HOST"
echo "Проверка: https://$PUBLIC_HOST/"
