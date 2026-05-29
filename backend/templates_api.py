"""
SSTG — Starter templates for timetable and exam scheduling.

Templates are lightweight JSON blueprints. Applying one pre-fills
the generate dialog with sensible defaults so admins don't start blank.
"""
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from security import get_current_user
from models import (
    User, ExamSession, ExamPaper, ClassSection,
    Subject, TimetableDraft,
)

router = APIRouter(tags=["Templates"])


# ── Built-in template definitions ─────────────────────────────────────────────

TIMETABLE_TEMPLATES = [
    {
        "id": "standard_5day",
        "name": "Standard 5-Day Week",
        "description": "Even distribution across Mon–Fri, 8 periods per day. Each subject gets equal slots.",
        "icon": "📅",
        "config": {
            "draft_count": 3,
            "school_days": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
            "periods_per_day": 8,
            "strategy": "balanced",
            "notes": "Best for most secondary schools with fixed timetables.",
        },
    },
    {
        "id": "block_schedule",
        "name": "Block Schedule",
        "description": "4 long periods per day (double periods). Fewer subjects daily but deeper learning.",
        "icon": "🧱",
        "config": {
            "draft_count": 3,
            "school_days": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
            "periods_per_day": 4,
            "strategy": "block",
            "notes": "Ideal for project-based or lab-heavy curricula.",
        },
    },
    {
        "id": "half_day",
        "name": "Half-Day Schedule",
        "description": "4 periods per day, mornings only. Good for exam preparation periods.",
        "icon": "🌤️",
        "config": {
            "draft_count": 2,
            "school_days": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
            "periods_per_day": 4,
            "strategy": "balanced",
            "notes": "Use during exam revision weeks.",
        },
    },
    {
        "id": "four_day_week",
        "name": "4-Day Week",
        "description": "Monday–Thursday, 8 periods each. Fridays free for activities or catch-up.",
        "icon": "4️⃣",
        "config": {
            "draft_count": 3,
            "school_days": ["Monday","Tuesday","Wednesday","Thursday"],
            "periods_per_day": 8,
            "strategy": "balanced",
            "notes": "Popular for primary schools or enrichment programs.",
        },
    },
    {
        "id": "rotating_ab",
        "name": "A/B Rotating Days",
        "description": "Alternating Day A and Day B, 6 periods each. Spreads subjects across fortnight.",
        "icon": "🔄",
        "config": {
            "draft_count": 3,
            "school_days": ["Day A Mon","Day A Wed","Day A Fri","Day B Tue","Day B Thu"],
            "periods_per_day": 6,
            "strategy": "rotating",
            "notes": "Good for large secondary schools with many subjects.",
        },
    },
]

EXAM_TEMPLATES = [
    {
        "id": "end_of_term",
        "name": "End of Term Exams",
        "description": "Full exam period for all subjects. 2 weeks, one paper per day per class.",
        "icon": "🎓",
        "config": {
            "duration_days": 10,
            "max_per_day": 1,
            "papers_per_subject": 2,
            "start_period": 1,
            "school_days": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
            "suggested_name": "End of Term Exams",
        },
    },
    {
        "id": "midterm_mock",
        "name": "Mid-Term Mock Exams",
        "description": "Lighter exam session. 1 week, core subjects only, single papers.",
        "icon": "📝",
        "config": {
            "duration_days": 5,
            "max_per_day": 1,
            "papers_per_subject": 1,
            "start_period": 1,
            "school_days": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
            "suggested_name": "Mid-Term Mock Exams",
        },
    },
    {
        "id": "final_exams",
        "name": "Final Year Exams",
        "description": "Intensive exam period for final year classes. 3 weeks, up to 3 papers per subject.",
        "icon": "🏆",
        "config": {
            "duration_days": 15,
            "max_per_day": 1,
            "papers_per_subject": 3,
            "start_period": 1,
            "school_days": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
            "suggested_name": "Final Year Exams",
        },
    },
    {
        "id": "practicals",
        "name": "Practical Exams Only",
        "description": "Lab and practical assessments. 3 days, small groups, long slots.",
        "icon": "🔬",
        "config": {
            "duration_days": 3,
            "max_per_day": 2,
            "papers_per_subject": 1,
            "start_period": 1,
            "school_days": ["Monday","Tuesday","Wednesday"],
            "practical_only": True,
            "suggested_name": "Practical Assessments",
        },
    },
    {
        "id": "diagnostic",
        "name": "Diagnostic Assessment",
        "description": "Quick baseline test. 2 days, all subjects, 45-minute papers.",
        "icon": "🩺",
        "config": {
            "duration_days": 2,
            "max_per_day": 3,
            "papers_per_subject": 1,
            "duration_minutes": 45,
            "start_period": 1,
            "school_days": ["Monday","Tuesday"],
            "suggested_name": "Diagnostic Assessment",
        },
    },
]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/templates/timetable")
def list_timetable_templates(_: User = Depends(get_current_user)):
    """Return all built-in timetable starter templates."""
    return TIMETABLE_TEMPLATES


@router.get("/templates/exam")
def list_exam_templates(_: User = Depends(get_current_user)):
    """Return all built-in exam starter templates."""
    return EXAM_TEMPLATES


@router.get("/templates/timetable/{template_id}")
def get_timetable_template(template_id: str, _: User = Depends(get_current_user)):
    t = next((t for t in TIMETABLE_TEMPLATES if t["id"] == template_id), None)
    if not t:
        raise HTTPException(404, "Template not found")
    return t


@router.get("/templates/exam/{template_id}")
def get_exam_template(template_id: str, _: User = Depends(get_current_user)):
    t = next((t for t in EXAM_TEMPLATES if t["id"] == template_id), None)
    if not t:
        raise HTTPException(404, "Template not found")
    return t


class ApplyExamTemplate(BaseModel):
    template_id: str
    session_name: Optional[str] = None
    start_date:   str            # "2024-06-01"
    end_date:     str
    class_ids:    List[str]
    subject_ids:  Optional[List[str]] = None  # None = all subjects


@router.post("/templates/exam/apply")
def apply_exam_template(
    body: ApplyExamTemplate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(get_current_user),
):
    """
    Create an ExamSession and configure papers for all selected subjects
    based on the chosen template. Returns the new session ID and a
    pre-filled generate payload ready to POST to /exams/sessions/{id}/generate.
    """
    t = next((x for x in EXAM_TEMPLATES if x["id"] == body.template_id), None)
    if not t:
        raise HTTPException(404, "Template not found")

    cfg = t["config"]

    # 1. Create the session
    from models import ExamSession
    name = body.session_name or cfg.get("suggested_name", t["name"])
    session = ExamSession(
        name=name,
        description=t["description"],
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(session)
    db.flush()

    # 2. Auto-configure papers for all selected subjects
    subjects = (
        db.query(Subject).filter(Subject.id.in_(body.subject_ids)).all()
        if body.subject_ids
        else db.query(Subject).all()
    )

    papers_per_subject = cfg.get("papers_per_subject", 1)
    duration           = cfg.get("duration_minutes", 120)
    practical_only     = cfg.get("practical_only", False)

    papers_added = 0
    for subj in subjects:
        for num in range(1, papers_per_subject + 1):
            # Skip if already exists
            exists = db.query(ExamPaper).filter(
                ExamPaper.subject_id == subj.id,
                ExamPaper.paper_number == num,
            ).first()
            if not exists:
                db.add(ExamPaper(
                    subject_id=subj.id,
                    paper_number=num,
                    duration_minutes=duration,
                    is_practical=practical_only,
                ))
                papers_added += 1

    db.commit()

    # 3. Return pre-filled generate payload for the frontend
    return {
        "session_id":   session.id,
        "session_name": session.name,
        "papers_added": papers_added,
        "generate_payload": {
            "subject_ids":  [s.id for s in subjects],
            "class_ids":    body.class_ids,
            "start_period": cfg.get("start_period", 1),
            "max_per_day":  cfg.get("max_per_day", 1),
            "school_days":  cfg.get("school_days",
                            ["Monday","Tuesday","Wednesday","Thursday","Friday"]),
        },
    }
