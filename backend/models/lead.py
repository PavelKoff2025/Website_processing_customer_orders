"""Заявка тёплого клиента: контакт, бизнес, бюджет, связь, комментарий."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from core.db import db


@dataclass
class Lead:
    """
    CREATE TABLE IF NOT EXISTS leads (
        id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        first_name         TEXT NOT NULL DEFAULT '',
        last_name          TEXT NOT NULL DEFAULT '',
        patronymic         TEXT NOT NULL DEFAULT '',
        phone              TEXT NOT NULL DEFAULT '',
        email              TEXT NOT NULL DEFAULT '',
        business_info      TEXT NOT NULL DEFAULT '',
        niche              TEXT NOT NULL DEFAULT '',
        company_size       TEXT NOT NULL DEFAULT '',
        business_size      TEXT NOT NULL DEFAULT '',
        task_volume        TEXT NOT NULL DEFAULT '',
        need_volume        TEXT NOT NULL DEFAULT '',
        task_type          TEXT NOT NULL DEFAULT '',
        product            TEXT NOT NULL DEFAULT '',
        budget             TEXT NOT NULL DEFAULT '',
        role               TEXT NOT NULL DEFAULT '',
        result_deadline    TEXT NOT NULL DEFAULT '',
        preferred_contact  TEXT NOT NULL DEFAULT '',
        convenient_time    TEXT NOT NULL DEFAULT '',
        comments           TEXT NOT NULL DEFAULT '',
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """

    id: int | None = None
    first_name: str = ""
    last_name: str = ""
    patronymic: str = ""
    phone: str = ""
    email: str = ""
    business_info: str = ""
    niche: str = ""
    company_size: str = ""
    business_size: str = ""
    task_volume: str = ""
    need_volume: str = ""
    task_type: str = ""
    product: str = ""
    budget: str = ""
    role: str = ""
    result_deadline: str = ""
    preferred_contact: str = ""
    convenient_time: str = ""
    comments: str = ""
    created_at: datetime | None = None

    TABLE = "leads"
    WRITABLE = (
        "first_name",
        "last_name",
        "patronymic",
        "phone",
        "email",
        "business_info",
        "niche",
        "company_size",
        "business_size",
        "task_volume",
        "need_volume",
        "task_type",
        "product",
        "budget",
        "role",
        "result_deadline",
        "preferred_contact",
        "convenient_time",
        "comments",
    )


class LeadCRUD:
    """Набор функций для записи и чтения заявок."""

    @staticmethod
    def create(data: dict[str, Any], conn: Any | None = None) -> dict[str, Any]:
        payload = {key: data.get(key, "") for key in Lead.WRITABLE}
        columns = ", ".join(Lead.WRITABLE)
        values = ", ".join(f"%({key})s" for key in Lead.WRITABLE)
        row = db.fetch_one(
            f"INSERT INTO {Lead.TABLE} ({columns}) VALUES ({values}) RETURNING *",
            payload,
            conn=conn,
        )
        if row is None:
            raise RuntimeError("Не удалось создать заявку.")
        return row

    @staticmethod
    def create_with_behavior(
        lead_data: dict[str, Any],
        behavior_data: dict[str, Any] | None,
    ) -> dict[str, Any]:
        from models.behavior import LeadBehaviorCRUD

        with db.transaction() as conn:
            lead = LeadCRUD.create(lead_data, conn=conn)
            metrics = None
            if behavior_data is not None:
                metrics = LeadBehaviorCRUD.create(
                    {**behavior_data, "id": lead["id"]},
                    conn=conn,
                )
        return {"lead": lead, "metrics": metrics}

    @staticmethod
    def get_by_id(lead_id: int, conn: Any | None = None) -> dict[str, Any] | None:
        return db.fetch_one(
            f"SELECT * FROM {Lead.TABLE} WHERE id = %(id)s",
            {"id": lead_id},
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
            SELECT * FROM {Lead.TABLE}
            ORDER BY created_at DESC, id DESC
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            {"limit": limit, "offset": offset},
            conn=conn,
        )

    @staticmethod
    def update(
        lead_id: int,
        data: dict[str, Any],
        conn: Any | None = None,
    ) -> dict[str, Any] | None:
        fields = {key: value for key, value in data.items() if key in Lead.WRITABLE}
        if not fields:
            return LeadCRUD.get_by_id(lead_id, conn=conn)
        assignments = ", ".join(f"{key} = %({key})s" for key in fields)
        fields["id"] = lead_id
        return db.fetch_one(
            f"UPDATE {Lead.TABLE} SET {assignments} WHERE id = %(id)s RETURNING *",
            fields,
            conn=conn,
        )

    @staticmethod
    def delete(lead_id: int, conn: Any | None = None) -> bool:
        row = db.fetch_one(
            f"DELETE FROM {Lead.TABLE} WHERE id = %(id)s RETURNING id",
            {"id": lead_id},
            conn=conn,
        )
        return row is not None
