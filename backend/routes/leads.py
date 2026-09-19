"""Роуты заявок: приём единого пакета лида и CRUD по таблице leads."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from core.security import require_admin
from models.behavior import LeadBehaviorCRUD
from models.lead import LeadCRUD

router = APIRouter(prefix="/api/leads", tags=["leads"])


class MetricsIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    time_on_page: float = 0
    buttons_clicked: list[Any] = Field(default_factory=list)
    cursor_hovers: list[Any] = Field(default_factory=list)
    return_count: int = 0
    technical_info: dict[str, Any] = Field(default_factory=dict)


class LeadIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

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
    metrics: MetricsIn | None = None


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str | None = None
    last_name: str | None = None
    patronymic: str | None = None
    phone: str | None = None
    email: str | None = None
    business_info: str | None = None
    niche: str | None = None
    company_size: str | None = None
    business_size: str | None = None
    task_volume: str | None = None
    need_volume: str | None = None
    task_type: str | None = None
    product: str | None = None
    budget: str | None = None
    role: str | None = None
    result_deadline: str | None = None
    preferred_contact: str | None = None
    convenient_time: str | None = None
    comments: str | None = None


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    patronymic: str
    phone: str
    email: str
    business_info: str
    niche: str
    company_size: str
    business_size: str
    task_volume: str
    need_volume: str
    task_type: str
    product: str
    budget: str
    role: str
    result_deadline: str
    preferred_contact: str
    convenient_time: str
    comments: str
    created_at: datetime


class LeadPackageOut(BaseModel):
    lead: LeadOut
    metrics: dict[str, Any] | None = None


@router.post("", status_code=status.HTTP_201_CREATED, response_model=LeadPackageOut)
def create_lead(payload: LeadIn) -> dict[str, Any]:
    body = payload.model_dump()
    metrics = body.pop("metrics", None)
    return LeadCRUD.create_with_behavior(body, metrics)


@router.get("", response_model=list[LeadOut])
def list_leads(
    limit: int = Query(default=100, ge=1, le=5000),
    skip: int = Query(default=0, ge=0),
    offset: int | None = Query(default=None, ge=0),
    _admin: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    start = offset if offset is not None else skip
    return LeadCRUD.list_all(limit=limit, offset=start)


@router.get("/{lead_id}", response_model=LeadPackageOut)
def get_lead(
    lead_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    lead = LeadCRUD.get_by_id(lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена.")
    return {"lead": lead, "metrics": LeadBehaviorCRUD.get_by_id(lead_id)}


@router.put("/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    row = LeadCRUD.update(lead_id, payload.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена.")
    return row


@router.delete("/{lead_id}")
def delete_lead(
    lead_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, bool]:
    if not LeadCRUD.delete(lead_id):
        raise HTTPException(status_code=404, detail="Заявка не найдена.")
    return {"deleted": True}
