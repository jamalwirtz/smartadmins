"""
SSTG — Class Allocation API
============================
Manages which teacher is assigned to teach each subject in each class.
Status is automatically:
  - 'assigned' when a teacher is linked
  - 'pending'  when no teacher is set yet
"""
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user
from models import (
    User, ClassAllocation, ClassSection,
    Subject, Teacher, TeacherSubject
)

router = APIRouter(tags=["Allocations"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AllocateSubjectsBody(BaseModel):
    """Assign subjects (and optionally teachers) to a class in one call."""
    subject_ids: List[str]
    teacher_map: dict = {}        # {subject_id: teacher_id | ""}  — optional


class UpdateAllocation(BaseModel):
    teacher_id: Optional[str] = None   # None/empty = set to pending


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(a: ClassAllocation) -> dict:
    return {
        "id":           a.id,
        "class_id":     a.class_id,
        "class_name":   a.class_section.name,
        "subject_id":   a.subject_id,
        "subject_name": a.subject.name,
        "subject_color":a.subject.color_hex,
        "teacher_id":   a.teacher_id,
        "teacher_name": a.teacher.name if a.teacher else None,
        "status":       a.status,
        "notes":        a.notes,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/allocations/pending")
def list_pending(db: Session = Depends(get_db),
                 _:  User    = Depends(get_current_user)):
    """Return all allocations with status = 'pending'. Used by dashboard widget."""
    rows = (db.query(ClassAllocation)
              .filter(ClassAllocation.status == "pending")
              .order_by(ClassAllocation.class_id)
              .all())
    return [_fmt(a) for a in rows]


@router.get("/allocations")
def list_all(class_id:   Optional[str] = None,
             subject_id: Optional[str] = None,
             status:     Optional[str] = None,
             db: Session = Depends(get_db),
             _:  User    = Depends(get_current_user)):
    q = db.query(ClassAllocation)
    if class_id:   q = q.filter(ClassAllocation.class_id   == class_id)
    if subject_id: q = q.filter(ClassAllocation.subject_id == subject_id)
    if status:     q = q.filter(ClassAllocation.status     == status)
    return [_fmt(a) for a in q.all()]


@router.get("/classes/{class_id}/allocations")
def class_allocations(class_id: str,
                      db: Session = Depends(get_db),
                      _:  User    = Depends(get_current_user)):
    """All subject-teacher allocations for a specific class."""
    cls = db.query(ClassSection).filter(ClassSection.id == class_id).first()
    if not cls: raise HTTPException(404, "Class not found")
    rows = db.query(ClassAllocation).filter(ClassAllocation.class_id == class_id).all()
    return {
        "class_id":   class_id,
        "class_name": cls.name,
        "allocations": [_fmt(a) for a in rows],
        "pending_count":   sum(1 for a in rows if a.status == "pending"),
        "assigned_count":  sum(1 for a in rows if a.status == "assigned"),
    }


@router.post("/classes/{class_id}/allocations")
def save_allocations(class_id: str,
                     body: AllocateSubjectsBody,
                     db:   Session = Depends(get_db),
                     _:    User    = Depends(get_current_user)):
    """
    Create or update allocations for a class.
    Supports partial teacher assignment — subjects without a teacher
    are saved with status='pending' so the admin can fill them later.
    """
    cls = db.query(ClassSection).filter(ClassSection.id == class_id).first()
    if not cls: raise HTTPException(404, "Class not found")

    saved, pending = 0, 0

    for sid in body.subject_ids:
        subj = db.query(Subject).filter(Subject.id == sid).first()
        if not subj: continue

        teacher_id = body.teacher_map.get(sid) or None
        status     = "assigned" if teacher_id else "pending"

        # Upsert — update existing or create new
        existing = db.query(ClassAllocation).filter(
            ClassAllocation.class_id   == class_id,
            ClassAllocation.subject_id == sid,
        ).first()

        if existing:
            existing.teacher_id = teacher_id
            existing.status     = status
        else:
            db.add(ClassAllocation(
                class_id=class_id, subject_id=sid,
                teacher_id=teacher_id, status=status,
            ))

        if status == "assigned": saved  += 1
        else:                    pending += 1

    db.commit()
    return {
        "status":        "saved",
        "assigned_count": saved,
        "pending_count":  pending,
        "message": (
            f"{saved} subject(s) assigned. "
            f"{pending} pending — assign teachers from the dashboard."
            if pending else f"All {saved} subject(s) fully assigned."
        ),
    }


@router.put("/allocations/{allocation_id}")
def update_allocation(allocation_id: str,
                      body: UpdateAllocation,
                      db:   Session = Depends(get_db),
                      _:    User    = Depends(get_current_user)):
    """Assign or remove a teacher from a single allocation."""
    alloc = db.query(ClassAllocation).filter(
        ClassAllocation.id == allocation_id
    ).first()
    if not alloc: raise HTTPException(404, "Allocation not found")

    alloc.teacher_id = body.teacher_id or None
    alloc.status     = "assigned" if alloc.teacher_id else "pending"
    db.commit()
    return _fmt(alloc)


@router.delete("/allocations/{allocation_id}")
def delete_allocation(allocation_id: str,
                      db:   Session = Depends(get_db),
                      _:    User    = Depends(get_current_user)):
    alloc = db.query(ClassAllocation).filter(ClassAllocation.id == allocation_id).first()
    if not alloc: raise HTTPException(404, "Not found")
    db.delete(alloc); db.commit()
    return {"status": "deleted"}


@router.get("/allocations/stats")
def allocation_stats(db: Session = Depends(get_db),
                     _:  User    = Depends(get_current_user)):
    """Summary counts used by the dashboard."""
    total    = db.query(ClassAllocation).count()
    assigned = db.query(ClassAllocation).filter(ClassAllocation.status=="assigned").count()
    pending  = total - assigned
    return {
        "total":    total,
        "assigned": assigned,
        "pending":  pending,
        "pct":      round(assigned/total*100) if total else 0,
    }
