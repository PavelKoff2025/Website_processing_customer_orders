# Обработка заявок клиентов

Закрытый контур приёма лидов: форма для «тёплых» клиентов, запись в PostgreSQL, приватный реестр образов. Данные не покидают сервер.

Демонстрация: [karikovpavel.ru](https://karikovpavel.ru)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Compose](https://img.shields.io/badge/Docker_Compose-v2+-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04-E95420?logo=ubuntu&logoColor=white)](https://ubuntu.com/)

---

## Что внутри

Единственная точка входа снаружи — **Nginx** (сайт и API). Postgres портов наружу не публикует: доступ только из внутренней сети и через pgAdmin за Basic Auth.

```
браузер ──► Nginx :80/:443 ──► frontend
                 └── /api/   ──► backend (появится позже)
                 └── /pgadmin/ ► pgAdmin ──► Postgres
         ──► Registry :5000     образы бэкенда (HTTP + docker login)
```

| Сервис | Роль |
|--------|------|
| **Nginx** | TLS, статика, прокси `/api/` и `/pgadmin/` |
| **PostgreSQL 16** | Хранилище заявок, сеть `internal` без выхода в интернет |
| **pgAdmin** | Просмотр БД, только через Nginx |
| **Registry** | Локальный Docker Registry на `:5000` |
| **Watchtower** | Автообновление контейнеров с меткой |

Нужен плагин **`docker compose`** (через пробел). Старый бинарник `docker-compose` не поддерживается.

---

## Быстрый старт

```bash
git clone https://github.com/PavelKoff2025/Website_processing_customer_orders.git
cd Website_processing_customer_orders

./scripts/preflight.sh          # Docker Engine + плагин compose
./scripts/bootstrap.sh          # .env, сертификат, htpasswd

cd registry
./create-user.sh admin --save-to-env
cd ..

docker compose up -d
docker compose ps
```

Секреты живут только в `.env` (в git не попадает). Шаблон — [`.env.example`](.env.example).

### Проверка

| Что | Адрес |
|-----|--------|
| Сайт | `https://<хост>/` |
| pgAdmin | `https://<хост>/pgadmin/` — сначала Basic Auth Nginx, затем логин панели |
| Registry | `http://<хост>:5000/v2/` — JSON `{}` после `docker login` |

Пользователь реестра создаётся скриптом, как в задании:

```bash
cd registry
./create-user.sh admin
```

---

## Структура

```
├── docker-compose.yml
├── .env.example
├── nginx/                 # reverse proxy, TLS, лимиты
├── postgres/              # init-скрипты БД
├── pgadmin/               # преднастроенный сервер
├── registry/create-user.sh
├── scripts/               # bootstrap, certbot, фаервол реестра
└── frontend/dist/         # заглушка лендинга
```

Порты, интервал Watchtower и доступы к БД задаются в `.env`, а не зашиты в compose.

---

## Безопасность контура

- Сеть `autello_db` с `internal: true` — у Postgres нет маршрута в интернет.
- Backend (когда появится) публикует порт только через `expose`, не через `ports`.
- Watchtower обновляет лишь контейнеры с меткой `com.centurylinklabs.watchtower.enable` — база не уедет на новую мажорную версию сама.
- Порт реестра можно ограничить списком IP: `./scripts/firewall-registry.sh`.

---

## Лицензия

[MIT](LICENSE) © 2026 Pavel Karikov
