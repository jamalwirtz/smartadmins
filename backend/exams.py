"""
SSTG — Exam scheduling API
===========================
Manages exam sessions, papers per subject, and generates conflict-free,
load-balanced exam timetables across REAL CALENDAR DATES.

Why this file was rewritten (root causes of "exam timetable fails to run"):
  1. Slots only knew weekday NAMES, so a session could never hold more than
     5 days of exams — the usual 18+ papers per class hit "all days are full"
     and the whole generate call was rejected (409, nothing saved).
  2. Every selected subject was paired with EVERY selected class, so Grade 7
     classes were being given Grade 8 Chemistry papers, inflating the load.
  3. Generation was all-or-nothing and gave no warning beforehand.

Now: dates come from the session's start/end dates (filtered to the exam
days), subjects are matched to classes by their allocations (or grade/
curriculum), what fits is saved and anything that doesn't is reported, and a
/preflight endpoint tells the admin what will happen BEFORE they generate.
Supervisors and rooms can be auto-assigned without double-booking.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user
from models import (
    ExamSession, ExamPaper, ExamSlot, ClassAllocation,
    Subject, ClassSection, Supervisor, Room, User,
)

router = APIRouter(tags=["Exams"])

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ── Schemas ───────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name:        str
    description: Optional[str] = None
    start_date:  str = Field(..., example="2026-10-19")
    end_date:    str = Field(..., example="2026-10-30")


class SessionUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    start_date:  Optional[str] = None
    end_date:    Optional[str] = None
    status:      Optional[str] = None  # draft | published | completed


class PaperCreate(BaseModel):
    paper_number:     int  = Field(..., ge=1, le=6)
    duration_minutes: int  = Field(120, ge=30, le=300)
    is_practical:     bool = False


class PaperUpdate(BaseModel):
    duration_minutes: Optional[int]  = Field(None, ge=30, le=300)
    is_practical:     Optional[bool] = None


class SlotCreate(BaseModel):
    paper_id:       str
    class_id:       str
    day:            Optional[str] = None
    exam_date:      Optional[str] = None
    period:         int  = Field(..., ge=1)
    invigilator_id: Optional[str] = None
    room:           Optional[str] = None
    room_id:        Optional[str] = None
    notes:          Optional[str] = None


class SlotUpdate(BaseModel):
    day:            Optional[str] = None
    exam_date:      Optional[str] = None
    period:         Optional[int] = Field(None, ge=1)
    invigilator_id: Optional[str] = None
    room:           Optional[str] = None
    room_id:        Optional[str] = None
    is_locked:      Optional[bool] = None
    notes:          Optional[str] = None


class GenerateRequest(BaseModel):
    subject_ids:  List[str] = Field(..., min_length=1)
    class_ids:    List[str] = Field(..., min_length=1)
    start_period: int  = Field(1, ge=1)
    max_period:   int  = Field(8, ge=1, le=16)       # last usable period in a day
    max_per_day:  int  = Field(1, ge=1, le=6)        # exams per class per day
    school_days:  List[str] = Field(
        default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    )
    exclude_dates: List[str] = []                    # holidays / days off, YYYY-MM-DD
    clear_existing: bool = False                     # wipe unlocked slots first (re-generate)
    auto_assign_supervisors: bool = False
    auto_assign_rooms:       bool = False
    # Accepted for backwards compatibility with the old dialog; ignored.
    include_supervisors: bool = True
    include_rooms:       bool = True


# ── helpers ───────────────────────────────────────────────────────────────────

def _norm(v: Optional[str]) -> str:
    return (v or "").strip().lower()


def _session_or_404(session_id: str, db: Session) -> ExamSession:
    s = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Exam session not found")
    return s


def _slot_or_404(slot_id: str, db: Session) -> ExamSlot:
    s = db.query(ExamSlot).filter(ExamSlot.id == slot_id).first()
    if not s:
        raise HTTPException(404, "Slot not found")
    return s


def _parse_date(value: str, label: str = "date") -> date:
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        raise HTTPException(400, f"{label} must be a valid date in YYYY-MM-DD format")


def _weekday_name(iso: str) -> str:
    return WEEKDAYS[_parse_date(iso).weekday()]


def _exam_dates(session: ExamSession, school_days: List[str], exclude: List[str]) -> List[date]:
    start = _parse_date(session.start_date, "Session start date")
    end   = _parse_date(session.end_date, "Session end date")
    if end < start:
        raise HTTPException(400, "Session end date is before its start date")
    if (end - start).days > 366:
        raise HTTPException(400, "An exam session can span at most one year")
    wanted, skip = set(school_days), set(exclude)
    out, d = [], start
    while d <= end:
        if d.strftime("%A") in wanted and d.isoformat() not in skip:
            out.append(d)
        d += timedelta(days=1)
    return out


def _sync_room_name(slot: ExamSlot, db: Session) -> None:
    """Keep the plain-text `room` column in step with the room_id selection
    (exports read the string)."""
    if slot.room_id:
        room = db.query(Room).filter(Room.id == slot.room_id).first()
        if room:
            slot.room = room.name


def _when(slot: ExamSlot) -> str:
    """Key identifying the calendar day of a slot (date if known, else weekday name)."""
    return slot.exam_date or slot.day


def _format_session(s: ExamSession) -> dict:
    return {
        "id":          s.id,
        "name":        s.name,
        "description": s.description,
        "status":      s.status,
        "start_date":  s.start_date,
        "end_date":    s.end_date,
        "slot_count":  len(s.slots),
    }


def _format_slot(slot: ExamSlot) -> dict:
    return {
        "id":           slot.id,
        "paper_id":     slot.paper_id,
        "paper_number": slot.paper.paper_number,
        "subject_id":   slot.paper.subject_id,
        "subject_name": slot.paper.subject.name,
        "subject_color":slot.paper.subject.color_hex,
        "class_id":     slot.class_id,
        "class_name":   slot.class_section.name,
        "day":          slot.day,
        "exam_date":    slot.exam_date,
        "period":       slot.period,
        "duration":     slot.paper.duration_minutes,
        "is_practical": slot.paper.is_practical,
        "invigilator_id":   slot.invigilator_id,
        "invigilator_name": slot.invigilator.name if slot.invigilator else None,
        "room":         slot.room,
        "room_id":      slot.room_id,
        "notes":        slot.notes,
        "is_locked":    slot.is_locked,
    }


# ── Exam Sessions ─────────────────────────────────────────────────────────────

@router.post("/exams/sessions")
def create_session(
    data: SessionCreate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    start = _parse_date(data.start_date, "Start date")
    end   = _parse_date(data.end_date, "End date")
    if start > end:
        raise HTTPException(400, "start_date must be before end_date")
    if not data.name.strip():
        raise HTTPException(400, "Session name is required")

    s = ExamSession(
        name=data.name.strip(),
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _format_session(s)


@router.get("/exams/sessions")
def list_sessions(
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    sessions = db.query(ExamSession).order_by(ExamSession.start_date.desc()).all()
    return [_format_session(s) for s in sessions]


@router.get("/exams/sessions/{session_id}")
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    s = _session_or_404(session_id, db)
    slots = sorted(s.slots, key=lambda sl: (sl.exam_date or "9999", sl.period))
    return {**_format_session(s), "slots": [_format_slot(sl) for sl in slots]}


@router.put("/exams/sessions/{session_id}")
def update_session(
    session_id: str,
    data: SessionUpdate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    s = _session_or_404(session_id, db)
    updates = data.model_dump(exclude_none=True)
    for key in ("start_date", "end_date"):
        if key in updates:
            _parse_date(updates[key], key)
    for field, val in updates.items():
        setattr(s, field, val)
    if s.start_date > s.end_date:
        db.rollback()
        raise HTTPException(400, "start_date must be before end_date")
    db.commit()
    return _format_session(s)


@router.delete("/exams/sessions/{session_id}")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    s = _session_or_404(session_id, db)
    if s.status == "published":
        raise HTTPException(400, "Cannot delete a published session — set to draft first")
    db.delete(s)
    db.commit()
    return {"status": "deleted"}


# ── Exam Papers ───────────────────────────────────────────────────────────────

@router.get("/exams/papers")
def list_all_papers(
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    """Return all papers grouped by subject — used by frontend paper config view."""
    subjects = db.query(Subject).order_by(Subject.name).all()
    result = []
    for subj in subjects:
        papers = (
            db.query(ExamPaper)
            .filter(ExamPaper.subject_id == subj.id)
            .order_by(ExamPaper.paper_number)
            .all()
        )
        result.append({
            "subject_id":   subj.id,
            "subject_name": subj.name,
            "grade_level":  subj.grade_level,
            "color_hex":    subj.color_hex,
            "papers": [
                {
                    "id":           p.id,
                    "paper_number": p.paper_number,
                    "duration":     p.duration_minutes,
                    "is_practical": p.is_practical,
                }
                for p in papers
            ],
        })
    return result


@router.get("/exams/subjects/{subject_id}/papers")
def list_papers(
    subject_id: str,
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj:
        raise HTTPException(404, "Subject not found")
    papers = (
        db.query(ExamPaper)
        .filter(ExamPaper.subject_id == subject_id)
        .order_by(ExamPaper.paper_number)
        .all()
    )
    return [
        {"id": p.id, "paper_number": p.paper_number,
         "duration": p.duration_minutes, "is_practical": p.is_practical}
        for p in papers
    ]


@router.post("/exams/subjects/{subject_id}/papers")
def add_paper(
    subject_id: str,
    data: PaperCreate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj:
        raise HTTPException(404, "Subject not found")

    clash = db.query(ExamPaper).filter(
        ExamPaper.subject_id == subject_id,
        ExamPaper.paper_number == data.paper_number,
    ).first()
    if clash:
        raise HTTPException(409, f"Paper {data.paper_number} already exists for {subj.name}")

    p = ExamPaper(
        subject_id=subject_id,
        paper_number=data.paper_number,
        duration_minutes=data.duration_minutes,
        is_practical=data.is_practical,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {
        "id": p.id, "subject": subj.name,
        "paper_number": p.paper_number,
        "duration": p.duration_minutes,
        "is_practical": p.is_practical,
    }


@router.put("/exams/papers/{paper_id}")
def update_paper(
    paper_id: str,
    data: PaperUpdate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    paper = db.query(ExamPaper).filter(ExamPaper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(paper, field, val)
    db.commit()
    return {"status": "updated", "id": paper.id}


@router.delete("/exams/papers/{paper_id}")
def delete_paper(
    paper_id: str,
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    paper = db.query(ExamPaper).filter(ExamPaper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    db.delete(paper)
    db.commit()
    return {"status": "deleted"}


# ── Exam Slots ────────────────────────────────────────────────────────────────

def _resolve_when(exam_date: Optional[str], day: Optional[str]):
    """Return (exam_date, day-name) from whichever the caller supplied."""
    if exam_date:
        return exam_date, _weekday_name(exam_date)
    if day:
        return None, day
    raise HTTPException(400, "Provide an exam_date (or at least a day)")


def _class_clash(db, session_id, class_id, exam_date, day, period, exclude_id=None):
    q = db.query(ExamSlot).filter(
        ExamSlot.exam_session_id == session_id,
        ExamSlot.class_id == class_id,
        ExamSlot.period == period,
    )
    q = q.filter(ExamSlot.exam_date == exam_date) if exam_date else \
        q.filter(ExamSlot.exam_date.is_(None), ExamSlot.day == day)
    if exclude_id:
        q = q.filter(ExamSlot.id != exclude_id)
    return q.first()


@router.post("/exams/sessions/{session_id}/slots")
def create_slot(
    session_id: str,
    data: SlotCreate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    _session_or_404(session_id, db)
    exam_date, day = _resolve_when(data.exam_date, data.day)

    if _class_clash(db, session_id, data.class_id, exam_date, day, data.period):
        raise HTTPException(409, "Conflict: this class already has an exam at that date/period")

    paper_clash = db.query(ExamSlot).filter(
        ExamSlot.exam_session_id == session_id,
        ExamSlot.class_id        == data.class_id,
        ExamSlot.paper_id        == data.paper_id,
    ).first()
    if paper_clash:
        raise HTTPException(409, "This class already has this paper scheduled")

    slot = ExamSlot(
        exam_session_id=session_id,
        paper_id=data.paper_id,
        class_id=data.class_id,
        day=day,
        exam_date=exam_date,
        period=data.period,
        invigilator_id=data.invigilator_id,
        room=data.room,
        room_id=data.room_id,
        notes=data.notes,
    )
    _sync_room_name(slot, db)
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return _format_slot(slot)


@router.put("/exams/slots/{slot_id}")
def update_slot(
    slot_id: str,
    data:    SlotUpdate,
    db:      Session = Depends(get_db),
    _:       User    = Depends(get_current_user),
):
    slot = _slot_or_404(slot_id, db)

    moving = data.day is not None or data.period is not None or data.exam_date is not None
    if slot.is_locked and moving:
        raise HTTPException(400, "Cannot move a locked slot — unlock it first")

    updates = data.model_dump(exclude_none=True)

    if moving:
        new_date = data.exam_date or slot.exam_date
        new_day  = _weekday_name(new_date) if new_date else (data.day or slot.day)
        new_per  = data.period or slot.period
        if _class_clash(db, slot.exam_session_id, slot.class_id, new_date, new_day, new_per, exclude_id=slot_id):
            raise HTTPException(409, "Conflict: another exam is already at that date/period")
        updates["day"] = new_day
        if new_date:
            updates["exam_date"] = new_date

    for field, val in updates.items():
        setattr(slot, field, val)

    if data.room_id is not None:
        _sync_room_name(slot, db)

    db.commit()
    return _format_slot(slot)


@router.delete("/exams/slots/{slot_id}")
def delete_slot(
    slot_id: str,
    db:      Session = Depends(get_db),
    _:       User    = Depends(get_current_user),
):
    slot = _slot_or_404(slot_id, db)
    if slot.is_locked:
        raise HTTPException(400, "Cannot delete a locked slot — unlock it first")
    db.delete(slot)
    db.commit()
    return {"status": "deleted"}


# ── Planning (shared by /preflight and /generate) ─────────────────────────────

def _build_plan(session: ExamSession, req: GenerateRequest, db: Session, ignore_unlocked: bool):
    """
    Work out WHICH papers each class must sit and on WHICH dates, without
    writing anything. `ignore_unlocked` = pretend unlocked slots are gone
    (used when clear_existing is on).
    """
    subjects = db.query(Subject).filter(Subject.id.in_(req.subject_ids)).all()
    classes = (db.query(ClassSection).filter(ClassSection.id.in_(req.class_ids))
               .order_by(ClassSection.grade_level, ClassSection.name).all())
    if not subjects:
        raise HTTPException(400, "No matching subjects found")
    if not classes:
        raise HTTPException(400, "No matching classes found")

    dates = _exam_dates(session, req.school_days, req.exclude_dates)

    papers_by_subject = defaultdict(list)
    for p in (db.query(ExamPaper)
                .filter(ExamPaper.subject_id.in_([s.id for s in subjects]))
                .order_by(ExamPaper.paper_number).all()):
        papers_by_subject[p.subject_id].append(p)

    allocated = defaultdict(set)
    for a in db.query(ClassAllocation).filter(ClassAllocation.class_id.in_([c.id for c in classes])):
        allocated[a.class_id].add(a.subject_id)

    existing = db.query(ExamSlot).filter(ExamSlot.exam_session_id == session.id).all()
    kept = [sl for sl in existing if not (ignore_unlocked and not sl.is_locked)]
    already = {(sl.class_id, sl.paper_id) for sl in kept}

    def applies(cls, subj) -> bool:
        # 1) If the class has explicit subject allocations, those decide.
        if cls.id in allocated:
            return subj.id in allocated[cls.id]
        # 2) Otherwise match on grade/level label (case-insensitive) and curriculum.
        if _norm(subj.grade_level) != _norm(cls.grade_level):
            return False
        if cls.education_system_id and subj.education_system_id \
                and cls.education_system_id != subj.education_system_id:
            return False
        return True

    no_papers, no_subjects, already_count = set(), [], 0
    work = {}
    for cls in classes:
        items, matched = [], False
        for subj in subjects:
            if not applies(cls, subj):
                continue
            matched = True
            papers = papers_by_subject.get(subj.id, [])
            if not papers:
                no_papers.add(subj.name)
                continue
            for p in papers:
                if (cls.id, p.id) in already:
                    already_count += 1
                else:
                    items.append(p)
        if not matched:
            no_subjects.append(cls.name)
        work[cls.id] = sorted(items, key=lambda p: (p.paper_number, p.subject.name))

    diag = {
        "no_papers": sorted(no_papers),
        "classes_without_subjects": no_subjects,
        "already_scheduled": already_count,
    }
    return subjects, classes, dates, work, kept, diag


# ── Preflight ─────────────────────────────────────────────────────────────────

@router.post("/exams/sessions/{session_id}/preflight")
def preflight(
    session_id: str,
    req: GenerateRequest,
    db:  Session = Depends(get_db),
    _:   User    = Depends(get_current_user),
):
    """Dry run: tells the admin whether generation will fit BEFORE they click it."""
    session = _session_or_404(session_id, db)
    _, classes, dates, work, kept, diag = _build_plan(session, req, db, req.clear_existing)

    per_day = max(1, min(req.max_per_day, req.max_period - req.start_period + 1))
    capacity = len(dates) * per_day

    rows, worst = [], 0
    occupied = defaultdict(int)
    for sl in kept:
        occupied[sl.class_id] += 1
    for cls in classes:
        needed = len(work[cls.id])
        free = max(0, capacity - occupied.get(cls.id, 0))
        rows.append({"class_id": cls.id, "class_name": cls.name, "papers": needed,
                     "capacity": free, "fits": needed <= free})
        worst = max(worst, needed - free)

    issues = []
    if not dates:
        issues.append({"level": "error", "text":
            "No exam dates fall inside the session range for the chosen exam days / exclusions."})
    if diag["no_papers"]:
        issues.append({"level": "warn", "text":
            "No papers configured for: " + ", ".join(diag["no_papers"]) + " (they will be skipped)."})
    if diag["classes_without_subjects"]:
        issues.append({"level": "warn", "text":
            "No matching subjects for class(es): " + ", ".join(diag["classes_without_subjects"]) +
            ". Allocate subjects to the class (Classes page) or make the subject's grade label match the class's."})
    if worst > 0 and dates:
        need_pd = -(-max(r["papers"] for r in rows) // len(dates))
        issues.append({"level": "warn", "text":
            f"Not everything fits: up to {worst} paper(s) per class would be left unscheduled. "
            f"Raise 'exams per day' to {need_pd}, or extend the session dates."})

    sup_count = db.query(Supervisor).filter(Supervisor.is_active == True).count()  # noqa: E712
    room_count = db.query(Room).filter(Room.is_active == True).count()            # noqa: E712
    if req.auto_assign_supervisors and sup_count == 0:
        issues.append({"level": "warn", "text": "Auto-assign supervisors is on but no supervisors exist yet."})
    if req.auto_assign_rooms and room_count == 0:
        issues.append({"level": "warn", "text": "Auto-assign rooms is on but no rooms exist yet."})

    total = sum(r["papers"] for r in rows)
    return {
        "exam_days": len(dates),
        "first_date": dates[0].isoformat() if dates else None,
        "last_date": dates[-1].isoformat() if dates else None,
        "total_papers": total,
        "classes": rows,
        "supervisors": sup_count,
        "rooms": room_count,
        "issues": issues,
        "ready": bool(dates) and total > 0 and not any(i["level"] == "error" for i in issues),
        **diag,
    }


# ── Auto-generation ───────────────────────────────────────────────────────────

@router.post("/exams/sessions/{session_id}/generate")
def generate(
    session_id: str,
    req:        GenerateRequest,
    db:         Session = Depends(get_db),
    _:          User    = Depends(get_current_user),
):
    """
    Balanced exam scheduler (partial results are saved; leftovers are listed).

    1. Work out the papers each class must sit (allocations → grade/curriculum).
    2. Spread them over the real exam dates round-robin, never more than
       `max_per_day` per class per day, always on a free period.
    3. Optionally assign supervisors (availability + daily limit + no
       double-booking) and rooms (capacity, labs for practicals).
    """
    session = _session_or_404(session_id, db)

    if req.clear_existing:
        db.query(ExamSlot).filter(
            ExamSlot.exam_session_id == session_id,
            ExamSlot.is_locked == False,  # noqa: E712
        ).delete(synchronize_session=False)
        db.flush()

    subjects, classes, dates, work, kept, diag = _build_plan(session, req, db, False)

    total_items = sum(len(v) for v in work.values())
    if not dates:
        raise HTTPException(
            400, "No exam dates fall inside the session's date range for the chosen exam days.")
    if total_items == 0:
        hints = []
        if diag["no_papers"]:
            hints.append("no papers configured for " + ", ".join(diag["no_papers"]))
        if diag["classes_without_subjects"]:
            hints.append("no subjects match class(es) " + ", ".join(diag["classes_without_subjects"]))
        if diag["already_scheduled"]:
            hints.append("everything selected is already scheduled")
        db.commit()
        return {"status": "nothing_to_schedule", "slots_created": 0,
                "message": "Nothing to schedule — " + ("; ".join(hints) or "no eligible papers") + ".",
                **diag}

    # class_id -> date -> set(periods) already used (locked / kept slots)
    occupied = defaultdict(set)
    for sl in kept:
        if sl.exam_date:
            occupied[(sl.class_id, sl.exam_date)].add(sl.period)

    new_slots, unscheduled = [], []
    for cls in classes:
        ptr = 0
        for paper in work[cls.id]:
            placed = False
            for step in range(len(dates)):
                d = dates[(ptr + step) % len(dates)]
                iso = d.isoformat()
                taken = occupied[(cls.id, iso)]
                if len(taken) >= req.max_per_day:
                    continue
                period = req.start_period
                while period in taken:
                    period += 1
                if period > req.max_period:
                    continue
                taken.add(period)
                new_slots.append(ExamSlot(
                    exam_session_id=session_id, paper_id=paper.id, class_id=cls.id,
                    day=d.strftime("%A"), exam_date=iso, period=period,
                ))
                ptr = (ptr + step + 1) % len(dates)
                placed = True
                break
            if not placed:
                unscheduled.append(f"{paper.subject.name} Paper {paper.paper_number} — {cls.name}")

    sup_assigned = room_assigned = 0
    if new_slots and (req.auto_assign_supervisors or req.auto_assign_rooms):
        sup_assigned, room_assigned = _auto_assign(new_slots, kept, classes, req, db)

    for sl in new_slots:
        db.add(sl)
    db.commit()

    msg = f"Scheduled {len(new_slots)} exam slot(s) across {len(dates)} exam day(s)"
    if unscheduled:
        msg += f" — {len(unscheduled)} could not fit"
    return {
        "status":        "generated" if new_slots else "nothing_to_schedule",
        "slots_created": len(new_slots),
        "unscheduled_count": len(unscheduled),
        "unscheduled":   unscheduled[:25],
        "supervisors_assigned": sup_assigned,
        "rooms_assigned": room_assigned,
        "exam_days": len(dates),
        "message": msg,
        **diag,
    }


def _auto_assign(new_slots, kept, classes, req: GenerateRequest, db: Session):
    """Give each new slot a supervisor and/or room without double-booking."""
    cls_map = {c.id: c for c in classes}
    paper_map = {p.id: p for p in db.query(ExamPaper)
                 .filter(ExamPaper.id.in_({s.paper_id for s in new_slots})).all()}

    sup_busy, sup_day, sup_total = set(), defaultdict(int), defaultdict(int)
    room_busy = set()
    for sl in kept:
        key = _when(sl)
        if sl.invigilator_id:
            sup_busy.add((sl.invigilator_id, key, sl.period))
            sup_day[(sl.invigilator_id, key)] += 1
            sup_total[sl.invigilator_id] += 1
        if sl.room_id:
            room_busy.add((sl.room_id, key, sl.period))

    sups = db.query(Supervisor).filter(Supervisor.is_active == True).all()   # noqa: E712
    rooms = db.query(Room).filter(Room.is_active == True).all()              # noqa: E712

    sup_n = room_n = 0
    for sl in sorted(new_slots, key=lambda s: (s.exam_date or "", s.period)):
        key = _when(sl)
        if req.auto_assign_supervisors and sups:
            cands = [
                s for s in sups
                if (not s.availability or sl.day in [d.strip() for d in s.availability.split(",")])
                and (s.id, key, sl.period) not in sup_busy
                and sup_day[(s.id, key)] < (s.max_sessions or 3)
            ]
            if cands:
                pick = min(cands, key=lambda s: sup_total[s.id])
                sl.invigilator_id = pick.id
                sup_busy.add((pick.id, key, sl.period))
                sup_day[(pick.id, key)] += 1
                sup_total[pick.id] += 1
                sup_n += 1
        if req.auto_assign_rooms and rooms:
            need = (cls_map[sl.class_id].capacity or 40) if sl.class_id in cls_map else 40
            practical = bool(paper_map.get(sl.paper_id) and paper_map[sl.paper_id].is_practical)
            free = [r for r in rooms if (r.id, key, sl.period) not in room_busy]
            fit = [r for r in free if (r.capacity or 0) >= need]
            if practical:
                labs = [r for r in fit if "lab" in f"{r.name} {r.equipment or ''}".lower()]
                fit = labs or fit
            if fit:
                pick = min(fit, key=lambda r: r.capacity or 0)   # smallest room that fits
                sl.room_id, sl.room = pick.id, pick.name
                room_busy.add((pick.id, key, sl.period))
                room_n += 1
    return sup_n, room_n


# ── Validation report ─────────────────────────────────────────────────────────

@router.get("/exams/sessions/{session_id}/validate")
def validate_session(
    session_id: str,
    db: Session = Depends(get_db),
    _:  User    = Depends(get_current_user),
):
    """Return a list of conflicts/warnings for the session."""
    s = _session_or_404(session_id, db)
    errors: list[str] = []
    warnings: list[str] = []

    invig, rooms, per_day = defaultdict(list), defaultdict(list), defaultdict(int)
    for sl in s.slots:
        key = _when(sl)
        if sl.invigilator_id:
            invig[(sl.invigilator_id, key, sl.period)].append(sl)
            per_day[(sl.invigilator_id, key)] += 1
        if sl.room_id:
            rooms[(sl.room_id, key, sl.period)].append(sl)

    for (_sid, key, period), clashing in invig.items():
        if len(clashing) > 1:
            errors.append(f"Invigilator '{clashing[0].invigilator.name}' is assigned to "
                          f"{len(clashing)} exams on {key} period {period}")
    for (_rid, key, period), clashing in rooms.items():
        if len(clashing) > 1:
            errors.append(f"Room '{clashing[0].room}' is used by {len(clashing)} exams on {key} period {period}")

    sup_cache = {sp.id: sp for sp in db.query(Supervisor).all()}
    for (sid, key), n in per_day.items():
        sp = sup_cache.get(sid)
        if sp and sp.max_sessions and n > sp.max_sessions:
            warnings.append(f"{sp.name} has {n} sessions on {key} (limit {sp.max_sessions})")
    for sl in s.slots:
        sp = sup_cache.get(sl.invigilator_id) if sl.invigilator_id else None
        if sp and sp.availability and sl.day not in [d.strip() for d in sp.availability.split(",")]:
            warnings.append(f"{sp.name} is not normally available on {sl.day} ({_when(sl)})")

    without_invig = [sl for sl in s.slots if not sl.invigilator_id]
    if without_invig:
        warnings.append(f"{len(without_invig)} exam slot(s) have no invigilator assigned")
    without_room = [sl for sl in s.slots if not sl.room]
    if without_room:
        warnings.append(f"{len(without_room)} exam slot(s) have no room assigned")

    return {
        "valid":    len(errors) == 0,
        "errors":   errors,
        "warnings": list(dict.fromkeys(warnings)),
        "total_slots": len(s.slots),
    }
