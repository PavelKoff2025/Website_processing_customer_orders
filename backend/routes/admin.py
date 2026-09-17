"""Роуты админ-конфига: услуги и диапазон бюджета для интерфейса."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from models.admin import AdminConfigCRUD

router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    services: list[Any] = Field(default_factory=list)
    budget_min: str = "0"
    budget_max: str = "0"


class AdminUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    services: list[Any] | None = None
    budget_min: str | None = None
    budget_max: str | None = None


class AdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    services: list[Any]
    budget_min: str
    budget_max: str
    updated_at: datetime


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AdminOut)
def create_admin(payload: AdminIn) -> dict[str, Any]:
    return AdminConfigCRUD.create(payload.model_dump())


@router.get("/current", response_model=AdminOut)
def get_current_admin() -> dict[str, Any]:
    row = AdminConfigCRUD.get_current()
    if row is None:
        raise HTTPException(status_code=404, detail="Админ-конфиг ещё не задан.")
    return row


@router.get("", response_model=list[AdminOut])
def list_admin(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    return AdminConfigCRUD.list_all(limit=limit, offset=offset)


@router.get("/{item_id}", response_model=AdminOut)
def get_admin(item_id: int) -> dict[str, Any]:
    row = AdminConfigCRUD.get_by_id(item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Админ-конфиг не найден.")
    return row


@router.put("/{item_id}", response_model=AdminOut)
def update_admin(item_id: int, payload: AdminUpdate) -> dict[str, Any]:
    row = AdminConfigCRUD.update(item_id, payload.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(status_code=404, detail="Админ-конфиг не найден.")
    return row


@router.delete("/{item_id}")
def delete_admin(item_id: int) -> dict[str, bool]:
    if not AdminConfigCRUD.delete(item_id):
        raise HTTPException(status_code=404, detail="Админ-конфиг не найден.")
    return {"deleted": True}
