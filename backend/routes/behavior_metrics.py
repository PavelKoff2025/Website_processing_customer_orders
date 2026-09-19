"""Публичный приём анонимных метрик. application_id принимаем и выбрасываем."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict

from core.security import require_admin
from models.behavior_metrics import BehaviorMetricCRUD

router = APIRouter(prefix="/api/behavior-metrics", tags=["behavior-metrics"])


class BehaviorMetricsIn(BaseModel):
    """application_id остаётся в схеме, чтобы фронт ничего не менял, и никуда не идёт."""

    model_config = ConfigDict(extra="ignore")

    application_id: Any = None
    time_on_page: int | float | None = 0
    buttons_clicked: str | None = ""
    cursor_positions: str | None = ""
    return_frequency: int | float | None = 0


class BehaviorMetricsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: int
    time_on_page: int | None = 0
    buttons_clicked: str | None = ""
    cursor_positions: str | None = ""
    return_frequency: int | None = 0
    created_at: datetime | None = None


def _create(payload: BehaviorMetricsIn) -> dict[str, Any]:
    return BehaviorMetricCRUD.create(
        payload.model_dump(exclude={"application_id"}),
    )


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=BehaviorMetricsOut)
def create_behavior_metrics(payload: BehaviorMetricsIn) -> dict[str, Any]:
    return _create(payload)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=BehaviorMetricsOut,
    include_in_schema=False,
)
def create_behavior_metrics_no_slash(payload: BehaviorMetricsIn) -> dict[str, Any]:
    return _create(payload)


def _list_metrics(limit: int, skip: int, offset: int | None) -> list[dict[str, Any]]:
    start = offset if offset is not None else skip
    return BehaviorMetricCRUD.list_all(limit=limit, offset=start)


@router.get("/", response_model=list[BehaviorMetricsOut])
def list_behavior_metrics(
    limit: int = Query(default=100, ge=1, le=5000),
    skip: int = Query(default=0, ge=0),
    offset: int | None = Query(default=None, ge=0),
    _admin: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    return _list_metrics(limit, skip, offset)


@router.get("", response_model=list[BehaviorMetricsOut], include_in_schema=False)
def list_behavior_metrics_no_slash(
    limit: int = Query(default=100, ge=1, le=5000),
    skip: int = Query(default=0, ge=0),
    offset: int | None = Query(default=None, ge=0),
    _admin: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    return _list_metrics(limit, skip, offset)
