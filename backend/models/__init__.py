"""Модели таблиц. DDL лежит в докстринге каждого класса."""

from __future__ import annotations

import inspect

from models.admin import AdminConfig, AdminConfigCRUD
from models.behavior import LeadBehavior, LeadBehaviorCRUD
from models.lead import Lead, LeadCRUD

# Порядок важен: lead_behavior ссылается на leads.
MODELS = (Lead, LeadBehavior, AdminConfig)


def schema_statements() -> list[str]:
    statements: list[str] = []
    for model in MODELS:
        sql = inspect.cleandoc(model.__doc__ or "")
        if sql:
            statements.append(sql)
    return statements


__all__ = [
    "AdminConfig",
    "AdminConfigCRUD",
    "Lead",
    "LeadBehavior",
    "LeadBehaviorCRUD",
    "LeadCRUD",
    "MODELS",
    "schema_statements",
]
