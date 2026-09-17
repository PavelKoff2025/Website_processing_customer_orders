"""
Синхронный драйвер PostgreSQL (psycopg 3 + пул соединений).

Подключение берётся из переменных окружения контейнера backend —
тех же, что заданы в docker-compose (сервис `postgres`, сеть `db`).
Наружу порт БД не публикуется: драйвер ходит только по внутреннему DNS.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator, Mapping, Sequence

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def _conn_kwargs() -> dict[str, Any]:
    return {
        "host": os.environ.get("POSTGRES_HOST", "postgres"),
        "port": int(os.environ.get("POSTGRES_PORT", "5432")),
        "dbname": os.environ.get("POSTGRES_DB", "autello"),
        "user": os.environ.get("POSTGRES_USER", "autello"),
        "password": os.environ.get("POSTGRES_PASSWORD", ""),
        "row_factory": dict_row,
        "connect_timeout": 10,
    }


class PostgresDriver:
    """Тонкая обёртка над пулом: execute / fetch / транзакции."""

    def __init__(self) -> None:
        self._pool: ConnectionPool | None = None

    @property
    def pool(self) -> ConnectionPool:
        if self._pool is None:
            raise RuntimeError("Пул PostgreSQL ещё не открыт. Вызови db.connect().")
        return self._pool

    def connect(self) -> None:
        if self._pool is not None:
            return
        self._pool = ConnectionPool(
            conninfo="",
            kwargs=_conn_kwargs(),
            min_size=1,
            max_size=10,
            timeout=30,
            open=True,
        )
        self._pool.wait(timeout=30.0)

    def close(self) -> None:
        if self._pool is not None:
            self._pool.close()
            self._pool = None

    def ping(self) -> bool:
        row = self.fetch_one("SELECT 1 AS ok")
        return bool(row and row.get("ok") == 1)

    def init_schema(self, statements: Sequence[str]) -> None:
        """Прогоняет DDL из докстрингов моделей (CREATE TABLE IF NOT EXISTS)."""
        with self.pool.connection() as conn:
            for sql in statements:
                text = (sql or "").strip()
                if text:
                    conn.execute(text)

    @contextmanager
    def transaction(self) -> Iterator[Any]:
        with self.pool.connection() as conn:
            with conn.transaction():
                yield conn

    def execute(
        self,
        sql: str,
        params: Mapping[str, Any] | Sequence[Any] | None = None,
        conn: Any | None = None,
    ) -> None:
        self._run(sql, params, conn, fetch="none")

    def fetch_one(
        self,
        sql: str,
        params: Mapping[str, Any] | Sequence[Any] | None = None,
        conn: Any | None = None,
    ) -> dict[str, Any] | None:
        return self._run(sql, params, conn, fetch="one")

    def fetch_all(
        self,
        sql: str,
        params: Mapping[str, Any] | Sequence[Any] | None = None,
        conn: Any | None = None,
    ) -> list[dict[str, Any]]:
        return self._run(sql, params, conn, fetch="all")

    def _run(
        self,
        sql: str,
        params: Mapping[str, Any] | Sequence[Any] | None,
        conn: Any | None,
        fetch: str,
    ) -> Any:
        if conn is not None:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return self._fetch(cur, fetch)
        with self.pool.connection() as owned:
            with owned.cursor() as cur:
                cur.execute(sql, params)
                return self._fetch(cur, fetch)

    @staticmethod
    def _fetch(cur: Any, fetch: str) -> Any:
        if fetch == "none":
            return None
        if fetch == "one":
            row = cur.fetchone()
            return dict(row) if row is not None else None
        return [dict(row) for row in cur.fetchall()]


db = PostgresDriver()
