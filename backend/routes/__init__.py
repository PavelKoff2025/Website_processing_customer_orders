"""Роуты FastAPI, по одному модулю на модель."""

from routes.admin import router as admin_router
from routes.admins import router as admins_router
from routes.applications import router as applications_router
from routes.auth import router as auth_router
from routes.behavior import router as behavior_router
from routes.behavior_metrics import router as behavior_metrics_router
from routes.leads import router as leads_router

__all__ = [
    "admin_router",
    "admins_router",
    "applications_router",
    "auth_router",
    "behavior_router",
    "behavior_metrics_router",
    "leads_router",
]
