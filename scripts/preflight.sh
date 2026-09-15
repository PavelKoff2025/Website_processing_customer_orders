#!/usr/bin/env bash
# =============================================================================
#  Обязательная проверка окружения перед работой со стеком.
#
#  ТРЕБОВАНИЕ: используется ПЛАГИН `docker compose` (Compose v2+), а НЕ старый
#  самостоятельный бинарник `docker-compose` (v1, Python).
#
#  Почему это важно:
#    * v1 не понимает `depends_on.condition: service_healthy` в нашем виде,
#      YAML-анкоры с `<<:` мерджатся иначе и молча теряют настройки;
#    * v1 не поддерживает ключ `name:` для проекта — имена сетей/томов
#      разъедутся, и получится второй параллельный стек;
#    * v1 иначе разбирает `${VAR:-default}` в портах;
#    * v1 снят с поддержки и не знает Docker API новых версий.
#
#  Подключается из других скриптов:  . "$(dirname "$0")/preflight.sh"
#  Либо запускается отдельно:        ./scripts/preflight.sh
# =============================================================================
set -euo pipefail

_pf_fail() { printf '\033[1;31m[ОШИБКА]\033[0m %s\n' "$*" >&2; exit 1; }
_pf_warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
_pf_ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }

# --- 1. Docker Engine присутствует и демон отвечает ---------------------------
command -v docker >/dev/null 2>&1 \
    || _pf_fail "Docker не установлен. См. https://docs.docker.com/engine/install/ubuntu/"

docker info >/dev/null 2>&1 \
    || _pf_fail "Docker-демон не отвечает. Проверьте: systemctl status docker"

_pf_ok "Docker Engine: $(docker version --format '{{.Server.Version}}') (API $(docker version --format '{{.Server.APIVersion}}'))"

# --- 2. ТРЕБУЕМ плагин docker compose (v2+) ----------------------------------
if ! docker compose version >/dev/null 2>&1; then
    _pf_fail "$(cat <<'MSG'
Не найден плагин `docker compose`.

Установите его (Ubuntu/Debian) — именно плагин, не legacy-бинарник:

    apt-get update
    apt-get install -y docker-compose-plugin

Проверка:  docker compose version
MSG
)"
fi

COMPOSE_VER="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
COMPOSE_MAJOR="${COMPOSE_VER%%.*}"

if ! [[ "$COMPOSE_MAJOR" =~ ^[0-9]+$ ]] || (( COMPOSE_MAJOR < 2 )); then
    _pf_fail "Нужен Compose v2 или новее, обнаружен: ${COMPOSE_VER:-неизвестно}"
fi

_pf_ok "Плагин docker compose: v${COMPOSE_VER}"

# --- 3. Предупреждаем про legacy docker-compose ------------------------------
# Сам факт его наличия не ломает стек, но запуск через него — ломает.
if command -v docker-compose >/dev/null 2>&1; then
    _pf_warn "В системе найден устаревший 'docker-compose' ($(command -v docker-compose))."
    _pf_warn "НЕ запускайте стек через него. Используйте только 'docker compose' (через пробел)."
fi

# --- 4. Проверяем, что compose-файл читается и переменные подставлены --------
# Пропускаем, пока нет .env: при первом запуске bootstrap.sh его ещё не
# существует, и проверка ругалась бы на неподставленные переменные.
_PF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$_PF_ROOT/docker-compose.yml" && -f "$_PF_ROOT/.env" ]]; then
    ( cd "$_PF_ROOT" && docker compose config --quiet ) \
        || _pf_fail "docker-compose.yml не проходит валидацию (см. вывод выше)"
    _pf_ok "docker-compose.yml валиден"
fi

# Если скрипт запущен напрямую (а не подключён через `.`) — отчитаться.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo
    _pf_ok "Окружение готово к работе."
fi
