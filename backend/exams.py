"""
SSTG — Exam scheduling API
===========================
Manages exam sessions, papers per subject, and generates
conflict-free, load-balanced exam timetables.
"""
from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db
from security import get_current_user
from models import (
    ExamSession, ExamPaper, ExamSlot,
    Subject, ClassSection, Teacher, User,
)

router = APIRouter(tags=["Exams"])


# ── Local Pydantic schemas (kept in this file to avoid circular imports) ──────

class SessionCreate(BaseModel):
    name:        str
    description: Optional[str] = None
    start_date:  str = Field(..., example="2024-06-01")
    end_date:    str = Field(..., example="2024-06-30")


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
    day:            str
    period:         int  = Field(..., ge=1)
    invigilator_id: Optional[str] = None
    room:           Optional[str] = None
    notes:          Optional[str] = None


class SlotUpdate(BaseModel):
    day:            Optional[str] = None
    period:         Optional[int] = Field(None, ge=1)
    invigilator_id: Optional[str] = None
    room:           Optional[str] = None
    is_locked:      Optional[bool] = None
    notes:          Optional[str] = None


class GenerateRequest(BaseModel):
    subject_ids:   List[str] = Field(..., min_length=1)
    class_ids:     List[str] = Field(..., min_length=1)
    start_period:  int  = Field(1, ge=1)
    max_per_day:   int  = Field(1, ge=1, le=4, description="Max exams per class per day")
    school_days:   List[str] = Field(
        default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    )


# ── helpers ───────────────────────────────────────────────────────────────────

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
        "period":       slot.period,
        "duration":     slot.paper.duration_minutes,
        "is_practical": slot.paper.is_practical,
        "invigilator_id":   slot.invigilator_id,
        "invigilator_name": slot.invigilator.name if slot.invigilator else None,
        "room":         slot.room,
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
    if data.start_date > data.end_date:
        raise HTTPException(400, "start_date must be before end_date")

    s = ExamSession(
        name=data.name,
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
    return {**_format_session(s), "slots": [_format_slot(sl) for sl in s.slots]}


@router.put("/exams/sessions/{session_id}")
def update_session(
    session_id: str,
    data: SessionUpdate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    s = _session_or_404(session_id, db)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(s, field, val)
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

@router.post("/exams/sessions/{session_id}/slots")
def create_slot(
    session_id: str,
    data: SlotCreate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    _session_or_404(session_id, db)

    # Class time conflict
    time_clash = db.query(ExamSlot).filter(
        ExamSlot.exam_session_id == session_id,
        ExamSlot.class_id        == data.class_id,
        ExamSlot.day             == data.day,
        ExamSlot.period          == data.period,
    ).first()
    if time_clash:
        raise HTTPException(409, "Conflict: this class already has an exam at that day/period")

    # Same paper, same class twice
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
        day=data.day,
        period=data.period,
        invigilator_id=data.invigilator_id,
        room=data.room,
        notes=data.notes,
    )
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

    # Locked slot protection — only allow locking/unlocking + non-position changes
    moving = data.day is not None or data.period is not None
    if slot.is_locked and moving:
        raise HTTPException(400, "Cannot move a locked slot — unlock it first")

    # Check time conflict if moving
    if moving:
        new_day    = data.day    or slot.day
        new_period = data.period or slot.period
        clash = db.query(ExamSlot).filter(
            ExamSlot.exam_session_id == slot.exam_session_id,
            ExamSlot.class_id        == slot.class_id,
            ExamSlot.day             == new_day,
            ExamSlot.period          == new_period,
            ExamSlot.id              != slot_id,
        ).first()
        if clash:
            raise HTTPException(409, "Conflict: another exam is already at that day/period")

    for field, val in data.model_dump(exclude_none=True).items():
        setattr(slot, field, val)
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


# ── Auto-generation ───────────────────────────────────────────────────────────

@router.post("/exams/sessions/{session_id}/generate")
def generate(
    session_id: str,
    req:        GenerateRequest,
    db:         Session = Depends(get_db),
    _:          User    = Depends(get_current_user),
):
    """
    Balanced exam scheduler.

    Algorithm:
    1. Collect all (paper, class) pairs that need scheduling.
    2. Build a day-load tracker per class so no class gets > max_per_day exams/day.
    3. Round-robin across days, incrementing the day pointer per class.
    4. Skip slots already occupied; if all days full for a class → raise 409.
    5. Commit everything at once — either all succeed or nothing is written.
    """
    _session_or_404(session_id, db)

    subjects = (
        db.query(Subject)
        .filter(Subject.id.in_(req.subject_ids))
        .all()
    )
    classes = (
        db.query(ClassSection)
        .filter(ClassSection.id.in_(req.class_ids))
        .all()
    )

    if not subjects:
        raise HTTPException(400, "No matching subjects found")
    if not classes:
        raise HTTPException(400, "No matching classes found")

    # Gather papers sorted so Paper 1 always comes before Paper 2, etc.
    work_items: list[tuple] = []  # (paper, class_section)
    for subj in subjects:
        papers = (
            db.query(ExamPaper)
            .filter(ExamPaper.subject_id == subj.id)
            .order_by(ExamPaper.paper_number)
            .all()
        )
        if not papers:
            continue
        for cls in classes:
            for paper in papers:
                # Skip already-scheduled (paper, class) pairs
                already = db.query(ExamSlot).filter(
                    ExamSlot.exam_session_id == session_id,
                    ExamSlot.paper_id        == paper.id,
                    ExamSlot.class_id        == cls.id,
                ).first()
                if not already:
                    work_items.append((paper, cls))

    if not work_items:
        return {"status": "nothing_to_schedule",
                "message": "All selected papers are already scheduled"}

    # day-load: class_id → {day → count}
    existing_slots = db.query(ExamSlot).filter(
        ExamSlot.exam_session_id == session_id
    ).all()
    day_load: dict[str, dict[str, int]] = {}
    for sl in existing_slots:
        day_load.setdefault(sl.class_id, {})
        day_load[sl.class_id][sl.day] = day_load[sl.class_id].get(sl.day, 0) + 1

    days = req.school_days
    # Rotating day pointer per class so each class's exams spread evenly
    day_ptr: dict[str, int] = {cls.id: 0 for cls in classes}

    new_slots: list[ExamSlot] = []

    for paper, cls in work_items:
        scheduled = False
        attempts   = 0
        ptr        = day_ptr[cls.id]

        while attempts < len(days):
            day = days[ptr % len(days)]

            # Check max_per_day limit
            current_load = day_load.get(cls.id, {}).get(day, 0)
            if current_load < req.max_per_day:
                new_slots.append(ExamSlot(
                    exam_session_id=session_id,
                    paper_id=paper.id,
                    class_id=cls.id,
                    day=day,
                    period=req.start_period,
                ))
                # Update day_load immediately so next iteration sees it
                day_load.setdefault(cls.id, {})[day] = current_load + 1
                ptr += 1
                scheduled = True
                break

            ptr     += 1
            attempts += 1

        if not scheduled:
            raise HTTPException(
                409,
                f"Cannot schedule {paper.subject.name} Paper {paper.paper_number} "
                f"for class {cls.name} — all days are full. "
                f"Increase exam period length or reduce papers per subject."
            )

        day_ptr[cls.id] = ptr

    for sl in new_slots:
        db.add(sl)
    db.commit()

    return {
        "status":        "generated",
        "slots_created": len(new_slots),
        "message":       f"Scheduled {len(new_slots)} exam slots across {len(days)} days",
    }


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

    # Check for invigilator double-booking
    from collections import defaultdict
    invig_map: dict = defaultdict(list)
    for sl in s.slots:
        if sl.invigilator_id:
            invig_map[(sl.invigilator_id, sl.day, sl.period)].append(sl)

    for key, clashing in invig_map.items():
        if len(clashing) > 1:
            teacher = clashing[0].invigilator.name
            errors.append(
                f"Invigilator '{teacher}' assigned to {len(clashing)} exams "
                f"on {key[1]} period {key[2]}"
            )

    # Papers without invigilators
    without_invig = [sl for sl in s.slots if not sl.invigilator_id]
    if without_invig:
        warnings.append(f"{len(without_invig)} exam slot(s) have no invigilator assigned")

    # Papers without rooms
    without_room = [sl for sl in s.slots if not sl.room]
    if without_room:
        warnings.append(f"{len(without_room)} exam slot(s) have no room assigned")

    return {
        "valid":    len(errors) == 0,
        "errors":   errors,
        "warnings": warnings,
        "total_slots": len(s.slots),
    }
