"""
SSTG — Personal Timetables (secondary feature)
=================================================
A lightweight, standalone scheduling tool for a single user's own week —
home routines, office blocks, gym times, family pickups — with no teachers,
subjects, or classes involved. Deliberately kept separate from the school
scheduler's TimetableDraft/TimetableSlot tables, which are shaped around
class/teacher/subject relationships that don't apply here.

Each user can have multiple named personal timetables (e.g. "Home routine",
"Work week"), each containing free-form time blocks: a label, a colour, a
day, and a start/end time. No conflict engine, no generation — the user
places blocks directly, like a simple calendar grid.
"""
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Session, relationship

from database import Base, get_db
from security import get_current_user
from models import User, _uuid, _now

router = APIRouter(tags=["Personal Timetables"])


# ── Models (defined here, not models.py, since this is a self-contained
#    secondary feature — keeps the school-scheduler models.py focused) ───────

class PersonalTimetable(Base):
    __tablename__ = "personal_timetables"
    id         = Column(String(36), primary_key=True, default=_uuid)
    user_id    = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(80), nullable=False)          # "Home routine", "Office week"
    kind       = Column(String(20), default="home")           # home | office | other — display hint only
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    blocks = relationship("PersonalEvent", back_populates="timetable", cascade="all, delete-orphan")


class PersonalEvent(Base):
    __tablename__ = "personal_events"
    id            = Column(String(36), primary_key=True, default=_uuid)
    timetable_id  = Column(String(36), ForeignKey("personal_timetables.id", ondelete="CASCADE"), nullable=False)
    label         = Column(String(80), nullable=False)        # free text: "Gym", "Standup", "Kids pickup"
    day           = Column(String(12), nullable=False)        # "Monday".."Sunday"
    start_time    = Column(String(5),  nullable=False)        # "07:30"
    end_time      = Column(String(5),  nullable=False)        # "08:15"
    color_hex     = Column(String(7),  default="#38bdf8")
    notes         = Column(String(200), nullable=True)
    is_recurring  = Column(Boolean, default=True)              # every week vs one-off (future use)

    timetable = relationship("PersonalTimetable", back_populates="blocks")


# ── Schemas ───────────────────────────────────────────────────────────────────

DAY_CHOICES = {"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"}


class TimetableCreate(BaseModel):
    name: str
    kind: str = "home"   # home | office | other


class TimetableUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None


class EventCreate(BaseModel):
    label: str
    day: str
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str   = Field(..., pattern=r"^\d{2}:\d{2}$")
    color_hex: Optional[str] = "#38bdf8"
    notes: Optional[str] = None


class EventUpdate(BaseModel):
    label: Optional[str] = None
    day: Optional[str] = None
    start_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    end_time: Optional[str]   = Field(None, pattern=r"^\d{2}:\d{2}$")
    color_hex: Optional[str] = None
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_event(e: PersonalEvent) -> dict:
    return {
        "id": e.id, "timetable_id": e.timetable_id, "label": e.label,
        "day": e.day, "start_time": e.start_time, "end_time": e.end_time,
        "color_hex": e.color_hex, "notes": e.notes, "is_recurring": e.is_recurring,
    }


def _fmt_timetable(t: PersonalTimetable) -> dict:
    return {
        "id": t.id, "name": t.name, "kind": t.kind,
        "created_at": t.created_at.isoformat(),
        "block_count": len(t.blocks),
        "blocks": [_fmt_event(e) for e in t.blocks],
    }


def _owned_timetable_or_404(timetable_id: str, user: User, db: Session) -> PersonalTimetable:
    t = db.query(PersonalTimetable).filter(
        PersonalTimetable.id == timetable_id,
        PersonalTimetable.user_id == user.id,
    ).first()
    if not t:
        raise HTTPException(404, "Personal timetable not found")
    return t


def _validate_day(day: str):
    if day not in DAY_CHOICES:
        raise HTTPException(400, f"day must be one of: {', '.join(sorted(DAY_CHOICES))}")


def _validate_times(start: str, end: str):
    if start >= end:
        raise HTTPException(400, "start_time must be before end_time")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/personal-timetables")
def list_timetables(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (db.query(PersonalTimetable)
              .filter(PersonalTimetable.user_id == user.id)
              .order_by(PersonalTimetable.created_at.desc())
              .all())
    return [_fmt_timetable(t) for t in rows]


@router.post("/personal-timetables", status_code=201)
def create_timetable(data: TimetableCreate, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    if data.kind not in ("home", "office", "other"):
        raise HTTPException(400, "kind must be 'home', 'office', or 'other'")
    t = PersonalTimetable(user_id=user.id, name=data.name.strip(), kind=data.kind)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _fmt_timetable(t)


@router.get("/personal-timetables/{timetable_id}")
def get_timetable(timetable_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    t = _owned_timetable_or_404(timetable_id, user, db)
    return _fmt_timetable(t)


@router.put("/personal-timetables/{timetable_id}")
def update_timetable(timetable_id: str, data: TimetableUpdate,
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _owned_timetable_or_404(timetable_id, user, db)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(t, field, val)
    db.commit()
    return _fmt_timetable(t)


@router.delete("/personal-timetables/{timetable_id}")
def delete_timetable(timetable_id: str, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    t = _owned_timetable_or_404(timetable_id, user, db)
    db.delete(t)
    db.commit()
    return {"status": "deleted"}


@router.post("/personal-timetables/{timetable_id}/blocks", status_code=201)
def add_block(timetable_id: str, data: EventCreate, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    t = _owned_timetable_or_404(timetable_id, user, db)
    _validate_day(data.day)
    _validate_times(data.start_time, data.end_time)

    e = PersonalEvent(
        timetable_id=t.id, label=data.label.strip(), day=data.day,
        start_time=data.start_time, end_time=data.end_time,
        color_hex=data.color_hex or "#38bdf8", notes=data.notes,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _fmt_event(e)


@router.put("/personal-blocks/{block_id}")
def update_block(block_id: str, data: EventUpdate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    e = db.query(PersonalEvent).filter(PersonalEvent.id == block_id).first()
    if not e:
        raise HTTPException(404, "Block not found")
    # Ownership check via parent timetable
    _owned_timetable_or_404(e.timetable_id, user, db)

    updates = data.model_dump(exclude_none=True)
    new_day   = updates.get("day", e.day)
    new_start = updates.get("start_time", e.start_time)
    new_end   = updates.get("end_time", e.end_time)
    if "day" in updates: _validate_day(new_day)
    if "start_time" in updates or "end_time" in updates: _validate_times(new_start, new_end)

    for field, val in updates.items():
        setattr(e, field, val)
    db.commit()
    return _fmt_event(e)


@router.delete("/personal-blocks/{block_id}")
def delete_block(block_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    e = db.query(PersonalEvent).filter(PersonalEvent.id == block_id).first()
    if not e:
        raise HTTPException(404, "Block not found")
    _owned_timetable_or_404(e.timetable_id, user, db)
    db.delete(e)
    db.commit()
    return {"status": "deleted"}
