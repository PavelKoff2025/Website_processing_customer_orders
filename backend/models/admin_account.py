"""Учётные записи администраторов: логин и хеш пароля."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from core.db import db
from core.security import hash_password


@dataclass
class AdminAccount:
    """
    CREATE TABLE IF NOT EXISTS admins (
        id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        login          TEXT NOT NULL,
        password_hash  TEXT NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT admins_login_key UNIQUE (login)
    )
    """

    id: int | None = None
    login: str = ""
    password_hash: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None

    TABLE = "admins"
    WRITABLE = ("login", "password_hash")


class AdminAccountCRUD:
    """CRUD для таблицы admins. Пароль в открытом виде в БД не пишется."""

    @staticmethod
    def normalize_login(login: str) -> str:
        return (login or "").strip().lower()

    @staticmethod
    def create(data: dict[str, Any], conn: Any | None = None) -> dict[str, Any]:
        login = AdminAccountCRUD.normalize_login(str(data.get("login", "")))
        password = str(data.get("password", ""))
        payload = {
            "login": login,
            "password_hash": hash_password(password),
        }
        row = db.fetch_one(
            f"""
            INSERT INTO {AdminAccount.TABLE} (login, password_hash)
            VALUES (%(login)s, %(password_hash)s)
            RETURNING *
            """,
            payload,
            conn=conn,
        )
        if row is None:
            raise RuntimeError("Не удалось создать администратора.")
        return row

    @staticmethod
    def get_by_id(item_id: int, conn: Any | None = None) -> dict[str, Any] | None:
        return db.fetch_one(
            f"SELECT * FROM {AdminAccount.TABLE} WHERE id = %(id)s",
            {"id": item_id},
            conn=conn,
        )

    @staticmethod
    def get_by_login(login: str, conn: Any | None = None) -> dict[str, Any] | None:
        return db.fetch_one(
            f"SELECT * FROM {AdminAccount.TABLE} WHERE login = %(login)s",
            {"login": AdminAccountCRUD.normalize_login(login)},
            conn=conn,
        )

    @staticmethod
    def list_all(
        limit: int = 100,
        offset: int = 0,
        conn: Any | None = None,
    ) -> list[dict[str, Any]]:
        return db.fetch_all(
            f"""
            SELECT * FROM {AdminAccount.TABLE}
            ORDER BY created_at ASC, id ASC
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            {"limit": limit, "offset": offset},
            conn=conn,
        )

    @staticmethod
    def count(conn: Any | None = None) -> int:
        row = db.fetch_one(
            f"SELECT COUNT(*)::int AS n FROM {AdminAccount.TABLE}",
            conn=conn,
        )
        return int(row["n"]) if row else 0

    @staticmethod
    def update(
        item_id: int,
        data: dict[str, Any],
        conn: Any | None = None,
    ) -> dict[str, Any] | None:
        fields: dict[str, Any] = {}
        if "login" in data and data["login"] is not None:
            fields["login"] = AdminAccountCRUD.normalize_login(str(data["login"]))
        if data.get("password"):
            fields["password_hash"] = hash_password(str(data["password"]))
        if not fields:
            return AdminAccountCRUD.get_by_id(item_id, conn=conn)
        assignments = ", ".join(f"{key} = %({key})s" for key in fields)
        fields["id"] = item_id
        return db.fetch_one(
            f"""
            UPDATE {AdminAccount.TABLE}
            SET {assignments}, updated_at = NOW()
            WHERE id = %(id)s
            RETURNING *
            """,
            fields,
            conn=conn,
        )

    @staticmethod
    def delete(item_id: int, conn: Any | None = None) -> bool:
        row = db.fetch_one(
            f"DELETE FROM {AdminAccount.TABLE} WHERE id = %(id)s RETURNING id",
            {"id": item_id},
            conn=conn,
        )
        return row is not None
