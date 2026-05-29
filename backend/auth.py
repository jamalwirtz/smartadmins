"""SSTG — Authentication routes.

Endpoints:
  POST /auth/login     — OAuth2 form login → JWT token
  POST /auth/register  — Create account → JWT token
  GET  /auth/me        — Current user info (requires token)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import RegisterRequest, TokenResponse, UserOut
from security import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   Session                   = Depends(get_db),
):
    """
    Accept username OR email address in the 'username' field.
    Returns a JWT access token on success.
    """
    if not form.username or not form.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username and password are required",
        )

    user = db.query(User).filter(
        or_(
            User.username == form.username.strip().lower(),
            User.username == form.username.strip(),        # case-sensitive fallback
            User.email    == form.username.strip().lower(),
        )
    ).first()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user.username})
    return TokenResponse(access_token=token)


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user and return an immediate JWT token."""
    # Validate username
    username = req.username.strip().lower()
    if not username or len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if not req.password or len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Username already taken")

    if req.email:
        email = req.email.strip().lower()
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(400, "Email already registered")
    else:
        email = f"{username}@local.school"

    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(req.password),
        is_admin=False,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user.username})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return current
