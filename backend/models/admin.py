"""Админ-конфиг интерфейса: услуги и диапазон бюджета для ползунка."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from psycopg.types.json import Jsonb

from core.db import db

DEFAULT_SERVICES: list[dict[str, str]] = [
    {"code": "consulting", "name": "Консультация"},
    {"code": "audit", "name": "Аудит"},
    {"code": "implementation", "name": "Внедрение"},
    {"code": "support", "name": "Сопровождение"},
]


@dataclass
class AdminConfig:
    """
    CREATE TABLE IF NOT EXISTS admin_config (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        services    JSONB NOT NULL DEFAULT '[]'::jsonb,
        budget_min  TEXT NOT NULL DEFAULT '0',
        budget_max  TEXT NOT NULL DEFAULT '0',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """

    id: int | None = None
    services: list[Any] = field(default_factory=list)
    budget_min: str = "0"
    budget_max: str = "0"
    updated_at: datetime | None = None

    TABLE = "admin_config"
    WRITABLE = ("services", "budget_min", "budget_max")


class AdminConfigCRUD:
    """CRUD для настроек, из которых фронтенд собирает форму."""

    @staticmethod
    def create(data: dict[str, Any], conn: Any | None = None) -> dict[str, Any]:
        payload = {
            "services": Jsonb(data.get("services") or []),
            "budget_min": str(data.get("budget_min", "0")),
            "budget_max": str(data.get("budget_max", "0")),
        }
        row = db.fetch_one(
            f"""
            INSERT INTO {AdminConfig.TABLE} (services, budget_min, budget_max)
            VALUES (%(services)s, %(budget_min)s, %(budget_max)s)
            RETURNING *
            """,
            payload,
            conn=conn,
        )
        if row is None:
            raise RuntimeError("Не удалось создать админ-конфиг.")
        return row

    @staticmethod
    def get_by_id(item_id: int, conn: Any | None = None) -> dict[str, Any] | None:
        return db.fetch_one(
            f"SELECT * FROM {AdminConfig.TABLE} WHERE id = %(id)s",
            {"id": item_id},
            conn=conn,
        )

    @staticmethod
    def get_current(conn: Any | None = None) -> dict[str, Any] | None:
        return db.fetch_one(
            f"""
            SELECT * FROM {AdminConfig.TABLE}
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
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
            SELECT * FROM {AdminConfig.TABLE}
            ORDER BY updated_at DESC, id DESC
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            {"limit": limit, "offset": offset},
            conn=conn,
        )

    @staticmethod
    def update(
        item_id: int,
        data: dict[str, Any],
        conn: Any | None = None,
    ) -> dict[str, Any] | None:
        fields: dict[str, Any] = {}
        if "services" in data:
            fields["services"] = Jsonb(data.get("services") or [])
        if "budget_min" in data and data["budget_min"] is not None:
            fields["budget_min"] = str(data["budget_min"])
        if "budget_max" in data and data["budget_max"] is not None:
            fields["budget_max"] = str(data["budget_max"])
        if not fields:
            return AdminConfigCRUD.get_by_id(item_id, conn=conn)
        assignments = ", ".join(f"{key} = %({key})s" for key in fields)
        fields["id"] = item_id
        return db.fetch_one(
            f"""
            UPDATE {AdminConfig.TABLE}
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
            f"DELETE FROM {AdminConfig.TABLE} WHERE id = %(id)s RETURNING id",
            {"id": item_id},
            conn=conn,
        )
        return row is not None

    @staticmethod
    def seed_defaults() -> dict[str, Any]:
        current = AdminConfigCRUD.get_current()
        if current is not None:
            return current
        return AdminConfigCRUD.create(
            {
                "services": DEFAULT_SERVICES,
                "budget_min": "100000",
                "budget_max": "10000000",
            }
        )
