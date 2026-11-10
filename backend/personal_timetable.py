"""
SSTG — Personal / Home Timetables
==================================
A standalone weekly planner for one user's own life: home chores, family
routines, work-from-home days, study, fitness, meals. No teachers, subjects or
classes involved.

BATCH 2 additions
  * assignee on every block ("who does this task")
  * a gallery of ready-made, fully editable templates (chores rota, kids'
    after-school routine, cleaning rota, meal plan, study week, …). Templates
    that involve several people spread the tasks over the names you give.
  * CSV / Excel import and CSV export, with a downloadable starter file.
"""
from __future__ import annotations
import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import Session, relationship

from database import Base, get_db
from security import get_current_user
from models import User, _uuid, _now

router = APIRouter(tags=["Personal Timetables"])


# ── Models ────────────────────────────────────────────────────────────────────

class PersonalTimetable(Base):
    __tablename__ = "personal_timetables"
    id         = Column(String(36), primary_key=True, default=_uuid)
    user_id    = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(80), nullable=False)
    kind       = Column(String(20), default="home")           # home | office | other
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    blocks = relationship("PersonalEvent", back_populates="timetable", cascade="all, delete-orphan")


class PersonalEvent(Base):
    __tablename__ = "personal_events"
    id            = Column(String(36), primary_key=True, default=_uuid)
    timetable_id  = Column(String(36), ForeignKey("personal_timetables.id", ondelete="CASCADE"), nullable=False)
    label         = Column(String(80), nullable=False)
    day           = Column(String(12), nullable=False)
    start_time    = Column(String(5),  nullable=False)
    end_time      = Column(String(5),  nullable=False)
    color_hex     = Column(String(7),  default="#38bdf8")
    notes         = Column(String(200), nullable=True)
    assignee      = Column(String(60), nullable=True)           # who is responsible
    is_recurring  = Column(Boolean, default=True)

    timetable = relationship("PersonalTimetable", back_populates="blocks")


# ── Schemas ───────────────────────────────────────────────────────────────────

DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_CHOICES = set(DAY_ORDER)
TIME_PATTERN = r"^\d{2}:\d{2}$"


class TimetableCreate(BaseModel):
    name: str
    kind: str = "home"


class TimetableUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None


class EventCreate(BaseModel):
    label: str
    day: str
    start_time: str = Field(..., pattern=TIME_PATTERN)
    end_time: str   = Field(..., pattern=TIME_PATTERN)
    color_hex: Optional[str] = "#38bdf8"
    notes: Optional[str] = None
    assignee: Optional[str] = None


class EventUpdate(BaseModel):
    label: Optional[str] = None
    day: Optional[str] = None
    start_time: Optional[str] = Field(None, pattern=TIME_PATTERN)
    end_time: Optional[str]   = Field(None, pattern=TIME_PATTERN)
    color_hex: Optional[str] = None
    notes: Optional[str] = None
    assignee: Optional[str] = None


class FromTemplate(BaseModel):
    template_id: str
    name: Optional[str] = None
    people: List[str] = []          # names the tasks are shared between


# ── Template gallery ──────────────────────────────────────────────────────────

WEEK = DAY_ORDER[:5]
ALL = DAY_ORDER
WEEKEND = DAY_ORDER[5:]


def _b(days, start, end, label, color, notes=None):
    return {"days": days, "start": start, "end": end, "label": label, "color": color, "notes": notes}


TEMPLATES = [
    {
        "id": "chores_rota", "name": "Home chores rota", "icon": "🧹", "kind": "home", "shares_tasks": True,
        "description": "Daily and weekly household jobs, shared out between everyone at home.",
        "blocks": [
            _b(ALL, "18:30", "19:15", "Cook dinner", "#f97316"),
            _b(ALL, "19:30", "20:00", "Wash dishes", "#38bdf8"),
            _b(ALL, "07:00", "07:20", "Make beds / tidy room", "#a855f7"),
            _b(["Monday", "Thursday"], "20:00", "20:15", "Take out the rubbish", "#ef4444"),
            _b(["Tuesday", "Friday"], "17:00", "17:45", "Sweep & mop floors", "#14b8a6"),
            _b(["Wednesday"], "17:30", "18:00", "Water plants / garden", "#4ade80"),
            _b(["Saturday"], "09:00", "11:00", "Laundry: wash & hang", "#ec4899"),
            _b(["Saturday"], "11:00", "12:00", "Clean bathrooms", "#0ea5e9"),
            _b(["Sunday"], "10:00", "11:00", "Iron & fold clothes", "#f59e0b"),
            _b(["Sunday"], "16:00", "17:00", "Weekly shopping list & shop", "#8b5cf6"),
        ],
    },
    {
        "id": "kids_routine", "name": "Kids' after-school routine", "icon": "🎒", "kind": "home", "shares_tasks": False,
        "description": "Homework, chores, play and bedtime — one routine for school days.",
        "blocks": [
            _b(WEEK, "16:00", "16:30", "Snack & unwind", "#f59e0b"),
            _b(WEEK, "16:30", "17:30", "Homework", "#38bdf8"),
            _b(WEEK, "17:30", "18:00", "Tidy room / school bag ready", "#a855f7"),
            _b(WEEK, "18:00", "19:00", "Play / outdoor time", "#4ade80"),
            _b(WEEK, "19:30", "20:00", "Dinner table: set & clear", "#f97316"),
            _b(WEEK, "20:00", "20:30", "Reading time", "#14b8a6"),
            _b(WEEK, "20:30", "21:00", "Bath & bedtime", "#8b5cf6"),
        ],
    },
    {
        "id": "family_week", "name": "Family weekday routine", "icon": "🏠", "kind": "home", "shares_tasks": False,
        "description": "Mornings, school run, dinner and evenings for a busy household.",
        "blocks": [
            _b(WEEK, "06:00", "06:45", "Wake up & get ready", "#38bdf8"),
            _b(WEEK, "06:45", "07:30", "Breakfast & pack lunches", "#f59e0b"),
            _b(WEEK, "07:30", "08:15", "School run", "#14b8a6"),
            _b(WEEK, "15:30", "16:15", "School pick-up", "#14b8a6"),
            _b(WEEK, "18:30", "19:30", "Family dinner", "#f97316"),
            _b(WEEK, "20:00", "21:00", "Family time", "#ec4899"),
            _b(WEEKEND, "09:00", "10:00", "Slow breakfast", "#f59e0b"),
            _b(WEEKEND, "14:00", "17:00", "Family outing / activity", "#4ade80"),
        ],
    },
    {
        "id": "cleaning_rota", "name": "Weekly deep-clean rota", "icon": "🧽", "kind": "home", "shares_tasks": True,
        "description": "One room per day so the whole house gets cleaned without a marathon.",
        "blocks": [
            _b(["Monday"], "17:00", "18:00", "Kitchen deep clean", "#f97316"),
            _b(["Tuesday"], "17:00", "18:00", "Bathrooms", "#0ea5e9"),
            _b(["Wednesday"], "17:00", "18:00", "Living room & dusting", "#a855f7"),
            _b(["Thursday"], "17:00", "18:00", "Bedrooms & bedding", "#ec4899"),
            _b(["Friday"], "17:00", "18:00", "Floors throughout", "#14b8a6"),
            _b(["Saturday"], "10:00", "11:30", "Windows, balcony & outside", "#4ade80"),
        ],
    },
    {
        "id": "meal_plan", "name": "Weekly meal plan", "icon": "🍲", "kind": "home", "shares_tasks": True,
        "description": "Breakfast, lunch and dinner slots — click a block and type the actual meal in Notes.",
        "blocks": [
            _b(ALL, "07:00", "07:30", "Breakfast", "#f59e0b"),
            _b(ALL, "12:30", "13:15", "Lunch", "#4ade80"),
            _b(ALL, "18:30", "19:30", "Dinner", "#f97316"),
            _b(["Saturday"], "09:00", "10:00", "Market / grocery run", "#8b5cf6"),
            _b(["Sunday"], "15:00", "16:30", "Batch-cook for the week", "#ef4444"),
        ],
    },
    {
        "id": "wfh_week", "name": "Work-from-home week", "icon": "💻", "kind": "office", "shares_tasks": False,
        "description": "Focus blocks, meetings, breaks and a proper finish time.",
        "blocks": [
            _b(WEEK, "08:30", "09:00", "Plan the day", "#38bdf8"),
            _b(WEEK, "09:00", "11:00", "Deep work", "#7c3aed"),
            _b(WEEK, "11:00", "11:15", "Break", "#4ade80"),
            _b(WEEK, "11:15", "12:30", "Meetings / calls", "#f59e0b"),
            _b(WEEK, "12:30", "13:30", "Lunch & walk", "#14b8a6"),
            _b(WEEK, "13:30", "15:30", "Focus work", "#7c3aed"),
            _b(WEEK, "15:30", "16:30", "Email & admin", "#38bdf8"),
            _b(["Friday"], "16:30", "17:00", "Weekly review", "#ec4899"),
        ],
    },
    {
        "id": "office_week", "name": "Office week", "icon": "🏢", "kind": "office", "shares_tasks": False,
        "description": "Commute, standup, work blocks and lunch for an office day.",
        "blocks": [
            _b(WEEK, "07:30", "08:30", "Commute", "#64748b"),
            _b(WEEK, "08:45", "09:00", "Team standup", "#f59e0b"),
            _b(WEEK, "09:00", "12:00", "Main work block", "#38bdf8"),
            _b(WEEK, "12:00", "13:00", "Lunch", "#4ade80"),
            _b(WEEK, "13:00", "16:30", "Afternoon work block", "#7c3aed"),
            _b(WEEK, "17:00", "18:00", "Commute home", "#64748b"),
        ],
    },
    {
        "id": "study_week", "name": "Study timetable", "icon": "📚", "kind": "other", "shares_tasks": False,
        "description": "Revision blocks for evenings and weekends — rename the subjects to your own.",
        "blocks": [
            _b(["Monday", "Wednesday"], "17:00", "18:30", "Maths revision", "#38bdf8"),
            _b(["Tuesday", "Thursday"], "17:00", "18:30", "Science revision", "#4ade80"),
            _b(["Friday"], "17:00", "18:00", "English reading & writing", "#a855f7"),
            _b(["Saturday"], "09:00", "11:00", "Past papers", "#ef4444"),
            _b(["Saturday"], "11:30", "12:30", "Weak-topics review", "#f59e0b"),
            _b(["Sunday"], "16:00", "17:00", "Plan next week", "#14b8a6"),
        ],
    },
    {
        "id": "fitness_week", "name": "Fitness week", "icon": "🏋️", "kind": "other", "shares_tasks": False,
        "description": "Strength, cardio and rest days — swap in your own sessions.",
        "blocks": [
            _b(["Monday", "Thursday"], "06:00", "07:00", "Strength training", "#ef4444"),
            _b(["Tuesday", "Friday"], "06:00", "06:45", "Cardio / run", "#38bdf8"),
            _b(["Wednesday"], "18:00", "19:00", "Yoga / stretching", "#a855f7"),
            _b(["Saturday"], "08:00", "09:30", "Long walk or sport", "#4ade80"),
            _b(["Sunday"], "09:00", "09:30", "Rest & plan the week", "#14b8a6"),
        ],
    },
    {
        "id": "weekend_plan", "name": "Weekend planner", "icon": "🌤️", "kind": "home", "shares_tasks": True,
        "description": "Errands, rest and something fun, so the weekend doesn't disappear.",
        "blocks": [
            _b(["Saturday"], "08:30", "10:00", "Errands", "#8b5cf6"),
            _b(["Saturday"], "10:00", "12:00", "Home projects / repairs", "#f59e0b"),
            _b(["Saturday"], "15:00", "18:00", "Fun / visit friends & family", "#ec4899"),
            _b(["Sunday"], "09:00", "12:00", "Church / community / rest", "#14b8a6"),
            _b(["Sunday"], "14:00", "16:00", "Prepare for the week", "#38bdf8"),
        ],
    },
]
_TEMPLATE_IDS = {t["id"]: t for t in TEMPLATES}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_event(e: PersonalEvent) -> dict:
    return {
        "id": e.id, "timetable_id": e.timetable_id, "label": e.label,
        "day": e.day, "start_time": e.start_time, "end_time": e.end_time,
        "color_hex": e.color_hex, "notes": e.notes, "assignee": e.assignee,
        "is_recurring": e.is_recurring,
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
        raise HTTPException(400, f"day must be one of: {', '.join(DAY_ORDER)}")


def _validate_times(start: str, end: str):
    if start >= end:
        raise HTTPException(400, "start_time must be before end_time")


def _clean_assignee(v) -> Optional[str]:
    v = (str(v).strip() if v is not None else "")
    return v[:60] or None


# ── Template endpoints ────────────────────────────────────────────────────────

@router.get("/personal-templates")
def list_templates(_: User = Depends(get_current_user)):
    return [{
        "id": t["id"], "name": t["name"], "icon": t["icon"], "kind": t["kind"],
        "description": t["description"], "shares_tasks": t["shares_tasks"],
        "block_count": sum(len(b["days"]) for b in t["blocks"]),
    } for t in TEMPLATES]


@router.post("/personal-timetables/from-template", status_code=201)
def create_from_template(data: FromTemplate, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    tpl = _TEMPLATE_IDS.get(data.template_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    people = [p.strip()[:60] for p in data.people if p and p.strip()]

    t = PersonalTimetable(user_id=user.id, name=(data.name or tpl["name"]).strip()[:80], kind=tpl["kind"])
    db.add(t)
    db.flush()

    task_no = 0
    for b in tpl["blocks"]:
        for day in b["days"]:
            who = None
            if tpl["shares_tasks"] and people:
                who = people[task_no % len(people)]   # rotate fairly in task order
                task_no += 1
            db.add(PersonalEvent(
                timetable_id=t.id, label=b["label"], day=day,
                start_time=b["start"], end_time=b["end"],
                color_hex=b["color"], notes=b["notes"], assignee=who,
            ))
    db.commit()
    db.refresh(t)
    return _fmt_timetable(t)


# ── Import / export ───────────────────────────────────────────────────────────

CSV_HEADERS = ["label", "day", "start_time", "end_time", "assignee", "color_hex", "notes"]


@router.get("/personal-import/template")
def import_template():
    """Public static starter file (a plain link cannot send an auth header)."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_HEADERS)
    w.writerow(["Wash dishes", "Monday", "19:30", "20:00", "Amina", "#38bdf8", "After dinner"])
    w.writerow(["Take out rubbish", "Thursday", "20:00", "20:15", "Brian", "#ef4444", ""])
    w.writerow(["Gym", "Saturday", "08:00", "09:00", "", "#4ade80", ""])
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="home_schedule_template.csv"'})


def _as_time(v) -> str:
    if v is None or str(v).strip() == "":
        raise ValueError("missing time")
    if hasattr(v, "strftime"):                      # Excel time/datetime cell
        return v.strftime("%H:%M")
    s = str(v).strip().replace(".", ":")
    parts = s.split(":")
    if len(parts) < 2:
        raise ValueError(f"'{s}' is not a time")
    h, m = int(parts[0]), int(parts[1][:2])
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError(f"'{s}' is not a valid time")
    return f"{h:02d}:{m:02d}"


@router.post("/personal-timetables/{timetable_id}/import")
async def import_blocks(timetable_id: str, file: UploadFile = File(...),
                        db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from import_export import _read_rows, _get   # shared CSV/XLSX reader
    t = _owned_timetable_or_404(timetable_id, user, db)
    rows = _read_rows(file, await file.read())
    if not rows:
        raise HTTPException(400, "No data rows found — the file needs a header row and at least one task")

    created, skipped, errors = 0, 0, []
    for i, row in enumerate(rows, start=2):
        try:
            label = str(_get(row, "label", "task", "activity", "name", default="")).strip()
            day = str(_get(row, "day", default="")).strip().capitalize()
            if not label:
                raise ValueError("missing label")
            if day not in DAY_CHOICES:
                raise ValueError(f"'{day}' is not a day of the week")
            start = _as_time(_get(row, "start_time", "start", "from"))
            end = _as_time(_get(row, "end_time", "end", "to"))
            if start >= end:
                raise ValueError("start must be before end")
            color = str(_get(row, "color_hex", "color", "colour", default="#38bdf8")).strip()
            if not (color.startswith("#") and len(color) == 7):
                color = "#38bdf8"
            db.add(PersonalEvent(
                timetable_id=t.id, label=label[:80], day=day, start_time=start, end_time=end,
                color_hex=color, notes=(str(_get(row, "notes", default="") or "").strip()[:200] or None),
                assignee=_clean_assignee(_get(row, "assignee", "who", "person", "owner")),
            ))
            created += 1
        except ValueError as e:
            skipped += 1
            errors.append(f"Row {i}: {e} — skipped")
    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors,
            "message": f"Imported {created} task(s)" + (f", skipped {skipped}" if skipped else "")}


@router.get("/personal-timetables/{timetable_id}/export")
def export_blocks(timetable_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    t = _owned_timetable_or_404(timetable_id, user, db)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_HEADERS)
    for e in sorted(t.blocks, key=lambda e: (DAY_ORDER.index(e.day) if e.day in DAY_ORDER else 9, e.start_time)):
        w.writerow([e.label, e.day, e.start_time, e.end_time, e.assignee or "", e.color_hex or "", e.notes or ""])
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in t.name)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe}.csv"'})


# ── Timetable & block CRUD ────────────────────────────────────────────────────

@router.get("/personal-timetables")
def list_timetables(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (db.query(PersonalTimetable)
              .filter(PersonalTimetable.user_id == user.id)
              .order_by(PersonalTimetable.created_at.desc()).all())
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
    return _fmt_timetable(_owned_timetable_or_404(timetable_id, user, db))


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
        assignee=_clean_assignee(data.assignee),
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
    _owned_timetable_or_404(e.timetable_id, user, db)

    updates = data.model_dump(exclude_unset=True)       # unset ≠ cleared: lets assignee/notes be emptied
    new_day   = updates.get("day", e.day)
    new_start = updates.get("start_time", e.start_time)
    new_end   = updates.get("end_time", e.end_time)
    if "day" in updates: _validate_day(new_day)
    if "start_time" in updates or "end_time" in updates: _validate_times(new_start, new_end)
    if "assignee" in updates:
        updates["assignee"] = _clean_assignee(updates["assignee"])
    for field, val in updates.items():
        if field in ("label", "day", "start_time", "end_time") and val is None:
            continue
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
