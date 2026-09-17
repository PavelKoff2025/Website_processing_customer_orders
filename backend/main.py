"""
Точка сборки приватного API.

Слушает 0.0.0.0:8000 только внутри docker-сетей. В compose порт не
публикуется (`expose`, не `ports`), снаружи запросы приходят лишь через Nginx /api/.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from core.db import db
from models import schema_statements
from models.admin import AdminConfigCRUD
from routes import admin_router, behavior_router, leads_router

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.connect()
    db.init_schema(schema_statements())
    AdminConfigCRUD.seed_defaults()
    yield
    db.close()


app = FastAPI(
    title="Autello Backend",
    description="Закрытый контур приёма заявок. Доступ к БД только отсюда.",
    lifespan=lifespan,
    redirect_slashes=False,
    docs_url=None,
    redoc_url=None,
    openapi_url="/openapi.json",
)

app.include_router(leads_router)
app.include_router(behavior_router)
app.include_router(admin_router)


@app.get("/docs", include_in_schema=False)
def swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="Autello Backend - Swagger UI",
        swagger_js_url="/static/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui.css",
    )


@app.get("/redoc", include_in_schema=False)
def redoc_ui() -> HTMLResponse:
    return get_redoc_html(
        openapi_url="/openapi.json",
        title="Autello Backend - ReDoc",
        redoc_js_url="/static/redoc.standalone.js",
        with_google_fonts=False,
    )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/healthz", tags=["system"])
def healthz() -> dict[str, str]:
    if not db.ping():
        raise HTTPException(status_code=503, detail="postgres_unavailable")
    return {"status": "ok"}
