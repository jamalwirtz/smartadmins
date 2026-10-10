"""
SSTG – Security: JWT tokens + password hashing.

Python 3.14 compatible — NO passlib, NO python-jose.
Uses:
  bcrypt>=4.2.0   — direct password hashing (passlib dropped: broken on 3.13+)
  PyJWT>=2.9.0    — JWT encode/decode      (python-jose dropped: unmaintained, CVEs)
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db

logger = logging.getLogger(__name__)
settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

_DEFAULT_SECRET = "change-me-run-openssl-rand-hex-32"

if settings.SECRET_KEY == _DEFAULT_SECRET:
    # HARDENING: this used to fail silently — the app would start and sign
    # real JWTs with a secret published in this repo's own source code,
    # meaning anyone who read config.py could forge a valid admin token.
    # This doesn't block startup (so local dev / first run still works) but
    # makes the risk impossible to miss in logs.
    logger.warning(
        "=" * 70 + "\n"
        "SECURITY WARNING: SECRET_KEY is still the default placeholder.\n"
        "Every JWT this server issues can be forged by anyone who has read\n"
        "the source code. Set a real SECRET_KEY (e.g. `openssl rand -hex 32`)\n"
        "as an environment variable before using this in production.\n"
        + "=" * 70
    )


# ── Password hashing (bcrypt direct) ─────────────────────────────────────────

# Rounds pinned explicitly at 12 — bcrypt's own default is also 12, but
# pinning it here documents that this is a deliberate choice (cost factor
# directly trades login latency for brute-force resistance) rather than an
# accident of whatever the installed bcrypt version defaults to.
_BCRYPT_ROUNDS = 12

def hash_password(plain: str) -> str:
    """Hash a plaintext password using bcrypt. Returns a UTF-8 string."""
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ── JWT tokens (PyJWT) ────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT.
    Uses timezone-aware UTC (datetime.now(timezone.utc)) — compatible with Python 3.14.
    The older datetime.utcnow() is deprecated since Python 3.12.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    # PyJWT 2.x: jwt.encode() always returns str (not bytes)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """
    Decode and verify a JWT. Raises InvalidTokenError on failure.
    Separated so websockets.py can reuse it without a DB dependency.
    """
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"require": ["exp", "sub"]},  # enforce mandatory claims
    )


# ── FastAPI dependencies ──────────────────────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Resolve JWT → User ORM object. Raises 401 on any failure."""
    from models import User

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        if not username:
            raise credentials_exc
    except InvalidTokenError:
        raise credentials_exc

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise credentials_exc
    return user


def require_admin(current_user=Depends(get_current_user)):
    """Dependency that further requires is_admin=True."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
