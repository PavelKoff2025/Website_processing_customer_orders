"""Группа /api/auth: проверка админов, регистрация, вход, JWT, /me."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from psycopg.errors import IntegrityError, UniqueViolation

from core.db import db
from core.security import public_admin, require_admin, token_payload, verify_password
from models.admin_account import AdminAccountCRUD
from routes.admins import AdminCredentials, AdminOut, TokenOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


class CheckOut(BaseModel):
    has_admins: bool = Field(description="True, если в базе уже есть хотя бы один администратор.")
    exists: bool = Field(description="То же, что has_admins — для совместимости с /api/auth/check.")


class VerifyOut(BaseModel):
    valid: bool = True
    admin: AdminOut


def _admins_present(conn: Any | None = None) -> bool:
    return AdminAccountCRUD.count(conn=conn) > 0


@router.get("/check", response_model=CheckOut)
def check_admins() -> dict[str, bool]:
    present = _admins_present()
    return {"has_admins": present, "exists": present}


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenOut)
def register_first_admin(payload: AdminCredentials) -> dict[str, Any]:
    try:
        with db.transaction() as conn:
            if _admins_present(conn=conn):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Регистрация закрыта: администратор уже есть.",
                )
            row = AdminAccountCRUD.create(payload.model_dump(), conn=conn)
    except HTTPException:
        raise
    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Регистрация закрыта: администратор уже есть.",
        ) from None
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Регистрация закрыта: администратор уже есть.",
        ) from None
    return token_payload(row)


@router.post("/login", response_model=TokenOut)
def login_admin(payload: AdminCredentials) -> dict[str, Any]:
    row = AdminAccountCRUD.get_by_login(payload.login)
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль.",
        )
    return token_payload(row)


@router.get("/me", response_model=AdminOut)
def current_admin(admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return public_admin(admin)


@router.get("/verify", response_model=VerifyOut)
def verify_token(admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return {"valid": True, "admin": public_admin(admin)}
