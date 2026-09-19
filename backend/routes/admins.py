"""Роуты учёток администраторов: регистрация первого, вход, JWT и CRUD."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.security import public_admin, require_admin
from models.admin_account import AdminAccountCRUD

router = APIRouter(prefix="/api/admins", tags=["admins"])

LOGIN_MIN = 3
LOGIN_MAX = 64
PASSWORD_MIN = 8
PASSWORD_MAX = 128


def _clean_login(value: str) -> str:
    login = AdminAccountCRUD.normalize_login(value)
    if len(login) < LOGIN_MIN or len(login) > LOGIN_MAX:
        raise ValueError(f"Логин: от {LOGIN_MIN} до {LOGIN_MAX} символов.")
    if not all(ch.isalnum() or ch in "._-" for ch in login):
        raise ValueError("Логин: только латиница, цифры, точка, дефис и подчёркивание.")
    return login


def _clean_password(value: str) -> str:
    password = (value or "").strip()
    if len(password) < PASSWORD_MIN or len(password) > PASSWORD_MAX:
        raise ValueError(f"Пароль: от {PASSWORD_MIN} до {PASSWORD_MAX} символов.")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Пароль слишком длинный для хеширования.")
    return password


class AdminCredentials(BaseModel):
    model_config = ConfigDict(extra="ignore")

    login: str
    password: str

    @field_validator("login")
    @classmethod
    def validate_login(cls, value: str) -> str:
        return _clean_login(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _clean_password(value)


class AdminUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    login: str | None = None
    password: str | None = None

    @field_validator("login")
    @classmethod
    def validate_login(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _clean_login(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return _clean_password(value)


class AdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str
    created_at: datetime
    updated_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminOut


class StatusOut(BaseModel):
    has_admins: bool = Field(description="True, если в базе уже есть хотя бы один администратор.")


@router.get("/status", response_model=StatusOut, deprecated=True)
def admins_status() -> dict[str, bool]:
    """Совместимость. Актуальный путь: GET /api/auth/check."""
    return {"has_admins": AdminAccountCRUD.count() > 0}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AdminOut)
def create_admin(
    payload: AdminCredentials,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    if AdminAccountCRUD.get_by_login(payload.login) is not None:
        raise HTTPException(status_code=409, detail="Такой логин уже занят.")
    return public_admin(AdminAccountCRUD.create(payload.model_dump()))


@router.get("", response_model=list[AdminOut])
def list_admins(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    return [public_admin(row) for row in AdminAccountCRUD.list_all(limit=limit, offset=offset)]


@router.get("/{item_id}", response_model=AdminOut)
def get_admin(
    item_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    row = AdminAccountCRUD.get_by_id(item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Администратор не найден.")
    return public_admin(row)


@router.put("/{item_id}", response_model=AdminOut)
def update_admin(
    item_id: int,
    payload: AdminUpdate,
    _admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    if data.get("login"):
        existing = AdminAccountCRUD.get_by_login(data["login"])
        if existing is not None and existing["id"] != item_id:
            raise HTTPException(status_code=409, detail="Такой логин уже занят.")
    row = AdminAccountCRUD.update(item_id, data)
    if row is None:
        raise HTTPException(status_code=404, detail="Администратор не найден.")
    return public_admin(row)


@router.delete("/{item_id}")
def delete_admin(
    item_id: int,
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, bool]:
    if admin["id"] == item_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить собственную учётную запись.")
    if AdminAccountCRUD.count() <= 1:
        raise HTTPException(status_code=400, detail="Нельзя удалить последнего администратора.")
    if not AdminAccountCRUD.delete(item_id):
        raise HTTPException(status_code=404, detail="Администратор не найден.")
    return {"deleted": True}
