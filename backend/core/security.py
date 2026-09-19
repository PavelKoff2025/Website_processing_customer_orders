"""Хеширование паролей, JWT и зависимость «текущий администратор»."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_ALGORITHM = "HS256"
TOKEN_TYPE = "bearer"

_bearer = HTTPBearer(auto_error=False)


def jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET", "").strip()
    if not secret:
        raise RuntimeError("Переменная JWT_SECRET не задана.")
    return secret


def token_ttl() -> timedelta:
    hours = int(os.environ.get("JWT_EXPIRE_HOURS", "12"))
    return timedelta(hours=max(1, hours))


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("ascii"),
        )
    except (ValueError, TypeError):
        return False


def create_access_token(admin_id: int, login: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(admin_id),
        "login": login,
        "iat": now,
        "exp": now + token_ttl(),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])


def public_admin(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "login": row["login"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def token_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "access_token": create_access_token(row["id"], row["login"]),
        "token_type": TOKEN_TYPE,
        "admin": public_admin(row),
    }


def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    from models.admin_account import AdminAccountCRUD

    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(creds.credentials)
        admin_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный или истёкший токен.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    row = AdminAccountCRUD.get_by_id(admin_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Администратор не найден.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return row
