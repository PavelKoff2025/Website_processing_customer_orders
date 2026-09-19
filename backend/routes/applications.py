"""Чтение заявок как /api/applications — тот же список, что leads, skip/limit как в метриках."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import require_admin
from models.behavior import LeadBehaviorCRUD
from models.lead import LeadCRUD
from routes.leads import LeadOut, LeadPackageOut

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _list(limit: int, skip: int, offset: int | None) -> list[dict[str, Any]]:
    start = offset if offset is not None else skip
    return LeadCRUD.list_all(limit=limit, offset=start)


@router.get("/", response_model=list[LeadOut])
def list_applications(
    limit: int = Query(default=100, ge=1, le=5000),
    skip: int = Query(default=0, ge=0),
    offset: int | None = Query(default=None, ge=0),
    _admin: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    return _list(limit, skip, offset)


@router.get("", response_model=list[LeadOut], include_in_schema=False)
def list_applications_no_slash(
    limit: int = Query(default=100, ge=1, le=5000),
    skip: int = Query(default=0, ge=0),
    offset: int | None = Query(default=None, ge=0),
    _admin: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    return _list(limit, skip, offset)


@router.get("/{application_id}", response_model=LeadPackageOut)
def get_application(
    application_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    lead = LeadCRUD.get_by_id(application_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена.")
    return {"lead": lead, "metrics": LeadBehaviorCRUD.get_by_id(application_id)}
