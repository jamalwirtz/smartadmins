"""SSTG – Subjects API routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Subject
from schemas import SubjectCreate, SubjectUpdate
from security import get_current_user, require_admin

router = APIRouter()


def _fmt(s: Subject) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "subject_code": s.subject_code,
        "grade_level": s.grade_level,
        "weekly_periods": s.weekly_periods,
        "allows_double_period": s.allows_double_period,
        "is_static_eligible": s.is_static_eligible,
        "color_hex": s.color_hex,
        "education_system_id": s.education_system_id,
    }


@router.get("")
def list_subjects(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Subject).order_by(Subject.grade_level, Subject.name).all()
    return [_fmt(s) for s in rows]


@router.post("", status_code=201)
def create_subject(req: SubjectCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = Subject(**req.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "subject_code": s.subject_code, "message": "Subject created"}


@router.get("/{subject_id}")
def get_subject(subject_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.get(Subject, subject_id)
    if not s:
        raise HTTPException(404, "Subject not found")
    return _fmt(s)


@router.put("/{subject_id}")
def update_subject(subject_id: str, req: SubjectUpdate,
                   db: Session = Depends(get_db), _=Depends(require_admin)):
    s = db.get(Subject, subject_id)
    if not s:
        raise HTTPException(404, "Subject not found")
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    return {"message": "Updated"}


@router.delete("/{subject_id}")
def delete_subject(subject_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = db.get(Subject, subject_id)
    if not s:
        raise HTTPException(404, "Subject not found")
    db.delete(s)
    db.commit()
    return {"message": "Deleted"}
