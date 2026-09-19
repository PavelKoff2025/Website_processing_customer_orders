"""Роуты поведенческих метрик лида."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from core.security import require_admin
from models.behavior import LeadBehaviorCRUD
from models.lead import LeadCRUD

router = APIRouter(prefix="/api/behavior", tags=["behavior"])


class BehaviorIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    time_on_page: float = 0
    buttons_clicked: list[Any] = Field(default_factory=list)
    cursor_hovers: list[Any] = Field(default_factory=list)
    return_count: int = 0
    technical_info: dict[str, Any] = Field(default_factory=dict)


class BehaviorUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    time_on_page: float | None = None
    buttons_clicked: list[Any] | None = None
    cursor_hovers: list[Any] | None = None
    return_count: int | None = None
    technical_info: dict[str, Any] | None = None


class BehaviorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    time_on_page: float
    buttons_clicked: list[Any]
    cursor_hovers: list[Any]
    return_count: int
    technical_info: dict[str, Any]
    created_at: datetime


@router.post("", status_code=status.HTTP_201_CREATED, response_model=BehaviorOut)
def create_behavior(
    payload: BehaviorIn,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    if LeadCRUD.get_by_id(payload.id) is None:
        raise HTTPException(status_code=404, detail="Заявка для метрик не найдена.")
    if LeadBehaviorCRUD.get_by_id(payload.id) is not None:
        raise HTTPException(status_code=409, detail="Метрики для этой заявки уже есть.")
    return LeadBehaviorCRUD.create(payload.model_dump())


@router.get("", response_model=list[BehaviorOut])
def list_behavior(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    return LeadBehaviorCRUD.list_all(limit=limit, offset=offset)


@router.get("/{item_id}", response_model=BehaviorOut)
def get_behavior(
    item_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    row = LeadBehaviorCRUD.get_by_id(item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Метрики не найдены.")
    return row


@router.put("/{item_id}", response_model=BehaviorOut)
def update_behavior(
    item_id: int,
    payload: BehaviorUpdate,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    row = LeadBehaviorCRUD.update(item_id, payload.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(status_code=404, detail="Метрики не найдены.")
    return row


@router.delete("/{item_id}")
def delete_behavior(
    item_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, bool]:
    if not LeadBehaviorCRUD.delete(item_id):
        raise HTTPException(status_code=404, detail="Метрики не найдены.")
    return {"deleted": True}
