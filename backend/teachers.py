"""SSTG – Teachers API routes."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Teacher, TeacherSubject, TimetableSlot, Subject, ClassSection
from schemas import TeacherCreate, TeacherUpdate, SubjectAssignRequest
from security import get_current_user, require_admin

router = APIRouter()


def _teacher_out(t: Teacher):
    return {
        "id": t.id, "name": t.name, "email": t.email,
        "is_part_time": t.is_part_time, "max_weekly_hours": t.max_weekly_hours,
        "days_off": t.days_off, "unavailable_slots": t.unavailable_slots,
        "subject_ids": [ts.subject_id for ts in t.subjects],
    }


@router.get("")
def list_teachers(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_teacher_out(t) for t in db.query(Teacher).order_by(Teacher.name).all()]


@router.post("", status_code=201)
def create_teacher(req: TeacherCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    t = Teacher(**req.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "name": t.name, "message": "Teacher created"}


@router.get("/{teacher_id}")
def get_teacher(teacher_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.get(Teacher, teacher_id)
    if not t:
        raise HTTPException(404, "Teacher not found")
    return _teacher_out(t)


@router.put("/{teacher_id}")
def update_teacher(teacher_id: str, req: TeacherUpdate,
                   db: Session = Depends(get_db), _=Depends(require_admin)):
    t = db.get(Teacher, teacher_id)
    if not t:
        raise HTTPException(404, "Teacher not found")
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    db.commit()
    return {"message": "Updated", "id": t.id}


@router.delete("/{teacher_id}")
def delete_teacher(teacher_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    t = db.get(Teacher, teacher_id)
    if not t:
        raise HTTPException(404, "Teacher not found")
    db.delete(t)
    db.commit()
    return {"message": "Deleted"}


@router.post("/{teacher_id}/subjects")
def assign_subjects(teacher_id: str, req: SubjectAssignRequest,
                    db: Session = Depends(get_db), _=Depends(require_admin)):
    t = db.get(Teacher, teacher_id)
    if not t:
        raise HTTPException(404, "Teacher not found")
    db.query(TeacherSubject).filter(TeacherSubject.teacher_id == teacher_id).delete()
    for sid in req.subject_ids:
        db.add(TeacherSubject(teacher_id=teacher_id, subject_id=sid))
    db.commit()
    return {"message": f"Assigned {len(req.subject_ids)} subject(s)"}


@router.get("/{teacher_id}/schedule")
def teacher_schedule(teacher_id: str, draft_id: str,
                     db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.get(Teacher, teacher_id)
    if not t:
        raise HTTPException(404, "Teacher not found")

    slots = (
        db.query(TimetableSlot)
        .filter(TimetableSlot.draft_id == draft_id, TimetableSlot.teacher_id == teacher_id)
        .all()
    )
    subj_map = {s.id: s.name for s in db.query(Subject).all()}
    cls_map = {c.id: c.name for c in db.query(ClassSection).all()}

    schedule = sorted([
        {
            "day": s.day, "period": s.period,
            "class": cls_map.get(s.class_id, "?"),
            "subject": subj_map.get(s.subject_id, "?"),
            "is_locked": s.is_locked,
        }
        for s in slots
    ], key=lambda x: (x["day"], x["period"]))

    return {
        "teacher": t.name,
        "email": t.email,
        "total_periods": len(slots),
        "max_weekly_hours": t.max_weekly_hours,
        "remaining_capacity": t.max_weekly_hours - len(slots),
        "schedule": schedule,
    }
