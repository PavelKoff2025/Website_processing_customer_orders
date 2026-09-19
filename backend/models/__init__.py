"""Модели таблиц. DDL лежит в докстринге каждого класса."""

from __future__ import annotations

import inspect

from models.admin import AdminConfig, AdminConfigCRUD
from models.admin_account import AdminAccount, AdminAccountCRUD
from models.behavior import LeadBehavior, LeadBehaviorCRUD
from models.behavior_metrics import BehaviorMetric, BehaviorMetricCRUD
from models.lead import Lead, LeadCRUD

# Порядок важен: lead_behavior ссылается на leads.
MODELS = (Lead, LeadBehavior, BehaviorMetric, AdminConfig, AdminAccount)


def schema_statements() -> list[str]:
    statements: list[str] = []
    for model in MODELS:
        sql = inspect.cleandoc(model.__doc__ or "")
        if sql:
            statements.append(sql)
        for extra in getattr(model, "MIGRATE", ()):
            text = inspect.cleandoc(extra)
            if text:
                statements.append(text)
    return statements


__all__ = [
    "AdminAccount",
    "AdminAccountCRUD",
    "AdminConfig",
    "AdminConfigCRUD",
    "BehaviorMetric",
    "BehaviorMetricCRUD",
    "Lead",
    "LeadBehavior",
    "LeadBehaviorCRUD",
    "LeadCRUD",
    "MODELS",
    "schema_statements",
]
