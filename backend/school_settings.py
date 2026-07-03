"""
SSTG — School Settings & User Profile API
==========================================
Manages school branding (name, badge, motto, address),
timetable display preferences, time configuration,
and admin profile photo.
"""
from __future__ import annotations
import base64, re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user
from models import User, SchoolSettings, UserProfile

router = APIRouter(tags=["School Settings"])

MAX_IMAGE_BYTES = 2 * 1024 * 1024   # 2 MB
ALLOWED_MIME    = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_settings(db: Session) -> SchoolSettings:
    s = db.query(SchoolSettings).first()
    if not s:
        s = SchoolSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _get_or_create_profile(db: Session, user_id: str) -> UserProfile:
    p = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not p:
        p = UserProfile(user_id=user_id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


# ── School Settings schemas ───────────────────────────────────────────────────

class SchoolSettingsUpdate(BaseModel):
    school_name:           Optional[str] = None
    academic_year:         Optional[str] = None
    school_motto:          Optional[str] = None
    school_email:          Optional[str] = None
    school_phone:          Optional[str] = None
    school_address:        Optional[str] = None
    country_code:          Optional[str] = None
    start_time:            Optional[str] = None   # "08:00"
    period_minutes:        Optional[int] = None
    break_after_period:    Optional[int] = None
    break_minutes:         Optional[int] = None
    lunch_after_period:    Optional[int] = None
    lunch_minutes:         Optional[int] = None
    timetable_theme:          Optional[str]  = None
    timetable_orientation:    Optional[str]  = None
    teacher_name_format:      Optional[str]  = None   # full_name|initials|short_name
    exam_include_supervisors: Optional[bool] = None
    exam_include_rooms:       Optional[bool] = None
    periods_per_day:       Optional[int] = None
    school_days:           Optional[str] = None


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    bio:          Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/school/settings")
def get_settings_api(
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    s = _get_or_create_settings(db)
    return {
        "school_name":           s.school_name,
        "academic_year":         s.academic_year,
        "school_motto":          s.school_motto,
        "school_email":          s.school_email,
        "school_phone":          s.school_phone,
        "school_address":        s.school_address,
        "country_code":          s.country_code,
        "has_badge":             bool(s.badge_data),
        "badge_url":             "/school/badge" if s.badge_data else None,
        "start_time":            s.start_time,
        "period_minutes":        s.period_minutes,
        "break_after_period":    s.break_after_period,
        "break_minutes":         s.break_minutes,
        "lunch_after_period":    s.lunch_after_period,
        "lunch_minutes":         s.lunch_minutes,
        "timetable_theme":       s.timetable_theme,
        "timetable_orientation":    s.timetable_orientation,
        "periods_per_day":          s.periods_per_day,
        "school_days":              s.school_days,
        "teacher_name_format":      getattr(s, "teacher_name_format",      "full_name"),
        "exam_include_supervisors": getattr(s, "exam_include_supervisors",  True),
        "exam_include_rooms":       getattr(s, "exam_include_rooms",        True),
    }


@router.put("/school/settings")
def update_settings_api(
    data: SchoolSettingsUpdate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    s = _get_or_create_settings(db)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(s, field, val)
    db.commit()
    return {"status": "updated"}


@router.post("/school/badge")
async def upload_badge(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    _:    User       = Depends(get_current_user),
):
    """Upload school badge/logo (max 2 MB, PNG/JPG/WEBP)."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"File type {file.content_type} not allowed. Use PNG or JPG.")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Badge file too large. Maximum 2 MB.")
    s = _get_or_create_settings(db)
    s.badge_data = base64.b64encode(data).decode()
    s.badge_mime = file.content_type
    db.commit()
    return {"status": "uploaded", "mime": file.content_type}


@router.delete("/school/badge")
def delete_badge(
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    s = _get_or_create_settings(db)
    s.badge_data = None; s.badge_mime = None
    db.commit()
    return {"status": "deleted"}


@router.get("/school/badge")
def get_badge(db: Session = Depends(get_db)):
    """Serve the school badge image (public — no auth needed for PDF headers)."""
    from fastapi.responses import Response
    s = db.query(SchoolSettings).first()
    if not s or not s.badge_data:
        raise HTTPException(404, "No badge uploaded")
    data = base64.b64decode(s.badge_data)
    return Response(content=data, media_type=s.badge_mime or "image/png")


# ── User profile ──────────────────────────────────────────────────────────────

@router.get("/profile/me")
def get_profile(
    db:      Session = Depends(get_db),
    current: User    = Depends(get_current_user),
):
    p = _get_or_create_profile(db, current.id)
    return {
        "username":     current.username,
        "email":        current.email,
        "is_admin":     current.is_admin,
        "display_name": p.display_name or current.username,
        "bio":          p.bio,
        "has_photo":    bool(p.photo_data),
        "photo_url":    f"/profile/{current.id}/photo" if p.photo_data else None,
    }


@router.put("/profile/me")
def update_profile(
    data:    UserProfileUpdate,
    db:      Session = Depends(get_db),
    current: User    = Depends(get_current_user),
):
    p = _get_or_create_profile(db, current.id)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(p, field, val)
    db.commit()
    return {"status": "updated"}


@router.post("/profile/photo")
async def upload_photo(
    file:    UploadFile = File(...),
    db:      Session    = Depends(get_db),
    current: User       = Depends(get_current_user),
):
    """Upload admin profile photo (max 2 MB, PNG/JPG)."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, "Only PNG, JPG, or WebP images are allowed.")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Photo too large — max 2 MB.")
    p = _get_or_create_profile(db, current.id)
    p.photo_data = base64.b64encode(data).decode()
    p.photo_mime = file.content_type
    db.commit()
    return {"status": "uploaded", "photo_url": f"/profile/{current.id}/photo"}


@router.get("/profile/{user_id}/photo")
def get_photo(user_id: str, db: Session = Depends(get_db)):
    """Serve a user's profile photo."""
    from fastapi.responses import Response
    p = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not p or not p.photo_data:
        raise HTTPException(404, "No photo")
    return Response(content=base64.b64decode(p.photo_data),
                    media_type=p.photo_mime or "image/png")


@router.delete("/profile/photo")
def delete_photo(
    db:      Session = Depends(get_db),
    current: User    = Depends(get_current_user),
):
    p = _get_or_create_profile(db, current.id)
    p.photo_data = None; p.photo_mime = None
    db.commit()
    return {"status": "deleted"}


# ── Time schedule helper ──────────────────────────────────────────────────────

@router.get("/school/time-schedule")
def get_time_schedule(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Return the computed time schedule for all periods, including breaks and lunch.
    Used by frontend to display actual times instead of period numbers.
    """
    s = _get_or_create_settings(db)

    start_h, start_m = map(int, s.start_time.split(":"))
    current_minutes  = start_h * 60 + start_m
    schedule         = []

    for period in range(1, s.periods_per_day + 1):
        start_str = f"{current_minutes // 60:02d}:{current_minutes % 60:02d}"
        end_min   = current_minutes + s.period_minutes
        end_str   = f"{end_min // 60:02d}:{end_min % 60:02d}"

        schedule.append({
            "period": period,
            "start":  start_str,
            "end":    end_str,
            "label":  f"P{period}  {start_str}–{end_str}",
        })

        current_minutes = end_min

        # Add break
        if period == s.break_after_period:
            bstart = f"{current_minutes // 60:02d}:{current_minutes % 60:02d}"
            current_minutes += s.break_minutes
            bend   = f"{current_minutes // 60:02d}:{current_minutes % 60:02d}"
            schedule.append({
                "period": "Break",
                "start":  bstart,
                "end":    bend,
                "label":  f"Break  {bstart}–{bend}",
                "is_break": True,
            })

        # Add lunch
        if period == s.lunch_after_period:
            lstart = f"{current_minutes // 60:02d}:{current_minutes % 60:02d}"
            current_minutes += s.lunch_minutes
            lend   = f"{current_minutes // 60:02d}:{current_minutes % 60:02d}"
            schedule.append({
                "period": "Lunch",
                "start":  lstart,
                "end":    lend,
                "label":  f"Lunch  {lstart}–{lend}",
                "is_break": True,
            })

    return {"schedule": schedule, "school_days": s.school_days.split(",")}
