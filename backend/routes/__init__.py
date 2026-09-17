"""Роуты FastAPI, по одному модулю на модель."""

from routes.admin import router as admin_router
from routes.behavior import router as behavior_router
from routes.leads import router as leads_router

__all__ = ["admin_router", "behavior_router", "leads_router"]
