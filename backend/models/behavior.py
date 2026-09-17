"""Поведенческие и технические метрики лида. Связь 1:1 с заявкой по PK."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from psycopg.types.json import Jsonb

from core.db import db


@dataclass
class LeadBehavior:
    """
    CREATE TABLE IF NOT EXISTS lead_behavior (
        id               BIGINT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
        time_on_page     DOUBLE PRECISION NOT NULL DEFAULT 0,
        buttons_clicked  JSONB NOT NULL DEFAULT '[]'::jsonb,
        cursor_hovers    JSONB NOT NULL DEFAULT '[]'::jsonb,
        return_count     INTEGER NOT NULL DEFAULT 0,
        technical_info   JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """

    id: int | None = None
    time_on_page: float = 0.0
    buttons_clicked: list[Any] = field(default_factory=list)
    cursor_hovers: list[Any] = field(default_factory=list)
    return_count: int = 0
    technical_info: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None

    TABLE = "lead_behavior"
    WRITABLE = (
        "time_on_page",
        "buttons_clicked",
        "cursor_hovers",
        "return_count",
        "technical_info",
    )
    JSON_FIELDS = frozenset({"buttons_clicked", "cursor_hovers", "technical_info"})


class LeadBehaviorCRUD:
    """CRUD для поведенческого пакета, привязанного к заявке один-к-одному."""

    @staticmethod
    def _payload(data: dict[str, Any], include_id: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if include_id:
            payload["id"] = data["id"]
        payload["time_on_page"] = data.get("time_on_page", 0) or 0
        payload["return_count"] = data.get("return_count", 0) or 0
        payload["buttons_clicked"] = Jsonb(data.get("buttons_clicked") or [])
        payload["cursor_hovers"] = Jsonb(data.get("cursor_hovers") or [])
        payload["technical_info"] = Jsonb(data.get("technical_info") or {})
        return payload

    @staticmethod
    def create(data: dict[str, Any], conn: Any | None = None) -> dict[str, Any]:
        payload = LeadBehaviorCRUD._payload(data, include_id=True)
        row = db.fetch_one(
            f"""
            INSERT INTO {LeadBehavior.TABLE} (
                id, time_on_page, buttons_clicked, cursor_hovers,
                return_count, technical_info
            ) VALUES (
                %(id)s, %(time_on_page)s, %(buttons_clicked)s, %(cursor_hovers)s,
                %(return_count)s, %(technical_info)s
            )
            RETURNING *
            """,
            payload,
            conn=conn,
        )
        if row is None:
            raise RuntimeError("Не удалось сохранить метрики лида.")
        return row

    @staticmethod
    def get_by_id(item_id: int, conn: Any | None = None) -> dict[str, Any] | None:
        return db.fetch_one(
            f"SELECT * FROM {LeadBehavior.TABLE} WHERE id = %(id)s",
            {"id": item_id},
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
            SELECT * FROM {LeadBehavior.TABLE}
            ORDER BY created_at DESC, id DESC
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
        for key, value in data.items():
            if key not in LeadBehavior.WRITABLE:
                continue
            if key in LeadBehavior.JSON_FIELDS:
                default: Any = {} if key == "technical_info" else []
                fields[key] = Jsonb(value if value is not None else default)
            else:
                fields[key] = value
        if not fields:
            return LeadBehaviorCRUD.get_by_id(item_id, conn=conn)
        assignments = ", ".join(f"{key} = %({key})s" for key in fields)
        fields["id"] = item_id
        return db.fetch_one(
            f"UPDATE {LeadBehavior.TABLE} SET {assignments} WHERE id = %(id)s RETURNING *",
            fields,
            conn=conn,
        )

    @staticmethod
    def delete(item_id: int, conn: Any | None = None) -> bool:
        row = db.fetch_one(
            f"DELETE FROM {LeadBehavior.TABLE} WHERE id = %(id)s RETURNING id",
            {"id": item_id},
            conn=conn,
        )
        return row is not None
