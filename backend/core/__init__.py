"""Драйвер PostgreSQL и служебные утилиты контура."""

from core.db import db
from core.security import require_admin

__all__ = ["db", "require_admin"]
