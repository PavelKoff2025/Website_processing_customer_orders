#!/usr/bin/env bash
# =============================================================================
#  Ограничение доступа к порту Docker Registry доверенными адресами.
#
#      ./scripts/firewall-registry.sh 203.0.113.10
#      ./scripts/firewall-registry.sh 203.0.113.10 198.51.100.0/24
#      ./scripts/firewall-registry.sh --show
#      ./scripts/firewall-registry.sh --clear
#
#  ПОЧЕМУ НЕ ufw / iptables INPUT:
#  Docker сам вписывает правила в nat/PREROUTING и FORWARD. Пакет к
#  опубликованному порту проходит DNAT и уходит в FORWARD, минуя INPUT, —
#  поэтому `ufw deny 5000` порт НЕ закрывает, хотя и выглядит убедительно.
#  Единственная цепочка, которую Docker гарантированно отдаёт пользователю
#  и просматривает ДО своих правил, — DOCKER-USER. В неё и пишем.
#
#  Правило трогает только порт реестра, SSH не затрагивается — заблокировать
#  себе доступ к серверу этим скриптом нельзя.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REG_PORT="$(grep -E '^REGISTRY_PORT=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
REG_PORT="${REG_PORT:-5000}"

COMMENT="autello-registry"

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

command -v iptables >/dev/null 2>&1 || { echo "iptables не найден" >&2; exit 1; }

# Docker создаёт DOCKER-USER сам; на всякий случай проверяем.
iptables -L DOCKER-USER -n >/dev/null 2>&1 \
    || { echo "Цепочки DOCKER-USER нет — запущен ли Docker?" >&2; exit 1; }

# --- снять все наши правила ---------------------------------------------------
clear_rules() {
    # Удаляем с конца, чтобы номера не съезжали.
    local nums
    nums="$(iptables -L DOCKER-USER -n --line-numbers | grep -F "$COMMENT" | awk '{print $1}' | sort -rn || true)"
    if [[ -z "$nums" ]]; then
        warn "Правил с меткой $COMMENT не найдено"
        return
    fi
    while read -r n; do
        [[ -n "$n" ]] && iptables -D DOCKER-USER "$n"
    done <<< "$nums"
    log "Прежние правила $COMMENT удалены"
}

show_rules() {
    echo "Цепочка DOCKER-USER (порт реестра: $REG_PORT):"
    iptables -L DOCKER-USER -n --line-numbers | sed 's/^/  /'
}

case "${1:-}" in
    --show)  show_rules; exit 0 ;;
    --clear) clear_rules; show_rules; exit 0 ;;
esac

# Без аргументов берём список из TRUSTED_REGISTRY_IPS в .env — именно так
# скрипт вызывается юнитом autello-firewall.service после перезагрузки.
if [[ $# -eq 0 ]]; then
    TRUSTED="$(grep -E '^TRUSTED_REGISTRY_IPS=' "$ROOT/.env" 2>/dev/null \
               | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
    if [[ -z "${TRUSTED// }" ]]; then
        echo "Укажите доверенные адреса аргументом или в TRUSTED_REGISTRY_IPS (.env)." >&2
        echo "Пример: ./scripts/firewall-registry.sh 203.0.113.10" >&2
        exit 1
    fi
    # shellcheck disable=SC2086
    set -- $TRUSTED
    log "Адреса взяты из TRUSTED_REGISTRY_IPS: $*"
fi

clear_rules

# --- ставим правила -----------------------------------------------------------
# Порядок важен: сначала ACCEPT для доверенных, в самый конец — DROP для всех.
# Вставляем по очереди в начало, поэтому DROP добавляем первым.
iptables -I DOCKER-USER 1 \
    -p tcp --dport "$REG_PORT" \
    -m comment --comment "$COMMENT drop-all" \
    -j DROP

for addr in "$@"; do
    iptables -I DOCKER-USER 1 \
        -p tcp --dport "$REG_PORT" -s "$addr" \
        -m comment --comment "$COMMENT allow $addr" \
        -j ACCEPT
    log "Разрешён доступ к порту $REG_PORT с $addr"
done

# Подсети самих docker-сетей обязательно разрешаем. Watchtower опрашивает
# реестр по публичному адресу ИЗ КОНТЕЙНЕРА: такой пакет идёт через FORWARD
# и без этого правила был бы отброшен, и автообновление бэкенда встало бы.
for sub in $(docker network ls --format '{{.Name}}' \
             | xargs -I{} docker network inspect {} \
                 --format '{{range .IPAM.Config}}{{.Subnet}}{{"\n"}}{{end}}' 2>/dev/null \
             | grep -E '^[0-9]' | sort -u); do
    iptables -I DOCKER-USER 1 \
        -p tcp --dport "$REG_PORT" -s "$sub" \
        -m comment --comment "$COMMENT allow docker-net $sub" \
        -j ACCEPT
    log "Разрешена внутренняя docker-подсеть $sub"
done

log "Остальным доступ к порту $REG_PORT запрещён"
echo
show_rules

echo
warn "Правила iptables не сохраняются при перезагрузке."
warn "Чтобы закрепить: apt-get install -y iptables-persistent && netfilter-save"
warn "либо повторно запустить этот скрипт после старта сервера."
