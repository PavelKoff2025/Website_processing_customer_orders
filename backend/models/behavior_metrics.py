"""Анонимные посекундные метрики главной. Без привязки к заявкам."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from core.db import db


@dataclass
class BehaviorMetric:
    """
    CREATE TABLE IF NOT EXISTS behavior_metrics (
        id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        time_on_page       INTEGER DEFAULT 0,
        buttons_clicked    TEXT DEFAULT '',
        cursor_positions   TEXT DEFAULT '',
        return_frequency   INTEGER DEFAULT 0,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """

    id: int | None = None
    time_on_page: int | None = 0
    buttons_clicked: str | None = ""
    cursor_positions: str | None = ""
    return_frequency: int | None = 0
    created_at: datetime | None = None

    TABLE = "behavior_metrics"
    WRITABLE = (
        "time_on_page",
        "buttons_clicked",
        "cursor_positions",
        "return_frequency",
    )
    MIGRATE = (
        """
        ALTER TABLE behavior_metrics
            DROP CONSTRAINT IF EXISTS behavior_metrics_application_id_fkey
        """,
        """
        ALTER TABLE behavior_metrics
            DROP CONSTRAINT IF EXISTS behavior_metrics_application_id_key
        """,
        "DROP INDEX IF EXISTS behavior_metrics_application_id_key",
        "DROP INDEX IF EXISTS behavior_metrics_application_id_idx",
        "ALTER TABLE behavior_metrics DROP COLUMN IF EXISTS application_id",
        "ALTER TABLE behavior_metrics ALTER COLUMN time_on_page DROP NOT NULL",
        "ALTER TABLE behavior_metrics ALTER COLUMN buttons_clicked DROP NOT NULL",
        "ALTER TABLE behavior_metrics ALTER COLUMN cursor_positions DROP NOT NULL",
        "ALTER TABLE behavior_metrics ALTER COLUMN return_frequency DROP NOT NULL",
    )


class BehaviorMetricCRUD:
    """Только append: каждый POST — новая строка, без уникальности и FK."""

    @staticmethod
    def _payload(data: dict[str, Any]) -> dict[str, Any]:
        time_on_page = data.get("time_on_page")
        return_frequency = data.get("return_frequency")
        return {
            "time_on_page": int(time_on_page or 0),
            "buttons_clicked": str(data.get("buttons_clicked") or ""),
            "cursor_positions": str(data.get("cursor_positions") or ""),
            "return_frequency": int(return_frequency or 0),
        }

    @staticmethod
    def create(data: dict[str, Any], conn: Any | None = None) -> dict[str, Any]:
        payload = BehaviorMetricCRUD._payload(data)
        row = db.fetch_one(
            f"""
            INSERT INTO {BehaviorMetric.TABLE} (
                time_on_page, buttons_clicked, cursor_positions, return_frequency
            ) VALUES (
                %(time_on_page)s, %(buttons_clicked)s, %(cursor_positions)s,
                %(return_frequency)s
            )
            RETURNING *
            """,
            payload,
            conn=conn,
        )
        if row is None:
            raise RuntimeError("Не удалось сохранить поведенческие метрики.")
        return row

    @staticmethod
    def list_all(
        limit: int = 500,
        offset: int = 0,
        conn: Any | None = None,
    ) -> list[dict[str, Any]]:
        return db.fetch_all(
            f"""
            SELECT * FROM {BehaviorMetric.TABLE}
            ORDER BY created_at DESC, id DESC
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            {"limit": limit, "offset": offset},
            conn=conn,
        )
